import http from 'node:http';
import { DATETIME, LogsWithTime, SendTG, Sleep, LogInBackground } from './utility.js';
import { HandleUnreadGmails } from './handleUnreadGmails.js';
import { HandleTradeBot, HandleAllPrice, CV } from './handleTV.js';
import { HandleTgBot } from './handleTgBot.js';

// 最多保留100个队列任务
const MaxWaitingSignalQty = 100 ;
const SignalList = [] ; // 里面的元素是 {url, body}
function AddNewSignal(sigObj) {
    SignalList.push(sigObj) ;
    while (SignalList.length > MaxWaitingSignalQty) {SignalList.shift()}
}

const MaxRunningTasks = 10;
const handleSignalInterval = 1 * 1000;
let lastHandleSignalTime = new DATETIME(0);
const checkEmailInterval = 10 * 60 * 1000;
let lastCheckEmailTime = new DATETIME(0);
let isWorkerRunning = false; 
// 我的目的是让信号一个一个地处理, 从最新的信号开始处理
// 并发处理, 两个信号处理，至少间隔1s
async function HandleSignalList() {
    if (isWorkerRunning) { return }
    LogInBackground('... ... 新工人开始处理队列任务');
    isWorkerRunning = true;

    let runningTasks = 0 ;
    let taskNumber = 0;
    while (runningTasks > 0 || SignalList.length > 0) {
        if (lastHandleSignalTime.HowLongToNOW() > handleSignalInterval && SignalList.length > 0 && runningTasks < MaxRunningTasks) {
            lastHandleSignalTime.UpdateTime()  ;
            taskNumber += 1;
            runningTasks += 1 ;
            const toHandleSignal = SignalList.pop() ;
            LogInBackground(`... ... 开始处理第${taskNumber}个任务，共有${runningTasks}个任务同时运行，任务队列中尚有${SignalList.length}个信号等待处理`) ;
            HandleSignal(toHandleSignal)
                .finally(() => {
                    toHandleSignal.thisLogs.consoleLogs() ;
                    runningTasks -= 1;
                });
        }
        
        if (lastCheckEmailTime.HowLongToNOW() > checkEmailInterval) {
            lastCheckEmailTime.UpdateTime();
            taskNumber += 1 ;
            runningTasks += 1 ;
            LogInBackground(`... ... 开始处理未读邮件, 设为第${taskNumber}个任务，共有${runningTasks}个任务同时运行，任务队列中尚有${SignalList.length}个信号等待处理`) ;
            const checkUnreadEmailsLogs = new LogsWithTime('处理Gmail未读邮件', 'onlyErr') ;
            checkUnreadEmailsLogs.AddNewLogLine(`开始检查处理Gmail未读邮件`);
            HandleUnreadGmails(checkUnreadEmailsLogs)
                .catch((e) => { checkUnreadEmailsLogs.AddNewErrLogLine(`HandleUnreadGmails()处理失败: + ${e.message}`) })
                .finally(()=>{
                    if (!checkUnreadEmailsLogs.ThereErrLog()) {checkUnreadEmailsLogs.AddNewLogLine('HandleUnreadGmails()处理成功')}
                    checkUnreadEmailsLogs.consoleLogs() ;
                    runningTasks -= 1 ;
                });
        }

        await Sleep(10) ;
    }

    isWorkerRunning = false; 
    LogInBackground(`... ... 队列中的全部任务已处理完毕, 此工人共处理${taskNumber}个任务后退出`);
}

async function HandleSignal(toHandleSignal) {
    const {url, body} = toHandleSignal ;

    if (url === targetURL.tradingview) {
        if (!Object.hasOwn(body, 'fromTVcheck') || !Object.hasOwn(body, 'botGate') || body.fromTVcheck !== process.env.fromTVcheck) {
            LogInBackground("? 收到未校验的TradingView Message:") ;
            return;
        }

        if (body.botGate === "TradeBot") {
            const thisLogs = new LogsWithTime(body.botNumber, 'onlyErr') ;
            toHandleSignal.thisLogs = thisLogs ;

            try {
                const r_HandleTradeBot = await HandleTradeBot(body, thisLogs);
                if      (r_HandleTradeBot === CV.stopSet         ) {thisLogs.AddNewLogLine(`||| ${body.botNumber}: stopSet, 本信号丢弃`) }
                else if (r_HandleTradeBot === CV.newerHandled    ) {thisLogs.AddNewLogLine(`||| ${body.botNumber}: 已处理更新的信号, 本信号丢弃`)}
                else if (r_HandleTradeBot === CV.stillHandleLast ) {thisLogs.AddNewLogLine(`||| ${body.botNumber}: 仍在处理上一个信号, 但是本信号已经超时, 本信号丢弃`)}
                else if (r_HandleTradeBot === true               ) {thisLogs.AddNewLogLine(`${body.botNumber}: HandleTradeBot()处理成功`)}
                else {throw new Error(`${body.botNumber}: 内部逻辑错误`)}
            } catch (e) {thisLogs.AddNewErrLogLine(`${body.botNumber}: HandleTradeBot()处理失败\n` + e.message) }
        }

        if (body.botGate === "AllPrice") {
            const thisLogs = new LogsWithTime('AllPrice', 'onlyErr') ;
            toHandleSignal.thisLogs = thisLogs ;
            try {
                await HandleAllPrice(body, thisLogs);
                thisLogs.AddNewLogLine(`HandleAllPrice()处理成功`);
            } catch (e) {thisLogs.AddNewErrLogLine(`HandleAllPrice()处理失败: \n` + e.message)}
        }

    }

}

export let stopHandleNewSignals = false; // 当从tg收到取消所有任务信号的时候, 取消所有信号
export function ToStopSartNewSignals(toStopStart = 'toStop') { // 重启是'toStart')
    if (toStopStart !== 'toStop' && toStopStart !== 'toStart') { return 'ToStopSartNewSignals()输入参数只能是toStop或toStart' }
    stopHandleNewSignals = toStopStart === 'toStart' ? false : true; // 1. 下发熔断禁令
    if (toStopStart === 'toStop') {SignalList.length = 0} // 2. 物理超渡内存中积压的所有过期信号！
    return true ;
}

const targetURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;
const urlList = Object.keys(targetURL).map(k => String(targetURL[k]));

const server = http.createServer(async (req, res) => {
    const gcpGetTime = Date.now() ;

    try {
        const { method, url } = req;
        // 在系统进行判断之前先去接收信号,
        // 这是不得以的做法, 

        // 对于来自TG的消息有单独的快速通道
        if (method === 'POST' && url === targetURL.tgbot) {
            const tgLogs = new LogsWithTime('tgBot Message') ;
            tgLogs.AddNewLogLine("收到/tgBot连接");
            try {
                let bodyData = '';
                for await (const chunk of req) { bodyData += chunk }
                // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                // 至此已经不需要再接收数据了
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("ACK");
                const body = JSON.parse(bodyData);
                const msg = body.message;
                await HandleTgBot(msg);
                tgLogs.AddNewLogLine(`HandleTgBot()处理成功`);
            } catch (e) { tgLogs.AddNewErrLogLine(`HandleTgBot()处理失败\n` + e.message) } finally { tgLogs.consoleLogs('onlyErr') }
        } else {
            let stopHandleThisSigal = false ;
            if (stopHandleNewSignals) {
                stopHandleThisSigal = true ;
                const stopMessage = '||| ||| stopHandleNewSignals is set, 不再处理新的信号' ;
                SendTG(`stopMessage`, stopMessage).catch(() => { });
                LogInBackground(stopMessage) ;
            }
            if (method !== 'POST' || !urlList.includes(url)) { 
                stopHandleThisSigal = true ;
                const stopMessage = '||| ||| 只接受POST信号, 且信号发往指定URL' ;
                SendTG(`stopMessage`, stopMessage).catch(() => { });
                LogInBackground(stopMessage) ;
            }
            if (stopHandleThisSigal) {
                req.resume();
                // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                if (!res.headersSent) {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("ACK");
                }
                return ;
            }

            let bodyData = '';
            for await (const chunk of req) { bodyData += chunk }
            // 这里回复 ACK, 不管数据如何, 我直接回收到了,
            // 至此已经不需要再接收数据了
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("ACK");
            const body = JSON.parse(bodyData);
            body.gcpGetTime = gcpGetTime ;
            LogInBackground(`... ... 新信号来自${url}`) ;
            AddNewSignal({url, body}) ;
            LogInBackground(`... ... 新信号已放入待处理队列`) ;
            if (isWorkerRunning) { LogInBackground('... ... 已经有人在处理队列任务了, 不必分配新的工人') }
            else {
                LogInBackground('... ... 分配新的工人去处理队列任务');
                HandleSignalList().catch(() => { }); // 这里不必写await
            } // 只有isworkerrunning 是false 的时候才会有新的工人进来, 这样设计就不会与你说的情况
        }
    } catch (e) {
        req.resume();
        // 这里回复 ACK, 不管数据如何, 我直接回收到了,
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("ACK");
        }
        LogInBackground(`✘ server收到错误信号: \n${e.message}`);
    }
});

// 实际上下面的代码用处不大
process.on('SIGTERM', async () => {
    ToStopSartNewSignals('toStop') ;

    LogInBackground("️[GCP 部署切流] 收到云端退役信号(SIGTERM)！拦截成功，大闸降下...");

    // 🔒 铁血对账：只要账本里还有单子没清空，或者后台 Worker 还在埋头苦干，死死顶住！
    while (SignalList.length > 0 || isWorkerRunning) {
        LogInBackground(`护盘冲刺中：队列还剩 ${SignalList.length} 单，Worker忙碌状态:，原地等待 1 秒...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    // 此时此刻，地上的单子全量安全落地，Sheets 写完，邮件发完，资产毫发无损！
    LogInBackground("✔ [自保大闸] 核心资产 100% 全量清仓落地。老实例完成历史使命，准予体面退役。");
    process.exit(0); // 💥 主动交枪，通知谷歌：老容器已经安全交割，你可以物理回收了！
});


const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    LogInBackground(`✔ 服务开始监听端口 ${PORT}，运行...`);
});



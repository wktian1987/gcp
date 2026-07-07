import http from 'node:http';
import { SendTG, Sleep } from './utility.js';

// 创建原生 HTTP 监听基座
const targetURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;

const urlList = Object.keys(targetURL).map(k => String(targetURL[k]));

const SignalList = [] ; // 里面的元素是 {url, body}
let isWorkerRunning = false ; 
export let stopHandleNewSignals = true; // 当从tg收到取消所有任务信号的时候, 取消所有信号
export function ToStopSartNewSignals(toStopStart = 'toStop') { // 重启是'toStart')
    if (toStopStart === 'toStop' ) {console.log('收到信号 ToStopSartNewSignals(toStop)' )}
    if (toStopStart === 'toStart') {console.log('收到信号 ToStopSartNewSignals(toStart)')}
    if (toStopStart !== 'toStop' && toStopStart !== 'toStart') {console.log('收到错误信号 ToStopSartNewSignals(非法参数)'); return false ;}
    stopHandleNewSignals = toStopStart === 'toStop' ? true : false; // 1. 下发熔断禁令
    if (toStopStart === 'toStop') {SignalList.length = 0} // 2. 物理超渡内存中积压的所有过期信号！
    return true ;
}
// 最多保留100个队列任务
function AddNewSignal(sigObj) {
    SignalList.push(sigObj) ;
    while (SignalList.length > 100) {SignalList.shift()}
}

// 按照目前的设置
// tg可以给系统发送信号来确认系统开启运行


const server = http.createServer(async (req, res) => {
    try {
        const { method, url } = req;
        // 在系统进行判断之前先去接收信号,
        // 这是不得以的做法, 

        // 对于来自TG的消息有单独的快速通道
        if (method === 'POST' && url === targetURL.tgbot) {
            console.log("收到/tgBot连接");
            try {
                let bodyData = '';
                for await (const chunk of req) { bodyData += chunk }
                // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                // 至此已经不需要再接收数据了
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("ACK");
                const body = JSON.parse(bodyData);
                const msg = body.message;
                const { HandleTgBot } = await import("./handleTgBot.js");
                await HandleTgBot(msg);
                console.log(`✔ HandleTgBot()处理成功`);
            } catch (e) {
                // GCP 结构化日志
                const errObj = {
                    severity: "ERROR", // 强制涂红
                    message: `✘ HandleTgBot()处理失败\n` + e.message
                };
                console.error(JSON.stringify(errObj));
            }
        } else {
            let stopHandleThisSigal = false ;
            if (stopHandleNewSignals) {
                stopHandleThisSigal = true ;
                const stopMessage = '... ... stopHandleNewSignals is set, 不再处理新的信号' ;
                SendTG(`stopMessage`, stopMessage).catch(() => { });
                console.log(`stopMessage: ${stopMessage}`) ;
            }
            if (method !== 'POST' || !urlList.includes(url)) { 
                stopHandleThisSigal = true ;
                const stopMessage = '... ... 只接受POST信号, 且信号发往指定URL' ;
                SendTG(`stopMessage`, stopMessage).catch(() => { });
                console.log(`stopMessage: ${stopMessage}`) ;
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
            AddNewSignal({url, body}) ;
            console.log(`... ... 收到新任务, ${url}, 已放入待处理队列`)
            if (isWorkerRunning) { console.log('... ... 已经有人在处理队列任务了, 不必分配新的工人') }
            if (!isWorkerRunning) {
                console.log('... ... 分配新的工人去处理队列任务');
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
        console.log(`✘ server收到错误信号: \n${e.message}`);
    }
});

// 我的目的是让信号一个一个地处理, 从最新的信号开始处理
// 并发处理, 每隔1s开启一个新的并发
// 每次清空队列后,等待对列内任务执行完后再执行新的队列
async function HandleSignalList() {
    if (isWorkerRunning) { return }
    console.log('... ... 新工人开始处理队列任务');
    isWorkerRunning = true;

    let taskNumber = 0;
    let handledNumber = 0 ;
    while (SignalList.length > 0) {
        const promiseA = [];
        while (SignalList.length > 0) {
            taskNumber += 1;
            console.log(`... ... 开始处理第${taskNumber}个任务`)
            const toHandleSignal = SignalList.pop()
            promiseA.push(HandleSignal(toHandleSignal.url, toHandleSignal.body).catch(() => { }));
            await Sleep(1000);
        }

        console.log(`... ... 正在并发处理${taskNumber - handledNumber}个任务,等待处理完毕`);
        await Promise.allSettled(promiseA);
        handledNumber = taskNumber ;
        console.log(`... ... 共有${taskNumber}个任务处理完毕`);


        // 用信号来激活查看邮件的操作
        console.log(`开始检查处理Gmail未读邮件`);
        const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
        HandleUnreadGmails().catch(() => { }); // 查看未读邮件是一个小事情, 不必报错
    }

    isWorkerRunning = false; 
    console.log(`... ... 队列中的全部任务已处理完毕, 此工人共处理${handledNumber}个任务后体面退出`);

}

async function HandleSignal(url, body) {

    if (url === targetURL.tradingview) {
        if (!Object.hasOwn(body, 'fromTVcheck') || !Object.hasOwn(body, 'botGate') || body.fromTVcheck !== process.env.fromTVcheck) {
            console.log("? 收到未校验的TradingView Message:");
            return;
        }
        console.log("收到TradingView Message, botGate: " + body.botGate);

        if (body.botGate === "TradeBot") {
            console.log("TradeBot botNumber: " + body.botNumber);

            try {
                // 这一行写在try中，一次加载整个运行声明周期都可用，还是每次运行到这里都要重新加载，或者反复加载导致内存中同样内容重复
                // 答案:
                // 不会, 可以放心使用, 不会重复加载, 仅加载一次, 然后保存在内存中, 下次复用, 也不会在内存中保存多个同样的副本
                const { HandleTradeBot, CV } = await import("./handleTV.js");
                
                const r_HandleTradeBot = await HandleTradeBot(body);
                if      (r_HandleTradeBot === CV.stopSet         ) {console.log(`${body.botNumber}: stopSet, 本信号丢弃`) }
                else if (r_HandleTradeBot === CV.newerHandled    ) {console.log(`${body.botNumber}: 已处理更新的信号, 本信号丢弃`)}
                else if (r_HandleTradeBot === CV.stillHandleLast ) {console.log(`${body.botNumber}: 仍在处理上一个信号, 但是本信号已经超时, 本信号丢弃`)}
                else if (r_HandleTradeBot === true               ) {console.log(`✔ ${body.botNumber}: HandleTradeBot()处理成功`)}
                else {throw new Error(`${body.botNumber}: 内部逻辑错误`)}
            } catch (e) {
                const errObj = {
                    severity: "ERROR", // 强制涂红
                    message: `✘ ${body.botNumber}: HandleTradeBot()处理失败\n` + e.message
                };
                console.error(JSON.stringify(errObj));
                SendTG(`✘ ${body.botNumber}: HandleTradeBot()处理失败`, e.message).catch(() => { });
            }
        }

        if (body.botGate === "AllPrice") {
            try {
                const { HandleAllPrice } = await import("./handleTV.js");
                await HandleAllPrice(body);
                console.log(`✔ HandleAllPrice()处理成功`);
            } catch (e) {
                const errObj = {
                    severity: "ERROR", // 强制涂红
                    message: `✘ HandleAllPrice()处理失败: \n` + e.message
                };
                console.error(JSON.stringify(errObj));
                SendTG(`✘ HandleAllPrice()处理失败`, e.message).catch(() => { });

            }
        }

    }

}

// 实际上下面的代码用处不大
process.on('SIGTERM', async () => {
    ToStopSartNewSignals('toStop') ;

    console.log("⚠️[GCP 部署切流] 收到云端退役信号(SIGTERM)！拦截成功，大闸降下...");

    // 🔒 铁血对账：只要账本里还有单子没清空，或者后台 Worker 还在埋头苦干，死死顶住！
    while (SignalList.length > 0 || isWorkerRunning) {
        console.log(`⏳ 护盘冲刺中：队列还剩 ${SignalList.length} 单，Worker忙碌状态:，原地等待 1 秒...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    // 🟢 此时此刻，地上的单子全量安全落地，Sheets 写完，邮件发完，资产毫发无损！
    console.log("✔ [自保大闸] 核心资产 100% 全量清仓落地。老实例完成历史使命，准予体面退役。");
    process.exit(0); // 💥 主动交枪，通知谷歌：老容器已经安全交割，你可以物理回收了！
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => { console.log(`✔ 服务开始监听端口 ${PORT}，运行...`); });

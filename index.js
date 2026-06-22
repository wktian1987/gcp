import http from 'http';

// 创建原生 HTTP 监听基座
const targetURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;

const urlList = Object.keys(targetURL).map(k => String(targetURL[k]));

const SignalList = [] ; // 里面的元素是 {url, body}
let isWorkerRunning = false ; 
export let stopHandleNewSignals = true; // 当从tg收到取消所有任务信号的时候, 取消所有信号
export function ToStopSartNewSignals(toStopStart = 'toStop') { // 重启是'toStart')
    stopHandleNewSignals = toStopStart === 'toStop' ? true : false; // 1. 下发熔断禁令
    if (toStopStart === 'toStop') {SignalList.length = 0} // 2. 物理超渡内存中积压的所有过期信号！
}
// 最多保留10个队列任务
function AddNewSignal(sigObj) {
    SignalList.push(sigObj) ;
    while (SignalList.length > 9) {SignalList.shift()}
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
            if (stopHandleNewSignals) { throw new Error('... ... stopHandleNewSignals is set, 不再处理新的信号') }
            if (method !== 'POST' || !urlList.includes(url)) { throw new Error('... ... 只接受POST信号, 且信号发往指定URL') }
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
            }
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
async function HandleSignalList() {
    if (isWorkerRunning) {return}
    isWorkerRunning = true ;
    console.log('... ... 新工人开始处理队列任务')
    let taskNumber = 0 ;
    while (SignalList.length > 0) {
        taskNumber  += 1 ;
        console.log(`... ... 开始处理第${taskNumber}个任务, 队列内现有${SignalList.length - 1}个任务待处理`)
        const toHandleSignal = SignalList.pop()
        await HandleSignal(toHandleSignal.url, toHandleSignal.body) ;
        console.log(`... ... 第${taskNumber}个任务处理完毕`)
    }

    // 用信号来激活查看邮件的操作
    const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
    try {
        await HandleUnreadGmails();
        console.log(`✔ HandleUnreadGmails()处理成功`) ;
    } catch (e) {
        console.log(`✘ HandleUnreadGmails()处理失败: \n` + e.message) ; // 简单log错误信息即可, 没必要报错
    }

    isWorkerRunning = false ;
    console.log(`... ... 队列中的全部任务已处理完毕, 此工人退出`) ;
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
                const { HandleTradeBot } = await import("./handleTV.js");
                await HandleTradeBot(body);
                console.log(`✔ ${body.botNumber}: HandleTradeBot()处理成功`);
            } catch (e) {
                const errObj = {
                    severity: "ERROR", // 强制涂红
                    message: `✘ ${body.botNumber}: HandleTradeBot()处理失败\n` + e.message
                };
                console.error(JSON.stringify(errObj));
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

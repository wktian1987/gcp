import http from 'http';

// 创建原生 HTTP 监听基座
const targetURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;

const urlList = Object.keys(targetURL).map(k => String(targetURL[k]));

const SignalList = [] ; // 里面的元素是 {url, body}
let isWorkerRunning = false ;

const server = http.createServer(async (req, res) => {
    try {
        const { method, url } = req;
        if (method !== 'POST' || !urlList.includes(url)) {throw new Error('只接受POST信号, 且信号发往指定URL')}
        let bodyData = '';
        for await (const chunk of req) { bodyData += chunk }
        // 这里回复 ACK, 不管数据如何, 我直接回收到了,
        // 至此已经不需要再接收数据了
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end("ACK");
        const body = JSON.parse(bodyData);
        SignalList.push({url, body}) ;
        await HandleSignalList() ;
        // await HandleSignal(url, body) ;
    } catch (e) {
        req.resume() ;
        // 这里回复 ACK, 不管数据如何, 我直接回收到了,
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("ACK");
        }
        console.log(`✘ server收到错误信号: ${e.message}`);
    }
} ) ;

// 我的目的是让信号一个一个地处理, 从最新的信号开始处理
async function HandleSignalList() {
    if (isWorkerRunning) {return}
    isWorkerRunning = true ;
    while (SignalList.length > 0) {
        const toHandleSignal = SignalList.shift()
        await HandleSignal(toHandleSignal.url, toHandleSignal.body) ;
    }

    // 用信号来激活查看邮件的操作
    // 与后面的信号主逻辑并发运行
    await new Promise(resolve => setTimeout(resolve, 100));
    const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
    HandleUnreadGmails()
        .then(() => { console.log(`✔ HandleUnreadGmails()处理成功`) })
        .catch(e => {
            const errObj = {
                severity: "ERROR", // 强制涂红
                message: `✘ HandleUnreadGmails()处理失败: \n` + e.message
            };
            console.error(JSON.stringify(errObj));
        });

    isWorkerRunning = false ;
}

async function HandleSignal(url, body) {

    if (url === targetURL.tgbot) {
        console.log("收到/tgBot连接");
        try {
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
    }

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

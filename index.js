import http from 'http';

// 创建原生 HTTP 监听基座
const targetURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;

const urlList = Object.keys(targetURL).map(k => String(targetURL[k]));

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
        await HandleSignal(url, body) ;
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


async function HandleSignal(url, body) {

    // 用信号来激活查看邮件的操作
    // 与后面的信号主逻辑并发运行
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



server.listen(process.env.PORT, () => { console.log(`✔ 服务开始监听端口 ${PORT}，运行...`); });



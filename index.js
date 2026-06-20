import http from 'http';

// 创建原生 HTTP 监听基座
const server = http.createServer(async (req, res) => {
    try {
        const { method, url } = req;

        //  精准路由分流：如果不是 POST /tgBot，直接在门口体面退单（模拟 404）
        if (method === 'POST' && url === '/tgBot') {
            console.log("收到/tgBot连接");

            // 原生接收 JSON 数据流（模拟 express.json()）
            let bodyData = '';
            for await (const chunk of req) { bodyData += chunk }

            // 这里回复 ACK, 不管数据如何, 我直接回收到了,
            // 这样已经不需要再接收数据了
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("ACK");

            try {
                // 解析 JSON 体
                const body = JSON.parse(bodyData); // 这里不不必验证, 不给发送方回复出错信息，一旦出错，抛错给我我自己
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

        } else if (method === 'POST' && url === '/tradingview') {
            console.log("收到/tradingview连接");

            // 原生接收 JSON 数据流（模拟 express.json()）
            let bodyData = '';
            for await (const chunk of req) { bodyData += chunk }

            // 这里回复 ACK, 不管数据如何, 我直接回收到了,
            // 这样已经不需要再接收数据了
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("ACK");

            let body;
            try { body = JSON.parse(bodyData) } catch (e) {
                console.log("? 收到的TradingView Webhook Message不能正确解析: \n" + `${bodyData}`);
                return;
            }

            if (body.fromTVcheck === process.env.fromTVcheck) {
                console.log("收到TradingView webhook Message, botGate: " + body.botGate);
            } else {
                console.log("? 收到未校验的TradingView Webhook Message:");
                return;
            }

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


            // 用tradingview信号来激活查看邮件的操作
            await new Promise(resolve => setTimeout(resolve, 10)); // 等0.01s后再处理, 避免发来的log时序混乱
            console.log(`tradingview信号处理完毕, 开始处理HandleUnreadGmails()`);
            try {
                const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
                await HandleUnreadGmails();
                console.log(`✔ HandleUnreadGmails()处理成功`);
            } catch (e) {
                const errObj = {
                    severity: "ERROR", // 强制涂红
                    message: `✘ HandleUnreadGmails()处理失败: \n` + e.message
                };
                console.error(JSON.stringify(errObj));
            }

        } else {
            // 非 自定义 路径，原生直接在这里铁血拦截，返回 404
            req.resume();
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Cannot ${method} ${url}`);
        }

    } catch (globalErr) {
        req.resume(); 
        // 如果前面 ACK 已经吐出去了，绝不二次写入响应头造成系统崩溃
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error' }));
        }
        console.error('✘ 全局捕获错误:', globalErr.stack);
    }
});

// 焊死端口，轰鸣启动
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`✔ 服务开始监听端口 ${PORT}，运行...`);
});



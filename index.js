import express, { json } from 'express';

const app = express();

app.listen(process.env.PORT || 8080, () => {
    console.log(`✔ 服务开始监听端口 ${process.env.PORT || 8080}，运行...`);
});


app.post('/schedule', json(), async (req, res) => {
    console.log("✔ 收到/schedule连接");
    console.log("✔ 收到/schedule连接, 暂时啥也不做, HandleUnreadGmails() 由 AllPrices信号接管") ;
    // const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
    // await HandleUnreadGmails(req, res);
}
);

app.post('/tgBot', json(), async (req, res) => {
    console.log("✔ 收到/tgBot连接");
    const { HandleTgBot } = await import("./handleTgBot.js");

    res.status(200).send("ACK");

    const msg   = req.body.message  ;

    try {
        await HandleTgBot(msg);
    } catch (e) {
        console.error("✘ TgBot消息处理失败: ", e.message) ;


    }
}
);

app.post('/tradingview', json(), async (req, res) => {
    console.log("收到/tradingview连接");
    const { body } = req;
    if (body.fromTVcheck === process.env.fromTVcheck) {
        console.log("收到TradingView webhook Message, botGate: " + body.botGate);
        res.status(200).json({ status: 'success' });
    } else {
        console.log("✘ 收到未校验的TradingView Webhook Message:" ); 
        // 虽然未验证的消息，但是仍然给发送者发送“我已经收到了”
        return res.status(200).json({ status: 'success' });
    }

    if (body.botGate === "TradeBot") {
        try {
            const { HandleTradeBot} = await import("./handleTV.js");
            await HandleTradeBot(body);
            console.log(`✔ ${body.botNumber}: HandleTradeBot()处理成功`);
        } catch (e) {console.error(`✘ ${body.botNumber}: HandleTradeBot()处理失败: ` + e.message) }
    }

    if (body.botGate === "AllPrice") {
        try {
            const { HandleAllPrice} = await import("./handleTV.js");
            await HandleAllPrice(body);
            console.log(`✔ HandleAllPrice()处理成功`);
        } catch (e) {console.error(`✘ HandleAllPrice()处理失败: ` + e.message) }

        // 用AllPrice信号来激活查看邮件的
        console.log(`HandleAllPrice()处理完毕, 开始处理HandleUnreadGmails()`) ;
        try {
            const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
            await HandleUnreadGmails(req, res);
            console.log(`✔ HandleUnreadGmails()处理成功`);
        } catch (e) {console.error(`✘ HandleUnreadGmails()处理失败: ` + e.message)}
    }



}  )  ;

app.use((err, req, res, next) => {
    console.error('✘ 全局捕获错误:', err.stack);
    if (!res.headersSent) {
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});


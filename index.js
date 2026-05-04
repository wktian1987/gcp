import express, { json } from 'express';

const app = express();

app.listen(process.env.PORT || 8080, () => {
    console.log(`✔ 服务开始监听端口 ${process.env.PORT || 8080}，运行...`);
});

app.post('/schedule', json(), async (req, res) => {
    console.log("✔ 收到/schedule连接");
    const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
    await HandleUnreadGmails(req, res);
}
);

app.post('/tgBot', json(), async (req, res) => {
    console.log("✔ 收到/tgBot连接");
    const { HandleTgBot } = await import("./handleTgBot.js");

    res.status(200).send("ACK");

    const msg   = req.body.message  ;

    try {
        await HandleTgBot(meg);
    } catch (e) {
        console.error("✘ TgBot消息处理失败: ", e.message) ;


    }
}
);

app.post('/tradingview', json(), async (req, res) => {
    console.log("✔ 收到/tradingview连接");
    const { HandleTV } = await import("./handleTV.js");
    const { body } = req;
    if (body.fromTVcheck === process.env.fromTVcheck) {
        console.log("✔ 收到TradingView webhook Message");
        res.status(200).json({ status: 'success' });
    } else {
        console.log("✔ ???收到未校验的TradingView Webhook Message:" + JSON.stringify(body));
        // 虽然未验证的消息，但是仍然给发送者发送“我已经收到了”
        return res.status(200).json({ status: 'success' });
    }

    try {
        await HandleTV(body);
    } catch (e) {
        console.error("✘ HandleTV处理失败: ", e.message);
    }
}
);

app.use((err, req, res, next) => {
    console.error('✘ 全局捕获错误:', err.stack);
    if (!res.headersSent) {
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});


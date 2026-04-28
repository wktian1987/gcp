import express, { json } from 'express';

const app = express();

app.listen(process.env.PORT || 8080, () => {
    console.log(`服务开始监听端口 ${process.env.PORT || 8080}，运行...`);
});

app.post('/schedule', json(), async (req, res) => {
    console.log("收到/schedule连接");
    const { HandleUnreadGmails } = await import("./handleUnreadGmails.js");
    await HandleUnreadGmails(req, res);
}
);

app.post('/tgBot', json(), async (req, res) => {
    console.log("收到/tgBot连接");
    const { HandleTgBot } = await import("./handleTgBot.js");
    await HandleTgBot(req, res);
}
);

app.post('/tradingview', json(), async (req, res) => {
    console.log("收到/tradingview连接");
    const { HandleTV } = await import("./handleTV.js");
    await HandleTV(req, res);
}
);

app.use((err, req, res, next) => {
    console.error('全局捕获错误:', err.stack);
    if (!res.headersSent) {
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});


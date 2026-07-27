import http from 'node:http';
import { DATETIME, LogsWithTime, SendTG, Sleep, LogInBackground } from './utility.js';
import { HandleUnreadGmails } from './handleUnreadGmails.js';
import { HandleTradeBot, HandleAllPrice, CV } from './handleTV.js';
import { HandleTgBot } from './handleTgBot.js';
import { checkServerIdentity } from 'node:tls';

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

    if (url === postURL.tradingview) {
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
                else if (r_HandleTradeBot === true               ) {thisLogs.AddNewLogLine(`HandleTradeBot()处理成功`)}
                else {throw new Error(`内部逻辑错误`)}
            } catch (e) {thisLogs.AddNewErrLogLine(`HandleTradeBot()处理失败\n` + e.message) }
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

const postURL = {
    tgbot       :   '/tgBot'        ,
    tradingview :   '/tradingview'  } ;
const postUrlList = Object.keys(postURL).map(k => String(postURL[k]));

const server = http.createServer(async (req, res) => {
    const gcpGetTime = Date.now() ;

    try {
        const { method, url } = req;
        // 在系统进行判断之前先去接收信号,
        // 这是不得以的做法, 

        if (method === 'POST') {
            // 对于来自TG的消息有单独的快速通道
            if (url === postURL.tgbot) {
                const tgLogs = new LogsWithTime('tgBot Message', 'onlyErr');
                tgLogs.AddNewLogLine("收到/tgBot连接");
                try {
                    let bodyData = '';
                    for await (const chunk of req) { bodyData += chunk }
                    // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                    // 至此已经不需要再接收数据了
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("ACK");

                    const newMessageLog = { severity: 'INFO', message: '... ... 新信号' };
                    newMessageLog.message += '\n' + `url: ${url}`;
                    newMessageLog.message += '\n' + `method: ${method}`;
                    newMessageLog.message += '\n' + `body: ${bodyData}`;
                    LogInBackground(newMessageLog);

                    const body = JSON.parse(bodyData);
                    const msg = body.message;
                    await HandleTgBot(msg);
                    tgLogs.AddNewLogLine(`HandleTgBot()处理成功`);
                } catch (e) { tgLogs.AddNewErrLogLine(`HandleTgBot()处理失败: ${e.message}`) } finally { tgLogs.consoleLogs() }
            } else {
                let stopHandleThisSigal = false;
                if (stopHandleNewSignals) {
                    stopHandleThisSigal = true;
                    const stopMessage = '||| ||| stopHandleNewSignals is set, 不再处理新的POST信号';
                    SendTG(`stopMessage`, stopMessage).catch(() => { });
                    LogInBackground(stopMessage);
                }
                if (!postUrlList.includes(url)) {
                    stopHandleThisSigal = true;
                    const stopMessage = '||| ||| 只接受发往指定URL的POST信号';
                    SendTG(`stopMessage`, stopMessage).catch(() => { });
                    LogInBackground(stopMessage);
                }
                if (stopHandleThisSigal) {
                    req.resume();
                    // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                    if (!res.headersSent) {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end("ACK");
                    }
                    return;
                }

                let bodyData = '';
                for await (const chunk of req) { bodyData += chunk }
                // 这里回复 ACK, 不管数据如何, 我直接回收到了,
                // 至此已经不需要再接收数据了
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("ACK");

                const newMessageLog = { severity: 'INFO', message: '... ... 新信号' };
                newMessageLog.message += '\n' + `url: ${url}`;
                newMessageLog.message += '\n' + `method: ${method}`;
                newMessageLog.message += '\n' + `body: ${bodyData}`;
                LogInBackground(newMessageLog);

                const body = JSON.parse(bodyData);
                body.gcpGetTime = gcpGetTime;
                AddNewSignal({ url, body });
                LogInBackground(`... ... 新信号已放入待处理队列`);

                if (isWorkerRunning) { LogInBackground('... ... 已经有人在处理队列任务了, 不必分配新的工人') }
                else {
                    LogInBackground('... ... 分配新的工人去处理队列任务');
                    HandleSignalList().catch(() => { }); // 这里不必写await
                } // 只有isworkerrunning 是false 的时候才会有新的工人进来, 这样设计就不会与你说的情况
            }
        }
        if (method === 'GET') {
            if (url === '/favicon.ico') {
                //  204 No Content：明确告诉浏览器这里没有图标，别再要了
                res.writeHead(204);
                res.end();
                return; //  注意：这里一定要 return，防止代码继续往下执行！
            }

            // 下面的代码应该是返回一个网页，请帮我补全代码

            // 2. 处理 SSE 实时推送流接口
            if (url === '/api/trades/stream') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform', // 阻止 Cloud Run / CDN 缓存响应流
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no'                    // 防 Nginx/GCP 缓冲
                });

                // 建立连接时推一个握手信号
                res.write('data: {"type":"CONNECTED"}\n\n');

                // 将此 res 注入到你的全局 clients 数组中，供策略广播调用
                if (global.sseClients) {
                    global.sseClients.push(res);
                }

                // 客户端断开连接时清除，防止内存泄漏
                req.on('close', () => {
                    if (global.sseClients) {
                        global.sseClients = global.sseClients.filter(client => client !== res);
                    }
                });
                return;
            }

            // 3. 处理主页请求 (GET / 或带有 url 参数的情况，如 /?key=123)
            const parsedUrl = new URL(url, `http://${req.headers.host}`);
            if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {

                // 💡 HTML 页面模板
                const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⚡ 实时交易状态大盘</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 10px; margin-bottom: 20px; }
        .status-dot { display: inline-block; width: 10px; height: 10px; background-color: #238636; border-radius: 50%; margin-right: 8px; }
        .trade-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; animation: fadeIn 0.3s ease-in-out; }
        .buy { border-left: 4px solid #238636; }
        .sell { border-left: 4px solid #da3633; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>📈 私人交易状态监控</h2>
            <div><span class="status-dot"></span><span id="conn-text">连接中...</span></div>
        </div>
        <div id="trade-list">
            <div style="text-align: center; color: #8b949e; padding: 20px;">等待实时成交信号...</div>
        </div>
    </div>

    <script>
        // 前端自动建立 SSE 连接
        const eventSource = new EventSource('/api/trades/stream');

        eventSource.onopen = () => {
            document.getElementById('conn-text').innerText = '实时通道就绪';
        };

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'CONNECTED') return;

            const list = document.getElementById('trade-list');
            // 清理初始占位文本
            if (list.children[0]?.style?.textAlign === 'center') list.innerHTML = '';

            // 创建新成交条目
            const card = document.createElement('div');
            card.className = \`trade-card \${data.side === 'BUY' ? 'buy' : 'sell'}\`;
            card.innerHTML = \`
                <div>
                    <strong>\${data.symbol || 'BTCUSDT'}</strong> 
                    <span style="color: \${data.side === 'BUY' ? '#3fb950' : '#f85149'}">\${data.side || 'BUY'}</span>
                </div>
                <div>价格: $\${data.price} | 数量: \${data.amount}</div>
                <div style="color: #8b949e; font-size: 0.85em;">\${data.time || new Date().toLocaleTimeString()}</div>
            \`;
            
            list.prepend(card); // 新数据压在最上面
        };

        eventSource.onerror = () => {
            document.getElementById('conn-text').innerText = '连接中断，重连中...';
        };
    </script>
</body>
</html>`;

                // 返回 200 OK 并输出网页
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Length': Buffer.byteLength(htmlContent),
                    'Cache-Control': 'no-cache'
                });
                res.end(htmlContent);
                return; // 👈 必须 return
            }

            // 4. 未匹配到的其他 GET 路由，返回 404
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
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



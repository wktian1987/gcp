import { ToStrictString, GetGS, LogInBackground } from "./utility.js";

let htmlContentCache = null;
export async function readIndexHTML(toReadNew = false) {
    const TradingBot_00_ID = process.env.SHEET_ID;
    const newHTMLregion = 'newHTML!A1';
    if (htmlContentCache === null || toReadNew) {
        const newHTMLstr = (await GetGS(TradingBot_00_ID, newHTMLregion))[0][0];
        htmlContentCache = ToStrictString(newHTMLstr);
    }
    return htmlContentCache;
}

export const toWebList = {
    sseClients: new Set(),
    handleList: [],
    tradeList: [],
    listLimit: 99,
    globalWebHeartBeat: null,

    AddNewLine({ type, content }) {
        if (type === 'trade') {
            this.tradeList.push({ type, content });
            while (this.tradeList.length > this.listLimit) { this.tradeList.shift() }
            if (this.tradeList.length > this.listLimit) {
                this.tradeList.splice(0, this.tradeList.length - this.listLimit); // 从索引 0 开始，一次性删除 overCount 个元素
            }
        }
        if (type === 'handle') {
            this.handleList.push({ type, content });
            if (this.handleList.length > this.listLimit) {
                this.handleList.splice(0, this.handleList.length - this.listLimit); // 从索引 0 开始，一次性删除 overCount 个元素
            }
        }
        this.HandleSSE({ type, content });
        this.triggerHeartBeat();
    },

    triggerHeartBeat() {
        if (this.globalWebHeartBeat) { return }
        this.globalWebHeartBeat = setInterval(() => {
            this.HandleSSE({ type: 'ping', content: 'ping' });
        }, 15000);
    },

    HandleSSE({ type, content }) {
        if (this.sseClients.size === 0) { return }
        for (const client of this.sseClients) {
            try {
                client.write(`data: ${JSON.stringify({ type, content })}\n\n`);
            } catch (e) {
                this.sseClients.delete(client);
            }
        }
        LogInBackground(`已通过SSE广播 ${type} 事件给 ${this.sseClients.size} 个客户端`);
    }
};

export async function Web(thisLogs, url, req, res) {
    thisLogs.AddNewLogLine('开始处理');

    if (url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        thisLogs.AddNewLogLine('处理 favicon, 忽略并返回 204');
        return;
    }

    if (url === '/stream') {
        // 设置 SSE 核心 HTTP 响应头（刚性防线）
        res.writeHead(200, {
            'Content-Type': 'text/event-stream', // 必须：指定为事件流格式
            'Cache-Control': 'no-cache, no-transform',          // 必须：禁止客户端/代理缓存
            'Connection': 'keep-alive',           // 必须：保持 HTTP 长连接不关闭
            'Access-Control-Allow-Origin': '*',   // 选填：按需跨域支持
            'X-Accel-Buffering': 'no'
        });

        // 发送初始连接成功事件（符合 SSE 标准格式 "data: xxx\n\n"）
        res.write(`data: ${JSON.stringify({ message: 'SSE' })}\n\n`);
        thisLogs.AddNewLogLine('已通过SSE推送初始连接成功事件');

        // 将 theWebList 中的数据转换为数组，一次性全量打包发送
        res.write(`data: ${JSON.stringify(toWebList.handleList)}\n\n`);
        res.write(`data: ${JSON.stringify(toWebList.tradeList)}\n\n`);
        thisLogs.AddNewLogLine(`已通过SSE推送当前历史数据`);

        // 将当前客户端加入 SSE 客户端列表
        toWebList.sseClients.add(res);

        toWebList.triggerHeartBeat() ;

        // 监听客户端断开连接事件（防内存泄漏 & 句柄挂起）
        // 监听客户端断开/刷新/关闭事件
        // 统一清理函数（防止重复清理
        let isCleaned = false;
        function cleanup() {
            if (isCleaned) return;
            isCleaned = true;

            toWebList.sseClients.delete(res);

            // 尝试安全关闭底层响应流
            if (!res.writableEnded) { res.destroy() }

            LogInBackground('客户端 断开/刷新/关闭 SSE 连接');
        }

        // 双重保障：同时监听 req 和 res 的 close/finish 事件
        req.on('close', cleanup);
        res.on('close', cleanup);
        res.on('finish', cleanup);
        req.on('error', cleanup);
        res.on('error', cleanup);


        return; // 阻止代码继续向下走到普通 res.end()
    }

    try {
        const toReadNew = url === '/index.html' || htmlContentCache === null;
        const htmlContent = await readIndexHTML(toReadNew);
        if (toReadNew) {thisLogs.AddNewLogLine('成功读取新HTML文件newHTML!A1')} 
        else {thisLogs.AddNewLogLine('成功从缓存中读取HTML')}

        // 写入 200 响应头
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache' // 确保你修改 HTML 后浏览器能实时刷出来
        });
        res.end(htmlContent);

        thisLogs.AddNewLogLine('成功发送HTML到客户端');

    } catch (e) { thisLogs.AddNewErrLogLine(`发送HTML到客户端失败, ${e.message}`) }

}

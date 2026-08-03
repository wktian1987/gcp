import { ToStrictString, GetGS } from "./utility.js";

let htmlContent = null;
export async function readIndexHTML(toReadNew = false) {
    const TradingBot_00_ID = process.env.SHEET_ID;
    const newHTMLregion = 'newHTML!A1';
    if (htmlContent === null || toReadNew) {
        const newHTMLstr = (await GetGS(TradingBot_00_ID, newHTMLregion))[0][0];
        htmlContent = ToStrictString(newHTMLstr);
    }
    return htmlContent;
}

export const toWebList = {
    sseClients: new Set(),
    listSet: new Set(),
    limit: 100,
    AddNewLine(newLine) {
        if (this.listSet.has(newLine)) { this.listSet.delete(newLine) }
        this.listSet.add(newLine);
        if (this.listSet.size > this.limit) { this.listSet.delete(this.listSet.keys().next().value) }
        this.HandleSSE();
    },
    HandleSSE() {
        if (this.sseClients.size === 0) { return }
        for (const client of this.sseClients) {
            try {
                client.write(`data: ${JSON.stringify(Array.from(this.listSet))}\n\n`);
            } catch (e) {
                this.sseClients.delete(client);
            }
        }
    }
};

export async function Web(thisLogs, url, req, res) {
    thisLogs.AddNewLogLine('开始处理');
    if (url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        thisLogs.AddNewLogLine('处理 favicon：忽略并返回 204');
        return;
    }

    if (url === '/stream') {
        // 1. 设置 SSE 核心 HTTP 响应头（刚性防线）
        res.writeHead(200, {
            'Content-Type': 'text/event-stream', // 必须：指定为事件流格式
            'Cache-Control': 'no-cache, no-transform',          // 必须：禁止客户端/代理缓存
            'Connection': 'keep-alive',           // 必须：保持 HTTP 长连接不关闭
            'Access-Control-Allow-Origin': '*' ,   // 选填：按需跨域支持
            'X-Accel-Buffering' : 'no'
        });

        // 2. 发送初始连接成功事件（符合 SSE 标准格式 "data: xxx\n\n"）
        res.write(`data: ${JSON.stringify({ message: 'SSE 连接成功！' })}\n\n`);

        // 3. 将 theWebList 中的数据转换为数组，一次性全量打包发送
        // 💡 物理原理：Array.from() 解析 Set，序列化为 JSON 数组一次性吐给前端
        const currentList = Array.from(toWebList.listSet); // 当我的theWebList发生变化的时候，这里会自动更新，并通过SSE发给客户端吗
        res.write(`data: ${JSON.stringify(currentList)}\n\n`);
        thisLogs.AddNewLogLine(`已通过 SSE 推送当前 ${currentList.length} 条历史数据`);

        // 4. 将当前客户端加入 SSE 客户端列表
        toWebList.sseClients.add(res);

        // 5. 监听客户端断开连接事件（防内存泄漏 & 句柄挂起）
        // 🛡️ 修复：保证 req 已正确作为参数传入
        req.on('close', () => {
            toWebList.sseClients.delete(res);
            thisLogs.AddNewLogLine('客户端断开 SSE 连接，已安全移出');
        });

        return; // 阻止代码继续向下走到普通 res.end()

    }

    try {
        const toReadNew = url === '/index.html';
        const htmlContent = await readIndexHTML(toReadNew);
        // 写入 200 响应头
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache' // 确保你修改 HTML 后浏览器能实时刷出来
        });
        res.end(htmlContent);
        thisLogs.AddNewLogLine('成功读取并返回 newHTML!A1');
    } catch (e) { thisLogs.AddNewErrLogLine(`发送newHTML!A1 失败：${e.message}`) }

}

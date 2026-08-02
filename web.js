import { ToStrictString, GetGS } from "./utility";

let htmlContent = null ;
export async function readIndexHTML(toReadNew = false) {
    const TradingBot_00_ID  = process.env.SHEET_ID  ;
    const newHTMLregion     = 'newHTML!A1'          ;
    if (htmlContent === null || toReadNew) { 
        const newHTMLstr = (await GetGS(TradingBot_00_ID, newHTMLregion))[0][0];
        htmlContent = ToStrictString(newHTMLstr) ;
    }
    return htmlContent ;
}

export async function Web(thisLogs, url, res) {
    thisLogs.AddNewLogLine('开始处理') ;
    if (url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        thisLogs.AddNewLogLine('处理 favicon：忽略并返回 204');
        return;
    }

    // 帮我写一段代码，将'./web/index.html'文件的内容读取出来，并返回给客户端
    // 3. 读取并返回 ./web/index.html 内容
    try {
        const htmlContent = await readIndexHTML();
        // 写入 200 响应头
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache' // 确保你修改 HTML 后浏览器能实时刷出来
        });

        // 输出文件内容
        res.end(htmlContent);
        thisLogs.AddNewLogLine('成功读取并返回 index.html');

    } catch (e) { thisLogs.AddNewErrLogLine(`发送index.html 失败：${e.message}`) }








}

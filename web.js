import { ToStrictString, GetGS, LogInBackground, UpdateGS } from "./utility.js";

const toWeb = {
    spreadsheetID : process.env.SHEET_ID,
    newHTMLregion: 'web!A1',
    tradeListRegion: 'web!B2:B',
    handleListRegion: 'web!C2:C',
    errorListRegion: 'web!D2:D',
    htmlContentCache : null ,
    sseClients: new Set(),
    alreadyReadHistory : false , 
    handleList: [],
    tradeList: [],
    errorList: [],
    listLimit: 99,
    globalWebHeartBeat: null,

    async readIndexHTML(toReadNew = false) {
        if (this.htmlContentCache === null || toReadNew) {
            const newHTMLstr = (await GetGS(this.spreadsheetID, this.newHTMLregion))[0][0];
            this.htmlContentCache = ToStrictString(newHTMLstr);
        }
        return this.htmlContentCache;
    } ,

    async listWriteToGS(listName) {
        let writeRegion ;
        let writeA2d  ;
        switch(listName) {
            case 'trade':
                writeRegion = this.tradeListRegion;
                writeA2d = this.tradeList.map((item) => [item]);
                break;
            case 'handle':
                writeRegion = this.handleListRegion;
                writeA2d  = this.handleList.map((item) => [item]);
                break;
            case 'error':
                writeRegion = this.errorListRegion;
                writeA2d  = this.errorList.map((item) => [item]);
                break;
            default:
                throw new Error('listWriteToGS: listName not found');
        }

        try {
            await UpdateGS(this.spreadsheetID, writeRegion, writeA2d) ;
            LogInBackground('listWriteToGS: ' + listName + ' write to GS success');
        } catch (err) {
            LogInBackground({ severity: 'ERROR', message: 'listWriteToGS UpdateGS Err: ' + err.message });
        }

    } ,

    async readHistoryFromGS() {
        if (this.alreadyReadHistory) { return true }
        try {
            const tradeList = (await GetGS(this.spreadsheetID, this.tradeListRegion)).map((item) => item[0]);
            const handleList = (await GetGS(this.spreadsheetID, this.handleListRegion)).map((item) => item[0]);
            const errorList = (await GetGS(this.spreadsheetID, this.errorListRegion)).map((item) => item[0]);
            this.tradeList = tradeList;
            this.handleList = handleList;
            this.errorList = errorList;
            this.alreadyReadHistory = true;
            LogInBackground('readHistoryFromGS success') ;
            return true ;
        } catch (err) {
            LogInBackground({ severity: 'ERROR', message: 'readHistoryFromGS Err: ' + err.message });
            return false ;
        }
    },

    async AddNewLine({ type, content}) {
        const contentLine = ToStrictString(content).trim().replaceAll('\n', ' ;; ');

        await this.readHistoryFromGS().catch(() => { });

        if (type === 'trade') {
            this.tradeList.push(contentLine);
            if (this.tradeList.length > this.listLimit) {
                this.tradeList.splice(0, this.tradeList.length - this.listLimit); // 从索引 0 开始，一次性删除 overCount 个元素
            }
            this.listWriteToGS('trade').catch(() => { });
        }
        if (type === 'handle') {
            this.handleList.push(contentLine);
            if (this.handleList.length > this.listLimit) {
                this.handleList.splice(0, this.handleList.length - this.listLimit); // 从索引 0 开始，一次性删除 overCount 个元素
            }
            this.listWriteToGS('handle').catch(() => { });
        }
        if (type === 'error') {
            this.errorList.push(contentLine);
            if (this.errorList.length > this.listLimit) {
                this.errorList.splice(0, this.errorList.length - this.listLimit); // 从索引 0 开始，一次性删除 overCount 个元素
            }
            this.listWriteToGS('error').catch(() => { });
            }



        if (this.sseClients.size === 0) {
            LogInBackground('没有客户端连接, 不推送SSE事件' + '\n' + `type: ${type}, content: ${contentLine}`);
            if (this.globalWebHeartBeat) {
                clearInterval(this.globalWebHeartBeat);
                this.globalWebHeartBeat = null;
            }
        } else {
            this.HandleSSE({ type, contentLine });
            this.triggerHeartBeat();
        }
    },

    triggerHeartBeat() {
        if (this.globalWebHeartBeat) {
            clearInterval(this.globalWebHeartBeat);
            this.globalWebHeartBeat = null;
        }
        this.globalWebHeartBeat = setInterval(() => {
            this.HandleSSE({ type: 'ping', content: 'ping' });
        }, 10000);
    },

    HandleSSE({ type, contentLine }) {
        if (this.sseClients.size === 0) {
            LogInBackground('没有客户端连接, 不推送SSE事件' + '\n' + `type: ${type}, content: ${contentLine}`);
            if (this.globalWebHeartBeat) {
                clearInterval(this.globalWebHeartBeat);
                this.globalWebHeartBeat = null;
            }
        } 

        for (const client of this.sseClients) {
            // 💡 1. 检查底层 Socket 状态：如果连接已销毁或不具备可写性，立刻删除
            if (client.destroyed || client.writableEnded || !client.writable) {
                this.sseClients.delete(client);
                continue;
            }
            client.write(`data: ${JSON.stringify({ type, content: contentLine })}\n\n`, (e) => {
                if (e) {
                    this.sseClients.delete(client);
                    if (!client.destroyed) {
                        client.destroy();
                    }
                }
            });

        }
        LogInBackground(`已通过SSE广播 ${type} 事件给 ${this.sseClients.size} 个客户端`);
    }
};
// await toWeb.readHistoryFromGS().catch(() => { });

export async function ToWebListAddNewLine({ type, content }) { await toWeb.AddNewLine({ type, content }) }
export async function readIndexHTML(toReadNew) { await toWeb.readIndexHTML(toReadNew) }

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
        const readHistoryListResult = await toWeb.readHistoryFromGS();
        if (!readHistoryListResult) { 
            thisLogs.AddNewErrLogLine(`readHistoryFromGS failed`) ;
            return ;
        }
        res.write(`data: ${JSON.stringify(toWeb.tradeList .map((item) => ({ type: 'trade' , content: item })))}\n\n`);
        res.write(`data: ${JSON.stringify(toWeb.handleList.map((item) => ({ type: 'handle', content: item })))}\n\n`);
        res.write(`data: ${JSON.stringify(toWeb.errorList .map((item) => ({ type: 'error' , content: item })))}\n\n`);
        thisLogs.AddNewLogLine(`已通过SSE推送当前历史数据`);

        // 将当前客户端加入 SSE 客户端列表
        toWeb.sseClients.add(res);

        toWeb.triggerHeartBeat() ;

        // 监听客户端断开连接事件（防内存泄漏 & 句柄挂起）
        // 监听客户端断开/刷新/关闭事件
        // 统一清理函数（防止重复清理
        let isCleaned = false;
        function cleanup() {
            if (isCleaned) return;
            isCleaned = true;

            toWeb.sseClients.delete(res);

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
        const toReadNew = url === '/index.html' || toWeb.htmlContentCache === null;
        const htmlContent = await toWeb.readIndexHTML(toReadNew);
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

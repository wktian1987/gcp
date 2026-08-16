import { ToStrictString, GetGS, LogInBackground, UpdateGS, ToStrictNumber, LogInBackground_error, BatchUpdateGS, makeRequestBodyArrayofBatchUpdate_updateLinesOnTheTop, GetSheetsIDfromSheet, isStrictFalse, isStrictTrue, Sleep } from "./utility.js";

const toWeb = {
    sheetName : 'web' ,
    spreadsheetID : process.env.SHEET_ID,
    sheetID : null ,
    newHTMLregion: 'web!A1',
    isWritingToGS: false ,
    tradeListRegion: 'web!B2:B100',
    handleListRegion: 'web!C2:C100',
    errorListRegion: 'web!D2:D100',
    htmlContentCache : null ,
    alreadyReadHistory : false , 
    handleList: [],
    tradeList: [],
    errorList: [],
    listLimit: 99,

    async GetWebSheetID() {
        if (this.sheetID === null) {
            const sheetIDs = await GetSheetsIDfromSheet(this.spreadsheetID);
            this.sheetID = sheetIDs[this.sheetName] ;
        }
        return this.sheetID;    
    } ,

    async readIndexHTML(toReadNew = false) {
        if (this.htmlContentCache === null || toReadNew) {
            const newHTMLstr = (await GetGS(this.spreadsheetID, this.newHTMLregion))[0][0];
            this.htmlContentCache = ToStrictString(newHTMLstr);
        }
        return this.htmlContentCache;
    } ,

    async listWriteToGS(type, messageLine) {
        // listName: 'trade', 'handle', 'error'
        const sheetID = await this.GetWebSheetID();
        const updateLinesOnTheTopObj = {sheetID} ;

        switch(type) {
            case 'trade':
                updateLinesOnTheTopObj.range = this.tradeListRegion;
                updateLinesOnTheTopObj.values = [[messageLine]] ;
                break;
            case 'handle':
                updateLinesOnTheTopObj.range = this.handleListRegion;
                updateLinesOnTheTopObj.values  =  [[messageLine]] ;
                break;
            case 'error':
                updateLinesOnTheTopObj.range = this.errorListRegion;
                updateLinesOnTheTopObj.values  =  [[messageLine]] ;
                break;
            default:
                throw new Error('listWriteToGS: type not found');
        }

        try {
            const requestBody = makeRequestBodyArrayofBatchUpdate_updateLinesOnTheTop(updateLinesOnTheTopObj) ;
            if (isStrictTrue(this.isWritingToGS)) {
                const waitStartTime = Date.now();
                while (isStrictTrue(this.isWritingToGS)) {
                    await Sleep(1000) ;
                    if (Date.now() - waitStartTime > 10000) {
                        LogInBackground_error('listWriteToGS timeout, 强行写入; '+ `type: ${type}, messageLine: ${messageLine}`); 
                    }
                }
            } else {
                this.isWritingToGS = true;
                await BatchUpdateGS(this.spreadsheetID, requestBody);
                this.isWritingToGS = false;
                LogInBackground('listWriteToGS success: \n' + `type: ${type}\n` + `messageLine: ${messageLine}`);
            }

        } catch (err) { LogInBackground_error('listWriteToGS UpdateGS Err: ' + err.message) }

    } ,

    async readHistoryFromGS() {
        if (this.alreadyReadHistory) { return true }
        try {
            this.tradeList  = (await GetGS(this.spreadsheetID, this.tradeListRegion )).map( (item) => ({ timeID: 0, messageLine: item[0] }) ) ;
            this.handleList = (await GetGS(this.spreadsheetID, this.handleListRegion)).map( (item) => ({ timeID: 0, messageLine: item[0] }) ) ;
            this.errorList  = (await GetGS(this.spreadsheetID, this.errorListRegion )).map( (item) => ({ timeID: 0, messageLine: item[0] }) ) ;
            this.tradeList.reverse() ;
            this.handleList.reverse() ;
            this.errorList.reverse() ;
            this.alreadyReadHistory = true;
            LogInBackground('readHistoryFromGS success') ;
            return true ;
        } catch (err) { LogInBackground_error('readHistoryFromGS Err: ' + err.message); return false; }
    },

    async AddNewLine({ type, message }) {
        const timeID = Date.now();
        const messageLine = ToStrictString(message).trim().replaceAll('\n', ' ;; ');

        const r_readHistoryFromGS = await this.readHistoryFromGS();
        if (!r_readHistoryFromGS) {LogInBackground_error('readHistoryFromGS failed'); return; }

        // 1. 使用集合（Set）快速校验 type
        const VALID_TYPES = new Set(['trade', 'handle', 'error']);

        if (VALID_TYPES.has(type)) {
            // 2. 直接获取对应数组引用，并做防空兜底（如果没定义则默认为空数组）
            const targetList = this[`${type}List`] ||= [];

            // 3. 压入新消息
            targetList.push({ timeID, messageLine });

            // 4. 超长修剪（由于每次 push 1 条，通常超出 1 条，用 shift 效率更高）
            if (targetList.length > this.listLimit) {
                // targetList.shift(); // 直接弹出最早入队的那一条
                // 如果每次可能一次性 push 多条，保留 splice：
                targetList.splice(0, targetList.length - this.listLimit);
            }

            // 5. 异步写入持久化（捕捉错误防止未捕获异常）
            this.listWriteToGS(type, messageLine).catch(() => { });
        }

    }
};
export async function ToWeb_readIndexHTML(toReadNew) { await toWeb.readIndexHTML(toReadNew) }
export async function ToWeb_AddNewLine({ type, message }) { await toWeb.AddNewLine({ type, message }) }

export async function Web(thisLogs, req, res) {
    if (req.method !== 'GET') { thisLogs.AddNewErrLogLine('Web: only GET method allowed'); return; }

    thisLogs.AddNewLogLine('开始处理');

    const r_readHistoryFromGS = await toWeb.readHistoryFromGS();
    if (!r_readHistoryFromGS) { thisLogs.AddNewErrLogLine('readHistoryFromGS failed'); return; }

    const parsedURL = new URL(req.url, `http://${req.headers.host}`);
    const pathName = parsedURL.pathname; // 如果URL 是 /favicon.ico, 则返回 /favicon.ico
    const searchParams = parsedURL.searchParams;

    if (pathName === '/favicon.ico') {
        thisLogs.toWeb = false ;
        
        res.writeHead(204);
        res.end();
        thisLogs.AddNewLogLine('处理 favicon, 忽略并返回 204');
        return;
    }

    if (pathName === '/api/get-latest-data') {
        thisLogs.toWeb = false ;

        try {
            const last_timeID_trade  = ToStrictNumber( searchParams.get('last_timeID_trade' ) , -1 ) ; // 如果字段是数字形式，它是字符串还是数字
            const last_timeID_handle = ToStrictNumber( searchParams.get('last_timeID_handle') , -1 ) ;
            const last_timeID_error  = ToStrictNumber( searchParams.get('last_timeID_error' ) , -1 ) ;

            const res_messageLines_trade  = toWeb.tradeList .filter((item) => item.timeID > last_timeID_trade ).map((item) => item.messageLine) ;
            const res_messageLines_handle = toWeb.handleList.filter((item) => item.timeID > last_timeID_handle).map((item) => item.messageLine) ;
            const res_messageLines_error  = toWeb.errorList .filter((item) => item.timeID > last_timeID_error ).map((item) => item.messageLine) ;

            const res_last_timeID_trade  = res_messageLines_trade .length  > 0 ? toWeb.tradeList [toWeb.tradeList .length - 1].timeID  : last_timeID_trade  ;
            const res_last_timeID_handle = res_messageLines_handle.length  > 0 ? toWeb.handleList[toWeb.handleList.length - 1].timeID  : last_timeID_handle ;
            const res_last_timeID_error  = res_messageLines_error .length  > 0 ? toWeb.errorList [toWeb.errorList .length - 1].timeID  : last_timeID_error  ;

            const res_tradeList  = {res_last_timeID: res_last_timeID_trade  , res_messageLines: res_messageLines_trade } ;
            const res_handleList = {res_last_timeID: res_last_timeID_handle , res_messageLines: res_messageLines_handle} ;
            const res_errorList  = {res_last_timeID: res_last_timeID_error  , res_messageLines: res_messageLines_error } ;

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ res_tradeList, res_handleList, res_errorList }));

        } catch (error) {
            LogInBackground_error(`Web服务端内部错误: ${error.message}`) ;
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }


    try {
        const toReadNew = pathName === '/index.html' || toWeb.htmlContentCache === null;
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

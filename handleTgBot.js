import {
    SendTG,
    SendEmail,
    FormatMatrixToString,
    ConvertRowsToHtmlTable,
    GetSpreadsheetID,
    GetGS,
    isStrictString,
    A2dToCleanObj,
    Sleep,
    AddMessage,
    StrFromSetMessage
} from "./utility.js";

import {TradeBot} from './handleTV.js';

export async function HandleTgBot(msg) {
    const myTgID            = process.env.myTgID        ;
    const myGroupAlertTgID  = process.env.TG_CHAT_ID    ;

    const Range_toGCP       = "toGCP!A:B"   ;
    const botNumber_start   = 'TradingBot_' ;

    const chat_id   = String(msg.chat.id || "unknown").trim()   ;
    const text      = msg.text || ""                            ;

    // 只处理我或者群内发来的消息
    if (chat_id !== myTgID && chat_id !== myGroupAlertTgID) {
        await SendTG("收到未授权联系人信息", "已忽略本条消息", myTgID);
        await Sleep(1000);
        await SendTG("收到未授权联系人信息", "已忽略本条消息", myGroupAlertTgID);
        throw new Error("收到未授权联系人信息, 已忽略本条消息");
    }

    const botNumber = (txt => {
        if (!txt) return null;
        const match = txt.match(/trd(\d{2})/); // 匹配 trd 加上两位数字
        return match ? `${botNumber_start}${match[1]}` : null;
    })(text);

    if (!isStrictString(botNumber) || !botNumber.startsWith(botNumber_start)) {
        await SendTG("消息格式错误", "请检查", chat_id);
        throw new Error("消息格式错误, 请检查") ;
    }

    if (text.toUpperCase().includes('RESET')) {
        let resetMessage = '' ;
        const LockTimeName       =  botNumber + '_lockTime'       ; // 全局中的锁名
        const RunningWellName    =  botNumber + '_runningWell'    ; // 全局中的出错名
        const SpreadsheetIDName  =  botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID, 避免每次重新读取

        if (Date.now() - TradeBot[LockTimeName] < 5 * 60 *1000) {
            resetMessage = AddMessage(resetMessage, '当前机器人正在运行, 或者未超时, 请等待5分钟后再解锁') ;
            resetMessage = AddMessage(resetMessage, '_runningWell: \n' + StrFromSetMessage(TradeBot[RunningWellName])) ;
        } else {
            resetMessage = AddMessage(resetMessage, '属性删除前的值为:') ;
            resetMessage = AddMessage(resetMessage, '_lockTime: \n' + TradeBot[LockTimeName]) ;
            resetMessage = AddMessage(resetMessage, '_runningWell: \n' + StrFromSetMessage(TradeBot[RunningWellName])) ;
            resetMessage = AddMessage(resetMessage, '_spreadsheetID: \n' + TradeBot[SpreadsheetIDName]) ;
            delete TradeBot[LockTimeName       ]   ;
            delete TradeBot[RunningWellName    ]   ;
            delete TradeBot[SpreadsheetIDName  ]   ;
            resetMessage = AddMessage(resetMessage, '属性删除成功');
        }

        await SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id) ;

    }

    const spreadsheetID = await GetSpreadsheetID(botNumber);

    const toGCPData = A2dToCleanObj(await GetGS(spreadsheetID, Range_toGCP) ) ;


    const toTGData = await GetGS(spreadsheetID, toGCPData.toReadRange);
    const toTGDataString = FormatMatrixToString(toTGData);
    const sendTGTask = SendTG(botNumber, toTGDataString, chat_id);

    const toEmailData = await GetGS(spreadsheetID, toGCPData.toEmailRange);
    const mail_subject = botNumber;
    const toEmailHtml = ConvertRowsToHtmlTable(toEmailData);
    const sendMailTask = SendEmail(mail_subject, toEmailHtml);

    // 执行并发任务
    const handleResults = await Promise.allSettled([sendTGTask, sendMailTask]);
    let thereTaskErr = false;
    let errMessage = '';
    handleResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
            errMessage += AddMessage(errMessage, (index === 0 ? "发送TG" : "发送Email") + '成功');
        }
        if (result.status !== "fulfilled") {
            thereTaskErr = true;
            errMessage += AddMessage(errMessage, (index === 0 ? "发送TG" : "发送Email") + '失败');
        }
    });

    if (thereTaskErr) {throw new Error(errMessage)}

}
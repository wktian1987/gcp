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
    StrFromSetMessage,
    GetTimeStringWithOffset,
    isStrictNumber
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
        const tgResetName        =  botNumber + '_tgReset'        ; // 全局中的RESET名
        const LockTimeName       =  botNumber + '_lockTime'       ; // 全局中的锁名
        const RunningWellName    =  botNumber + '_runningWell'    ; // 全局中的出错名
        const SpreadsheetIDName  =  botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID

        let resetMessage = '' ;

        if (!Object.hasOwn(TradeBot, tgResetName)) {
            resetMessage = `机器人还未创建, 没必要RESET` ;
            await SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id) ;
        } 

        if (Object.hasOwn(TradeBot, tgResetName) && TradeBot[tgResetName] === true) {
            resetMessage = `RESET已设, 但TradeBot还未接收, 没必要重设` ;
            await SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id) ;
        }
        
        if (Object.hasOwn(TradeBot, tgResetName) && TradeBot[tgResetName] === false) {
            if (TradeBot[LockTimeName] === null) {resetMessage = '当前机器人处于未锁定状态, 无需RESET'}

            if (isStrictNumber(TradeBot[LockTimeName]) && Date.now() - TradeBot[LockTimeName] < 5 * 60 *1000) {
                resetMessage = AddMessage(resetMessage, '当前机器人正在运行, 或者未超时, 请等待5分钟后再解锁') ;
            } 
            
            if (isStrictNumber(TradeBot[LockTimeName]) && Date.now() - TradeBot[LockTimeName] >= 5 * 60 *1000) {
                TradeBot[tgResetName] = true ;
                resetMessage = AddMessage(resetMessage, '属性RESET前全局中的值为:') ;
                resetMessage = AddMessage(resetMessage, 'lockTime: \n' + TradeBot[LockTimeName] + '\n' + GetTimeStringWithOffset(8, TradeBot[LockTimeName])) ;
                resetMessage = AddMessage(resetMessage, 'runningWell: \n' + StrFromSetMessage(TradeBot[RunningWellName])) ;
                resetMessage = AddMessage(resetMessage, 'spreadsheetID: \n' + TradeBot[SpreadsheetIDName]) ;
                resetMessage = AddMessage(resetMessage, 'RESET信号已创建, 等待TradeBot接收');
            }

            await SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id) ;
        }
    }

    const spreadsheetID = await GetSpreadsheetID(botNumber);

    const toGCPData = A2dToCleanObj(await GetGS(spreadsheetID, Range_toGCP) ) ;


    const toTGData = await GetGS(spreadsheetID, toGCPData.toReadRange);
    const toTGDataString = FormatMatrixToString(toTGData);
    const task_SendTG = SendTG(botNumber, toTGDataString, chat_id);

    const toEmailData = await GetGS(spreadsheetID, toGCPData.toEmailRange);
    const mail_subject = botNumber;
    const toEmailHtml = ConvertRowsToHtmlTable(toEmailData);
    const task_SendEmail = SendEmail(mail_subject, toEmailHtml);

    // 执行并发任务
    const handleResults = await Promise.allSettled([task_SendTG, task_SendEmail]);
    let task_thereErr = false   ;
    let task_message  = ''      ;
    let task_name     = ''      ;
    handleResults.forEach((result, index) => {
        if (index === 0) {task_name = '发送TG'     }
        if (index === 1) {task_name = '发送Email'  }

        if (result.status === "fulfilled") {
            task_message += AddMessage(task_message, task_name + '成功');
        }
        if (result.status !== "fulfilled") {
            task_thereErr = true;
            task_message += AddMessage(task_message, task_name + '失败');
        }
    });

    if (task_thereErr) {throw new Error(task_message)}

}
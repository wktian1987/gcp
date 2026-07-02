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
    isStrictNumber,
    BatchGetGS,
    isStrictTrue,
    isStrictFalse
} from "./utility.js";

import {TradeBot} from './handleTV.js';
import { stopHandleNewSignals, ToStopSartNewSignals } from "./index.js";
import { HandleUnreadGmails } from "./handleUnreadGmails.js";
import { testA1FromGS00 } from "./Test.js";


const tempStore = {} ;
export async function HandleTgBot(msg) {
    const myTgID            = process.env.myTgID        ;
    const myGroupAlertTgID  = process.env.TG_CHAT_ID    ;

    const Range_toGCP       = "toGCP!A:B"   ;
    const botNumber_start   = 'TradingBot_' ;

    const chat_id   = String(msg.chat.id || "unknown").trim()   ;
    const text      = msg.text || ""                            ;
    if (!text) {return };

    // 只处理我或者群内发来的消息
    if (chat_id !== myTgID && chat_id !== myGroupAlertTgID) {
        SendTG("收到未授权联系人信息", "已忽略本条消息", myTgID).catch(()=>{});
        await Sleep(1000);
        SendTG("收到未授权联系人信息", "已忽略本条消息", myGroupAlertTgID).catch(()=>{});
        return ;
    }

    if (text.toUpperCase().includes('STOPHANDLENEWSIGNALS')) {
        let message = '停止对新的信号进行处理';
        if (stopHandleNewSignals) { message = '已经发送停止新信号处理命令, 无需再次发送' } else { 
            const r = ToStopSartNewSignals('toStop') ;
            if (!r) {message = 'there error in handle this message'}
        }
        SendTG(`收到stop handle New Signals信号`, message, chat_id).catch(() => { });
        return ;
    }

    if (text.toUpperCase().includes('STARTHANDLENEWSIGNALS')) {
        let message = '开始对新的信号进行处理';
        if (!stopHandleNewSignals) { message = '现在新的信号处理正常, 无需手动开始' } else { 
            const r = ToStopSartNewSignals('toStart') ;
            if (!r) {message = 'there error in handle this message'}
        }
        SendTG(`收到start handle New Signals信号`, message, chat_id).catch(() => { });
        return ;
    }

    if (text.toUpperCase().includes('HANDLEUNREADGMAILS')) {
        SendTG(`收到HandleUnreadGmails信号`, '开始处理未读Gmail邮件', chat_id).catch(() => { });
        try {
            await HandleUnreadGmails(chat_id);
            SendTG(`HandleUnreadGmails信号处理结束`, 'HandleUnreadGmails信号处理成功', chat_id).catch(() => { });
        } catch(e) {
            SendTG(`HandleUnreadGmails信号处理结束`, 'HandleUnreadGmails信号处理失败 \n' + e.message, chat_id).catch(() => { });
        }
        return ;
    }

    if (text.toUpperCase().includes('TEST')) {
        SendTG(`收到TEST信号`, '开始测试Test.js文件中的testA1FromGS00()', chat_id).catch(() => { });
        await testA1FromGS00(chat_id) ;
        return ;
    }

    const botNumber = (txt => {
        const match = txt.match(/trd(\d{2})/); // 匹配 trd 加上两位数字
        return match ? `${botNumber_start}${match[1]}` : null;
    })(text);

    if (!isStrictString(botNumber) || !botNumber.startsWith(botNumber_start)) {
        if (!text.toUpperCase().includes('STOPHANDLENEWSIGNALS') && !text.toUpperCase().includes('STARTHANDLENEWSIGNALS')) {
            SendTG("消息格式错误", "请检查", chat_id).catch(()=>{});
        }
        return ;
    }

    if (text.toUpperCase().includes('RESETGSLOCK')) {
        const tbName_TGID           =  botNumber + '_TGID'              ;
        const tbName_tgResetGSLOCK  =  botNumber + '_tgResetGSLOCK'     ;

        let resetGSLOCKMessage = '' ;

        if (!Object.hasOwn(TradeBot, tbName_tgResetGSLOCK)) {
            resetGSLOCKMessage = `机器人还未创建, 没必要RESET GSLOCK` ;
            SendTG(`${botNumber} 收到RESETGSLOCK信号`, resetGSLOCKMessage, chat_id).catch(()=>{}) ;
            return ;
        } 

        if (Object.hasOwn(TradeBot, tbName_tgResetGSLOCK) && isStrictTrue(TradeBot[tbName_tgResetGSLOCK])) {
            resetGSLOCKMessage = `RESETGSLOCK已设, 但TradeBot还未接收, 没必要重设` ;
            SendTG(`${botNumber} 收到RESETGSLOCK信号`, resetGSLOCKMessage, chat_id).catch(()=>{}) ;
            return ;
        }
        
        if (Object.hasOwn(TradeBot, tbName_tgResetGSLOCK) && isStrictFalse(TradeBot[tbName_tgResetGSLOCK]) ) {
            resetGSLOCKMessage  = 'RESETGSLOCK信号已创建, 等待TradeBot接收' ;
            TradeBot[tbName_TGID]           = chat_id   ;
            TradeBot[tbName_tgResetGSLOCK]  = true      ;

            SendTG(`${botNumber} 收到RESETGSLOCK信号`, resetGSLOCKMessage, chat_id).catch(()=>{}) ;
            return ;
        }

    if (text.toUpperCase().includes('RESET')) {
        const tbName_TGID           =  botNumber + '_TGID'              ;
        const tbName_tgReset        =  botNumber + '_tgReset'           ;

        let resetMessage = '' ;

        if (!Object.hasOwn(TradeBot, tbName_tgReset)) {
            resetMessage = `机器人还未创建, 没必要RESET` ;
            SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id).catch(()=>{}) ;
            return ;
        } 

        if (Object.hasOwn(TradeBot, tbName_tgReset) && isStrictTrue(TradeBot[tbName_tgReset])) {
            resetMessage = `RESET已设, 但TradeBot还未接收, 没必要重设` ;
            SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id).catch(()=>{}) ;
            return ;
        }
        
        if (Object.hasOwn(TradeBot, tbName_tgReset) && isStrictFalse(TradeBot[tbName_tgReset]) ) {
            resetMessage = `RESET信号已创建, 等待TradeBot接收` ;
            TradeBot[tbName_TGID]       = chat_id   ;
            TradeBot[tbName_tgReset]    = true      ;

            SendTG(`${botNumber} 收到RESET信号`, resetMessage, chat_id).catch(()=>{}) ;
            return ;
        }

    }



    }

    const tbName_spreadsheetID  =  botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID
    const spreadsheetID = Object.hasOwn(TradeBot, tbName_spreadsheetID) && isStrictString(TradeBot[tbName_spreadsheetID]) ? TradeBot[tbName_spreadsheetID] : await GetSpreadsheetID(botNumber);

    const toReadRangeName  = botNumber + '_toReadRange'     ;
    const toEmailRangeName = botNumber + '_toEmailRange'    ;
    if (!isStrictString(tempStore[toReadRangeName]) || !isStrictString(tempStore[toEmailRangeName])) {
        const toGCPData = A2dToCleanObj(await GetGS(spreadsheetID, Range_toGCP) ) ;
        tempStore[toReadRangeName]  = toGCPData.toReadRange     ;
        tempStore[toEmailRangeName] = toGCPData.toEmailRange    ;
    }
    let DataFromGS = await BatchGetGS(spreadsheetID, [tempStore[toReadRangeName], tempStore[toEmailRangeName], Range_toGCP]) ;
    const toGCPData = A2dToCleanObj(DataFromGS[2]) ;
    if (tempStore[toReadRangeName] !== toGCPData.toReadRange || tempStore[toEmailRangeName] !== toGCPData.toEmailRange) {
        tempStore[toReadRangeName]  = toGCPData.toReadRange     ;
        tempStore[toEmailRangeName] = toGCPData.toEmailRange    ;
        DataFromGS = await BatchGetGS(spreadsheetID, [tempStore[toReadRangeName], tempStore[toEmailRangeName]]) ;
    }

    const toTGData    = DataFromGS[0];
    const toEmailData = DataFromGS[1];

    const toTGDataString = FormatMatrixToString(toTGData);
    // const task_SendTG = SendTG(botNumber, toTGDataString, chat_id);
    SendTG(botNumber, toTGDataString, chat_id).catch(()=>{}) ;

    const toEmailHtml = ConvertRowsToHtmlTable(toEmailData);
    // const task_SendEmail = SendEmail(botNumber, toEmailHtml);
    SendEmail(botNumber, toEmailHtml).catch(()=>{}) ;

    // // 执行并发任务
    // const handleResults = await Promise.allSettled([task_SendTG, task_SendEmail]);
    // let task_thereErr = false   ;
    // let task_message  = ''      ;
    // let task_name     = ''      ;
    // handleResults.forEach((result, index) => {
    //     if (index === 0) {task_name = '发送TG'     }
    //     if (index === 1) {task_name = '发送Email'  }

    //     if (result.status === "fulfilled") {
    //         task_message += AddMessage(task_message, task_name + '成功');
    //     }
    //     if (result.status !== "fulfilled") {
    //         task_thereErr = true;
    //         task_message += AddMessage(task_message, task_name + '失败');
    //     }
    // });

    // if (task_thereErr) {throw new Error(task_message)}

}

import {GetTimeStringWithOffset         , 
        SendSplitTGMessages             ,
        GetSheetID                      ,                      
        FormatMatrixToString,            
        GetDataFromSheet} from "./utility.js";

import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });


export async function HandleTV(newDatasFromTV) {
    let datas = {};

    try {
        const spreadsheetId = GetSheetID(newDatasFromTV.botNumber);

        //获取现存数据
        let ranges  = await GetDataFromSheet(sheets, spreadsheetId, "toGCP!A:B");
        ranges      = Object.fromEntries(ranges);
        datas       = await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP);
        datas       = Object.fromEntries(datas);

        if (!datas.ifNoError || datas.ifNoError === "FALSE") {
            throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE"`) ;
        }

        newDatasFromTV.tvUpdateTime   = GetTimeStringWithOffset(8, newDatasFromTV.timestamp);
        newDatasFromTV.gcpGetTime     = GetTimeStringWithOffset(8);

















        const writeToRange = newDatasFromTV.sheetTitle + '!A:B'; // 指定操作 A 到 B 列
        // 1. 先清空该区域的所有数据
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: writeToRange,
        });

        // 2. 写入新数据
        const writeToSheet  = sheets.spreadsheets.values.update({
            spreadsheetId:spreadsheetId,
            range: writeToRange,
            valueInputOption: 'USER_ENTERED', // 允许自动识别数字/日期格式
            requestBody: {
                values: Object.entries(newDatasFromTV),
            },
        });
        // 发送tg消息
        const sentTgMessage = SendSplitTGMessages(  process.env.TG_TOKEN                            , 
                                                    process.env.TG_CHAT_ID                          , 
                                                    "Get TV webhook Message"                        , 
                                                    FormatMatrixToString(Object.entries(datas))     );

        await Promise.all([writeToSheet, sentTgMessage]);


        console.log('✔ TV数据写入表格成功');
    } catch (err) {
        throw new Error('✘ TV消息处理失败:', err.message);
    }

}


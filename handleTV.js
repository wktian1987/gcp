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


export async function HandleTV(req, res) {
    body.tvUpdateTime = GetTimeStringWithOffset(8, body.timestamp);
    body.gcpGetTime   = GetTimeStringWithOffset(8);

    // 可以在此处添加处理 TradingView Webhook 原始数据的逻辑
    // 例如：直接转发到 TG 或 写入 Google Sheets

    const spreadsheetId = GetSheetID(body.botNumber);

    //获取现存数据
    let ranges = await GetDataFromSheet(sheets, spreadsheetId, "toGCP!A:B");
    // ranges = matrx
    

















    const range         = body.sheetTitle + '!A:B'; // 指定操作 A 到 B 列

    try {
        // 1. 先清空该区域的所有数据
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range,
        });

        // 2. 写入新数据
        const dataToWrite = Object.entries(body);
        const writeToSheet = sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED', // 允许自动识别数字/日期格式
            requestBody: {
                values: dataToWrite,
            },
        });
        // 发送tg消息
        const sentTgMessage = SendSplitTGMessages(  process.env.TG_TOKEN                    , 
                                                    process.env.TG_CHAT_ID                  , 
                                                    "Get TV webhook Message"                , 
                                                    FormatMatrixToString(dataToWrite)       );

        await Promise.all([writeToSheet, sentTgMessage]);


        console.log('✅ TV数据写入表格成功');
    } catch (err) {
        console.error('❌ TV数据写入表格失败:', err);
        throw err;
    }

}


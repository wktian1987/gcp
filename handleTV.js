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

        if (!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol) {
            throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol`) ;
        }

        newDatasFromTV.tvUpdateTime   = GetTimeStringWithOffset(8, newDatasFromTV.timestamp);
        newDatasFromTV.gcpGetTime     = GetTimeStringWithOffset(8);

        if (newDatasFromTV.timestamp > datas.realTradeTime) {
            if (datas.crtFund === "toFill") {
                // 数据初始化
                datas.crtFund       =  Number(datas.inFund);
                datas.crtCoin       =  Number(datas.inCoin);
                datas.allFund       =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice;
                datas.initialFund   =  datas.allFund;
                datas.hghestFund    =  datas.allFund;
                datas.lowestFund    =  datas.allFund;
                datas.allCoin       =  datas.crtFund / newDatasFromTV.BaseCoinPrice + datas.crtCoin;
                datas.initialCoin   =  datas.allCoin;
                datas.hghestCoin    =  datas.allCoin;
                datas.lowestCoin    =  datas.allCoin;
                datas.allPosition   =  0;
                datas.usedMargin    =  0;
                datas.freeMargin    =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice * Number(datas.BaseCoinHairCut);
                datas.allTradeFee   =  0;
                datas.allFundFee    =  0;
                datas.netProfit     =  0;
                datas.openProfit    =  0;
                datas.avgBuyPrice   =  0;
            }

            // 收到新消息数据初始化
            datas.netProfit         =  Number(datas.netProfit);
            datas.avgBuyPrice       =  Number(datas.avgBuyPrice);
            datas.openProfit        =  Number(datas.allPosition) * (newDatasFromTV.TradingSymbolPrice - datas.avgBuyPrice) ;
            datas.crtFund           =  Number(datas.crtFund) + datas.openProfit;
            datas.crtCoin           =  Number(datas.crtCoin);
            datas.allFund           =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice;
            datas.initialFund       =  Number(datas.initialFund);
            datas.hghestFund        =  datas.allFund > Number(datas.hghestFund) ? datas.allFund : Number(datas.hghestFund);
            datas.lowestFund        =  datas.allFund < Number(datas.lowestFund) ? datas.allFund : Number(datas.lowestFund);
            datas.allCoin           =  datas.crtFund / newDatasFromTV.BaseCoinPrice + datas.crtCoin;
            datas.initialCoin       =  Number(datas.initialCoin);
            datas.hghestCoin        =  datas.allCoin > Number(datas.hghestCoin) ? datas.allCoin : Number(datas.hghestCoin);
            datas.lowestCoin        =  datas.allCoin < Number(datas.lowestCoin) ? datas.allCoin : Number(datas.lowestCoin);
            datas.allPosition       =  Number(datas.allPosition);
            datas.usedMargin        =  datas.allPosition * newDatasFromTV.TradingSymbolPrice / Number(datas.leverage);
            datas.freeMargin        =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice * Number(datas.BaseCoinHairCut) - datas.usedMargin;
            datas.allTradeFee       =  Number(datas.allTradeFee);
            datas.allFundFee        =  Number(datas.allFundFee);
            datas.crt_initialFund   =  (datas.allFund - datas.initialFund) / datas.initialFund  ;
            datas.crt_hghestFund    =  (datas.allFund - datas.hghestFund ) / datas.hghestFund   ;
            datas.crt_lowestFund    =  (datas.allFund - datas.lowestFund ) / datas.lowestFund   ;
            datas.crt_initialCoin   =  (datas.allCoin - datas.initialCoin) / datas.initialCoin  ;
            datas.crt_hghestCoin    =  (datas.allCoin - datas.hghestCoin ) / datas.hghestCoin   ;
            datas.crt_lowestCoin    =  (datas.allCoin - datas.lowestCoin ) / datas.lowestCoin   ;


        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }

        newDatasFromTV.netProfit        =  datas.netProfit       
        newDatasFromTV.avgBuyPrice      =  datas.avgBuyPrice     
        newDatasFromTV.openProfit       =  datas.openProfit      
        newDatasFromTV.crtFund          =  datas.crtFund         
        newDatasFromTV.crtCoin          =  datas.crtCoin         
        newDatasFromTV.allFund          =  datas.allFund         
        newDatasFromTV.initialFund      =  datas.initialFund     
        newDatasFromTV.hghestFund       =  datas.hghestFund      
        newDatasFromTV.lowestFund       =  datas.lowestFund      
        newDatasFromTV.allCoin          =  datas.allCoin         
        newDatasFromTV.initialCoin      =  datas.initialCoin     
        newDatasFromTV.hghestCoin       =  datas.hghestCoin      
        newDatasFromTV.lowestCoin       =  datas.lowestCoin      
        newDatasFromTV.allPosition      =  datas.allPosition     
        newDatasFromTV.usedMargin       =  datas.usedMargin      
        newDatasFromTV.freeMargin       =  datas.freeMargin      
        newDatasFromTV.allTradeFee      =  datas.allTradeFee     
        newDatasFromTV.allFundFee       =  datas.allFundFee      
        newDatasFromTV.crt_initialFund  =  datas.crt_initialFund 
        newDatasFromTV.crt_hghestFund   =  datas.crt_hghestFund  
        newDatasFromTV.crt_lowestFund   =  datas.crt_lowestFund  
        newDatasFromTV.crt_initialCoin  =  datas.crt_initialCoin 
        newDatasFromTV.crt_hghestCoin   =  datas.crt_hghestCoin  
        newDatasFromTV.crt_lowestCoin   =  datas.crt_lowestCoin  


        const writeToRange = newDatasFromTV.sheetTitle + '!A:B'; // 指定操作 A 到 B 列
        // 1. 先清空该区域的所有数据
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: writeToRange,
        });

        // 2. 写入新数据
        await sheets.spreadsheets.values.update({
            spreadsheetId:spreadsheetId,
            range: writeToRange,
            valueInputOption: 'USER_ENTERED', // 允许自动识别数字/日期格式
            requestBody: {
                values: Object.entries(newDatasFromTV),
            },
        });

        let newDatasFromSheet   =  { timestamp: 0 };
        let attampts            =  0;
        let waitTime            =  1000;
        while (attampts < 60 && Number(newDatasFromSheet.timestamp) < newDatasFromTV.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
            attampts    += 1;
            waitTime    =  attampts * 1000;
        }
        if (Number(newDatasFromSheet.timestamp) >= newDatasFromTV.timestamp) {
            console.log('✔ TV数据写入表格成功');
            await SendSplitTGMessages(  process.env.TG_TOKEN                                        , 
                                        process.env.TG_CHAT_ID                                      , 
                                        "Get TV webhook Message"                                    , 
                                        FormatMatrixToString(Object.entries(newDatasFromSheet))     );
        } else {
            console.log('✘ TV数据写入表格失败');
            await SendSplitTGMessages(  process.env.TG_TOKEN                                        , 
                                        process.env.TG_CHAT_ID                                      , 
                                        "Get TV webhook Message"                                    ,
                                        "But FAIL write to Google Sheets"                           ); 
            throw new Error("TV数据写入表格失败");
        }

        // 发送tg消息

    } catch (err) {
        throw new Error(`TV消息处理失败: ${err.message}`);
    }

}


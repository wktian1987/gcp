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


function GetLiquidateStopPrice( allPosition         ,
                                avgBuyPrice         , 
                                inFund              , 
                                netProfit           , 
                                crtCoin             , 
                                operatePrice        , 
                                bPrice              , 
                                baseCoinHairCut     , 
                                Adn2B               , 
                                waveUpChg           , 
                                hghestFund          , 
                                hghestCoin          , 
                                stopRate4F          , 
                                stopRate4C          ,
                                notStop4C           , 
                                notStop4F           ) {
    // 基础变量提取 (命名对齐你的 GetAccountStatusByPrice)
    let C    = crtCoin              ;
    let S    = bPrice               ;
    let P    = operatePrice         ;
    let L    = allPosition          ;
    let K    = inFund + netProfit   ;
    let A    = avgBuyPrice          ;
    let H    = baseCoinHairCut      ;
    let R    = waveUpChg            ;
    
    let liquidatePrice = null;
    let stopPriceC     = null;
    let stopPriceF     = null;

    // ==========================================
    // 1. 求 _liquidatePrice (爆仓价)
    // 条件: V_f(P, Haircut) = R * L * P
    // ==========================================
    let slope_f_h       = (C * S * Adn2B * H / P) + L
    let intercept_f_h   = K - (L * A) + (C * S * H * (1 - Adn2B))
    
    // 方程: slope_f_h * P + intercept_f_h = R * L * P
    // 移项: P * (slope_f_h - R * L) = -intercept_f_h
    liquidatePrice      = -intercept_f_h / (slope_f_h - R * L)

    // ==========================================
    // 2. 求 _stopPriceF (金本位止损价)
    // 需要计算两个条件：stopRate4F (止损) 和 notStop4C (交叉限制)
    // 最终取两者中较高的价格 (即下跌时先碰到的那个)
    // ==========================================
    let slope_f   = (C * S * Adn2B / P) + L
    let intercept_f = K - (L * A) + (C * S * (1 - Adn2B))
    
    let targetF_1   = hghestFund * (1 + stopRate4F / 100)
    let targetF_2   = hghestFund * (1 + notStop4F / 100)
    
    let resF1       = (targetF_1 - intercept_f) / slope_f
    let resF2       = (targetF_2 - intercept_f) / slope_f
    
    // 根据你的逻辑，最终结果由交叉条件限制，此处取 math.min 对应下跌时更高的价格
    stopPriceF = Math.min(resF1, resF2)

    // ==========================================
    // 3. 求 _stopPriceC (币本位止损价)
    // 条件: V_f(P, H=1) / P_b(P) = TargetCoin
    // ==========================================
    let targetC_1 = hghestCoin * (1 + stopRate4C / 100)
    let targetC_2 = hghestCoin * (1 + notStop4C / 100)
    
    // 币本位方程推导: (slope_f * P + intercept_f) / (S0 * (1 + (P-P0)/P0 * Adn2B)) = Target
    // 令 m_slope = S0 * Adn2B / P0, m_intercept = S0 * (1 - Adn2B)
    let m_slope     = S * Adn2B / P
    let m_intercept = S * (1 - Adn2B)
    
    // 方程化简为一次方程: P * (slope_f - Target * m_slope) = Target * m_intercept - intercept_f
    let resC1 = (targetC_1 * m_intercept - intercept_f) / (slope_f - targetC_1 * m_slope)
    let resC2 = (targetC_2 * m_intercept - intercept_f) / (slope_f - targetC_2 * m_slope)
    
    stopPriceC = Math.min(resC1, resC2)

    return [liquidatePrice, stopPriceC, stopPriceF]

}



export async function HandleTV(newDatasFromTV) {
    let datas = {};

    try {
        const spreadsheetId = GetSheetID(newDatasFromTV.botNumber);

        //获取现存数据
        let ranges  = await GetDataFromSheet(sheets, spreadsheetId, "toGCP!A:B");
        ranges      = Object.fromEntries(ranges);
        datas       = await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP);
        datas       = Object.fromEntries(datas);

        if (!datas.ifNoError || datas.ifNoError === "FALSE") { //|| datas.TradingSymbol !== newDatasFromTV.TradingSymbol) {
            throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol`) ;
        }

        newDatasFromTV.tvUpdateTime   = GetTimeStringWithOffset(8, newDatasFromTV.timestamp);
        newDatasFromTV.gcpGetTime     = GetTimeStringWithOffset(8);

        if (newDatasFromTV.timestamp > datas.realTradeTime) {
            // 收到新消息数据初始化
            const toFill = "toFill";
            datas.netProfit         =  (datas.netProfit      === toFill)  ?  0                                                                                                :  Number(datas.netProfit)                                                                                              ;
            datas.avgBuyPrice       =  (datas.avgBuyPrice    === toFill)  ?  0                                                                                                :  Number(datas.avgBuyPrice)                                                                                            ;
            datas.openProfit        =  (datas.openProfit     === toFill)  ?  0                                                                                                :  Number(datas.allPosition) * (newDatasFromTV.TradingSymbolPrice - datas.avgBuyPrice)                                  ;
            datas.crtFund           =  (datas.crtFund        === toFill)  ?  Number(datas.inFund)                                                                             :  Number(datas.crtFund) + datas.openProfit                                                                             ;
            datas.crtCoin           =  (datas.crtCoin        === toFill)  ?  Number(datas.inCoin)                                                                             :  Number(datas.crtCoin)                                                                                                ;
            datas.allFund           =  (datas.allFund        === toFill)  ?  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice                                     :  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice                                                         ;
            datas.initialFund       =  (datas.initialFund    === toFill)  ?  datas.allFund                                                                                    :  Number(datas.initialFund)                                                                                            ;
            datas.hghestFund        =  (datas.hghestFund     === toFill)  ?  datas.allFund                                                                                    :  datas.allFund > Number(datas.hghestFund) ? datas.allFund : Number(datas.hghestFund)                                  ;
            datas.lowestFund        =  (datas.lowestFund     === toFill)  ?  datas.allFund                                                                                    :  datas.allFund < Number(datas.lowestFund) ? datas.allFund : Number(datas.lowestFund)                                  ;
            datas.allCoin           =  (datas.allCoin        === toFill)  ?  datas.crtFund / newDatasFromTV.BaseCoinPrice + datas.crtCoin                                     :  datas.crtFund / newDatasFromTV.BaseCoinPrice + datas.crtCoin                                                         ;
            datas.initialCoin       =  (datas.initialCoin    === toFill)  ?  datas.allCoin                                                                                    :  Number(datas.initialCoin)                                                                                            ;
            datas.hghestCoin        =  (datas.hghestCoin     === toFill)  ?  datas.allCoin                                                                                    :  datas.allCoin > Number(datas.hghestCoin) ? datas.allCoin : Number(datas.hghestCoin)                                  ;
            datas.lowestCoin        =  (datas.lowestCoin     === toFill)  ?  datas.allCoin                                                                                    :  datas.allCoin < Number(datas.lowestCoin) ? datas.allCoin : Number(datas.lowestCoin)                                  ;
            datas.allPosition       =  (datas.allPosition    === toFill)  ?  0                                                                                                :  Number(datas.allPosition)                                                                                            ;
            datas.usedMargin        =  (datas.usedMargin     === toFill)  ?  0                                                                                                :  datas.allPosition * newDatasFromTV.TradingSymbolPrice / Number(datas.leverage)                                       ;
            datas.freeMargin        =  (datas.freeMargin     === toFill)  ?  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice * Number(datas.BaseCoinHairCut)     :  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice * Number(datas.BaseCoinHairCut) - datas.usedMargin      ;
            datas.allTradeFee       =  (datas.allTradeFee    === toFill)  ?  0                                                                                                :  Number(datas.allTradeFee)                                                                                            ;
            datas.allFundFee        =  (datas.allFundFee     === toFill)  ?  0                                                                                                :  Number(datas.allFundFee)                                                                                             ;
            datas.buyTimes          =  (datas.buyTimes       === toFill)  ?  0                                                                                                :  Number(datas.buyTimes)                                                                                               ;
            datas.sellTimes         =  (datas.sellTimes      === toFill)  ?  0                                                                                                :  Number(datas.sellTimes)                                                                                              ;

            datas.crt_initialFund   =  (datas.allFund - datas.initialFund) / datas.initialFund  ;
            datas.crt_hghestFund    =  (datas.allFund - datas.hghestFund ) / datas.hghestFund   ;
            datas.crt_lowestFund    =  (datas.allFund - datas.lowestFund ) / datas.lowestFund   ;
            datas.crt_initialCoin   =  (datas.allCoin - datas.initialCoin) / datas.initialCoin  ;
            datas.crt_hghestCoin    =  (datas.allCoin - datas.hghestCoin ) / datas.hghestCoin   ;
            datas.crt_lowestCoin    =  (datas.allCoin - datas.lowestCoin ) / datas.lowestCoin   ;

            let [liquidatePrice, stopPriceC, stopPriceF] = GetLiquidateStopPrice(   Number(datas.allPosition                    )     , 
                                                                                    Number(datas.avgBuyPrice                    )     , 
                                                                                    Number(datas.inFund                         )     , 
                                                                                    Number(datas.netProfit                      )     , 
                                                                                    Number(datas.crtCoin                        )     , 
                                                                                    Number(newDatasFromTV.TradingSymbolPrice    )     , 
                                                                                    Number(newDatasFromTV.BaseCoinPrice         )     , 
                                                                                    Number(datas.baseCoinHairCut                )     , 
                                                                                    Number(newDatasFromTV.Adn2B                 )     , 
                                                                                    Number(newDatasFromTV.waveUpChg             )     , 
                                                                                    Number(datas.hghestFund                     )     , 
                                                                                    Number(datas.hghestCoin                     )     , 
                                                                                    Number(datas.stopRate4F                     )     , 
                                                                                    Number(datas.stopRate4C                     )     , 
                                                                                    Number(datas.notStop4C                      )     , 
                                                                                    Number(datas.notStop4F                      )     );

            datas.liquidatePrice    =   liquidatePrice  ;
            datas.stopPriceC        =   stopPriceC      ;
            datas.stopRate4F        =   stopPriceF      ;

        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }



        newDatasFromTV.netProfit        =  datas.netProfit          ; 
        newDatasFromTV.avgBuyPrice      =  datas.avgBuyPrice        ; 
        newDatasFromTV.openProfit       =  datas.openProfit         ; 
        newDatasFromTV.crtFund          =  datas.crtFund            ; 
        newDatasFromTV.crtCoin          =  datas.crtCoin            ; 
        newDatasFromTV.allFund          =  datas.allFund            ; 
        newDatasFromTV.initialFund      =  datas.initialFund        ; 
        newDatasFromTV.hghestFund       =  datas.hghestFund         ; 
        newDatasFromTV.lowestFund       =  datas.lowestFund         ; 
        newDatasFromTV.allCoin          =  datas.allCoin            ; 
        newDatasFromTV.initialCoin      =  datas.initialCoin        ; 
        newDatasFromTV.hghestCoin       =  datas.hghestCoin         ; 
        newDatasFromTV.lowestCoin       =  datas.lowestCoin         ; 
        newDatasFromTV.allPosition      =  datas.allPosition        ; 
        newDatasFromTV.usedMargin       =  datas.usedMargin         ; 
        newDatasFromTV.freeMargin       =  datas.freeMargin         ;
        newDatasFromTV.allTradeFee      =  datas.allTradeFee        ;
        newDatasFromTV.allFundFee       =  datas.allFundFee         ;
        newDatasFromTV.liquidatePrice   =  datas.liquidatePrice     ;
        newDatasFromTV.stopPriceC       =  datas.stopPriceC         ;
        newDatasFromTV.stopPriceF       =  datas.stopPriceF         ;
        newDatasFromTV.buyTimes         =  datas.buyTimes           ;
        newDatasFromTV.sellTimes        =  datas.sellTimes          ;
        newDatasFromTV.crt_initialFund  =  datas.crt_initialFund    ;
        newDatasFromTV.crt_hghestFund   =  datas.crt_hghestFund     ;
        newDatasFromTV.crt_lowestFund   =  datas.crt_lowestFund     ;
        newDatasFromTV.crt_initialCoin  =  datas.crt_initialCoin    ;
        newDatasFromTV.crt_hghestCoin   =  datas.crt_hghestCoin     ;
        newDatasFromTV.crt_lowestCoin   =  datas.crt_lowestCoin     ;

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

        let newDatasFromSheet   =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
        let attAdn2Bts            =  0;
        let waitTime            =  1000;

        while (attAdn2Bts < 60 && Number(newDatasFromSheet.timestamp) < newDatasFromTV.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
            attAdn2Bts    += 1;
            waitTime    =  attAdn2Bts * 1000;
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


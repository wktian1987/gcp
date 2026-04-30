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


function GetGridDifficulty(positionN, difficultyCoefficient, maxGridNumber) { 
    let gridDifficulty   =   Math.pow(positionN, (difficultyCoefficient + 1)) / Math.pow(maxGridNumber, difficultyCoefficient) + (maxGridNumber-positionN) / maxGridNumber  ;
    let enDifficulty     =   gridDifficulty / maxGridNumber  ;
    let exDifficulty     =   (maxGridNumber - gridDifficulty) / maxGridNumber  ;
    return [gridDifficulty, enDifficulty, exDifficulty]  ;
}


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

const toFill        = "toFill"      ;
const toGCPRanges   = "toGCP!A:B"   ;
export async function HandleTV(newDatasFromTV) {
    newDatasFromTV.timestamp		        =   Number( newDatasFromTV.timestamp          ) ;
    newDatasFromTV.TradingSymbolPrice		=   Number( newDatasFromTV.TradingSymbolPrice ) ;
    newDatasFromTV.targetHgh		        =   Number( newDatasFromTV.targetHgh          ) ;
    newDatasFromTV.targetLow		        =   Number( newDatasFromTV.targetLow          ) ;
    newDatasFromTV.roundHgh		            =   Number( newDatasFromTV.roundHgh           ) ;
    newDatasFromTV.roundLow		            =   Number( newDatasFromTV.roundLow           ) ;
    newDatasFromTV.tradeFeeRate		        =   Number( newDatasFromTV.tradeFeeRate       ) ;
    newDatasFromTV.fundingRate		        =   Number( newDatasFromTV.fundingRate        ) ;
    newDatasFromTV.barChgFR		            =   Number( newDatasFromTV.barChgFR           ) ;
    newDatasFromTV.barChgA		            =   Number( newDatasFromTV.barChgA            ) ;
    newDatasFromTV.barChgB		            =   Number( newDatasFromTV.barChgB            ) ;
    newDatasFromTV.A2B		                =   Number( newDatasFromTV.A2B                ) ;
    newDatasFromTV.Aup2B		            =   Number( newDatasFromTV.Aup2B              ) ;
    newDatasFromTV.Adn2B		            =   Number( newDatasFromTV.Adn2B              ) ;
    newDatasFromTV.B2A		                =   Number( newDatasFromTV.B2A                ) ;
    newDatasFromTV.Bup2A		            =   Number( newDatasFromTV.Bup2A              ) ;
    newDatasFromTV.Bdn2A		            =   Number( newDatasFromTV.Bdn2A              ) ;
    newDatasFromTV.avgA2B		            =   Number( newDatasFromTV.avgA2B             ) ;
    newDatasFromTV.avgAup2B		            =   Number( newDatasFromTV.avgAup2B           ) ;
    newDatasFromTV.avgAdn2B		            =   Number( newDatasFromTV.avgAdn2B           ) ;
    newDatasFromTV.avgB2A		            =   Number( newDatasFromTV.avgB2A             ) ;
    newDatasFromTV.avgBup2A		            =   Number( newDatasFromTV.avgBup2A           ) ;
    newDatasFromTV.avgBdn2A		            =   Number( newDatasFromTV.avgBdn2A           ) ;
    newDatasFromTV.waveUpChg		        =   Number( newDatasFromTV.waveUpChg          ) ;
    newDatasFromTV.waveDnChg		        =   Number( newDatasFromTV.waveDnChg          ) ;
    newDatasFromTV.isDiffRatio		        =   Number( newDatasFromTV.isDiffRatio        ) ;
    newDatasFromTV.ema_isDiffRatio		    =   Number( newDatasFromTV.ema_isDiffRatio    ) ;
    newDatasFromTV.BaseCoinPrice		    =   Number( newDatasFromTV.BaseCoinPrice      ) ;

    let datas = {};

    try {
        const spreadsheetId = GetSheetID(newDatasFromTV.botNumber);

        //获取现存数据
        let ranges  = await GetDataFromSheet(sheets, spreadsheetId, toGCPRanges);
        ranges      = Object.fromEntries(ranges);
        datas       = await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP);
        datas       = Object.fromEntries(datas);

        if (!datas.ifNoError || datas.ifNoError === "FALSE") { //|| datas.TradingSymbol !== newDatasFromTV.TradingSymbol) {
            throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol`) ;
        }

        newDatasFromTV.tvUpdateTime   = GetTimeStringWithOffset(8, newDatasFromTV.timestamp);
        newDatasFromTV.gcpGetTime     = GetTimeStringWithOffset(8);


        datas.crtFund	            =   Number(datas.crtFund                )   ;
        datas.crtCoin	            =   Number(datas.crtCoin                )   ;
        datas.allFund	            =   Number(datas.allFund                )   ;
        datas.initialFund	        =   Number(datas.initialFund            )   ;
        datas.hghestFund	        =   Number(datas.hghestFund             )   ;
        datas.lowestFund	        =   Number(datas.lowestFund             )   ;
        datas.allCoin	            =   Number(datas.allCoin                )   ;
        datas.initialCoin	        =   Number(datas.initialCoin            )   ;
        datas.hghestCoin	        =   Number(datas.hghestCoin             )   ;
        datas.lowestCoin	        =   Number(datas.lowestCoin             )   ;
        datas.allPosition	        =   Number(datas.allPosition            )   ;
        datas.usedMargin	        =   Number(datas.usedMargin             )   ;
        datas.freeMargin	        =   Number(datas.freeMargin             )   ;
        datas.allTradeFee	        =   Number(datas.allTradeFee            )   ;
        datas.allFundFee	        =   Number(datas.allFundFee             )   ;
        datas.netProfit	            =   Number(datas.netProfit              )   ;
        datas.openProfit	        =   Number(datas.openProfit             )   ;
        datas.avgBuyPrice	        =   Number(datas.avgBuyPrice            )   ;
        datas.positionN             =   Number(datas.positionN              )   ;
        datas.gridDifficulty	    =   Number(datas.gridDifficulty         )   ;
        datas.enDifficulty	        =   Number(datas.enDifficulty           )   ;
        datas.exDifficulty	        =   Number(datas.exDifficulty           )   ;
        datas.liquidatePrice	    =   Number(datas.liquidatePrice         )   ;
        datas.stopPriceC	        =   Number(datas.stopPriceC             )   ;
        datas.stopPriceF	        =   Number(datas.stopPriceF             )   ;
        datas.buyTimes	            =   Number(datas.buyTimes               )   ;
        datas.sellTimes	            =   Number(datas.sellTimes              )   ;

        datas.realTradeTime	        =   Number(datas.realTradeTime          )   ;
        datas.inFund	            =   Number(datas.inFund                 )   ;
        datas.inCoin	            =   Number(datas.inCoin                 )   ;
        datas.leverage	            =   Number(datas.leverage               )   ;
        datas.MaxGrid	            =   Number(datas.MaxGrid                )   ;
        datas.BaseCoinHairCut	    =   Number(datas.BaseCoinHairCut        )   ;
        datas.stopRate4F	        =   Number(datas.stopRate4F             )   ;
        datas.stopRate4C	        =   Number(datas.stopRate4C             )   ;
        datas.notStop4C	            =   Number(datas.notStop4C              )   ;
        datas.notStop4F	            =   Number(datas.notStop4F              )   ;
        datas.difficultyCoefficient =   Number(datas.difficultyCoefficient  )   ;


        if (newDatasFromTV.timestamp > datas.realTradeTime) {

            // 收到新消息数据初始化
            datas.netProfit         =  isNaN(datas.netProfit   )  ?  0              :  datas.netProfit                                                                          ;
            datas.avgBuyPrice       =  isNaN(datas.avgBuyPrice )  ?  0              :  datas.avgBuyPrice                                                                        ;
            datas.allPosition       =  isNaN(datas.allPosition )  ?  0              :  datas.allPosition                                                                        ;
            datas.openProfit        =  datas.allPosition * (newDatasFromTV.TradingSymbolPrice - datas.avgBuyPrice)                                                              ;
            datas.crtFund           =  isNaN(datas.crtFund     )  ?  datas.inFund   :  datas.inFund + datas.netProfit + datas.openProfit                                        ;
            datas.crtCoin           =  isNaN(datas.crtCoin     )  ?  datas.inCoin   :  datas.crtCoin                                                                            ;
            datas.allFund           =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice                                                                             ;
            datas.initialFund       =  isNaN(datas.initialFund )  ?  datas.allFund  :  datas.initialFund                                                                        ;
            datas.hghestFund        =  isNaN(datas.hghestFund  )  ?  datas.allFund  :  ( datas.allFund > datas.hghestFund ? datas.allFund : datas.hghestFund )                  ;
            datas.lowestFund        =  isNaN(datas.lowestFund  )  ?  datas.allFund  :  ( datas.allFund < datas.lowestFund ? datas.allFund : datas.lowestFund )                  ;
            datas.allCoin           =  datas.crtFund / newDatasFromTV.BaseCoinPrice + datas.crtCoin                                                                             ;
            datas.initialCoin       =  isNaN(datas.initialCoin )  ?  datas.allCoin  :  datas.initialCoin                                                                        ;
            datas.hghestCoin        =  isNaN(datas.hghestCoin  )  ?  datas.allCoin  :  ( datas.allCoin > datas.hghestCoin ? datas.allCoin : datas.hghestCoin )                  ;
            datas.lowestCoin        =  isNaN(datas.lowestCoin  )  ?  datas.allCoin  :  ( datas.allCoin < datas.lowestCoin ? datas.allCoin : datas.lowestCoin )                  ;
            datas.usedMargin        =  datas.allPosition * newDatasFromTV.TradingSymbolPrice / datas.leverage                                                                   ;
            datas.freeMargin        =  datas.crtFund + datas.crtCoin * newDatasFromTV.BaseCoinPrice * datas.BaseCoinHairCut - datas.usedMargin                                  ;
            datas.allTradeFee       =  isNaN(datas.allTradeFee )  ?  0              :  datas.allTradeFee                                                                        ;
            datas.allFundFee        =  isNaN(datas.allFundFee  )  ?  0              :  datas.allFundFee                                                                         ;
            datas.positionN         =  isNaN(datas.positionN   )  ?  0              :  datas.positionN                                                                          ;
            datas.buyTimes          =  isNaN(datas.buyTimes    )  ?  0              :  datas.buyTimes                                                                           ;
            datas.sellTimes         =  isNaN(datas.sellTimes   )  ?  0              :  datas.sellTimes                                                                          ;
            datas.crt_initialFund   =  (datas.allFund - datas.initialFund) / datas.initialFund                                                                                  ;
            datas.crt_hghestFund    =  (datas.allFund - datas.hghestFund ) / datas.hghestFund                                                                                   ;
            datas.crt_lowestFund    =  (datas.allFund - datas.lowestFund ) / datas.lowestFund                                                                                   ;
            datas.crt_initialCoin   =  (datas.allCoin - datas.initialCoin) / datas.initialCoin                                                                                  ;
            datas.crt_hghestCoin    =  (datas.allCoin - datas.hghestCoin ) / datas.hghestCoin                                                                                   ;
            datas.crt_lowestCoin    =  (datas.allCoin - datas.lowestCoin ) / datas.lowestCoin                                                                                   ;
            // datas.crt_avgBuyPrice   =  (newDatasFromTV.TradingSymbolPrice - datas.avgBuyPrice) / datas.avgBuyPrice                                                              ;


            if (isNaN(datas.gridDifficulty) || isNaN(datas.enDifficulty) || isNaN(datas.exDifficulty)) {
                let [gridDifficulty, enDifficulty, exDifficulty] = GetGridDifficulty(datas.positionN, datas.difficultyCoefficient, datas.MaxGrid)  ;
                datas.gridDifficulty    =  gridDifficulty   ;
                datas.enDifficulty      =  enDifficulty     ;
                datas.exDifficulty      =  exDifficulty     ;
            }

            let [liquidatePrice, stopPriceC, stopPriceF] = GetLiquidateStopPrice(   datas.allPosition                   , 
                                                                                    datas.avgBuyPrice                   , 
                                                                                    datas.inFund                        , 
                                                                                    datas.netProfit                     , 
                                                                                    datas.crtCoin                       , 
                                                                                    newDatasFromTV.TradingSymbolPrice   , 
                                                                                    newDatasFromTV.BaseCoinPrice        , 
                                                                                    datas.BaseCoinHairCut               , 
                                                                                    newDatasFromTV.Adn2B                , 
                                                                                    newDatasFromTV.waveUpChg            , 
                                                                                    datas.hghestFund                    , 
                                                                                    datas.hghestCoin                    , 
                                                                                    datas.stopRate4F                    , 
                                                                                    datas.stopRate4C                    , 
                                                                                    datas.notStop4C                     , 
                                                                                    datas.notStop4F                     );

            datas.liquidatePrice    =   liquidatePrice  ;
            datas.stopPriceC        =   stopPriceC      ;
            datas.stopPriceF        =   stopPriceF      ;

            // datas.tocrt_liquidatePrice  =  (datas.liquidatePrice - newDatasFromTV.TradingSymbolPrice) / newDatasFromTV.TradingSymbolPrice   ;
            // datas.tocrt_stopPriceC      =  (datas.stopPriceC     - newDatasFromTV.TradingSymbolPrice) / newDatasFromTV.TradingSymbolPrice   ;
            // datas.tocrt_stopPriceF      =  (datas.stopPriceF     - newDatasFromTV.TradingSymbolPrice) / newDatasFromTV.TradingSymbolPrice   ;

        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }

        newDatasFromTV.crtFund	            =   datas.crtFund               ;
        newDatasFromTV.crtCoin	            =   datas.crtCoin               ;
        newDatasFromTV.allFund	            =   datas.allFund               ;
        newDatasFromTV.initialFund	        =   datas.initialFund           ;
        newDatasFromTV.hghestFund	        =   datas.hghestFund            ;
        newDatasFromTV.lowestFund	        =   datas.lowestFund            ;
        newDatasFromTV.allCoin	            =   datas.allCoin               ;
        newDatasFromTV.initialCoin	        =   datas.initialCoin           ;
        newDatasFromTV.hghestCoin	        =   datas.hghestCoin            ;
        newDatasFromTV.lowestCoin	        =   datas.lowestCoin            ;
        newDatasFromTV.allPosition	        =   datas.allPosition           ;
        newDatasFromTV.usedMargin	        =   datas.usedMargin            ;
        newDatasFromTV.freeMargin	        =   datas.freeMargin            ;
        newDatasFromTV.allTradeFee	        =   datas.allTradeFee           ;
        newDatasFromTV.allFundFee	        =   datas.allFundFee            ;
        newDatasFromTV.netProfit	        =   datas.netProfit             ;
        newDatasFromTV.openProfit	        =   datas.openProfit            ;
        newDatasFromTV.avgBuyPrice	        =   datas.avgBuyPrice           ;
        newDatasFromTV.positionN            =   datas.positionN             ;
        newDatasFromTV.gridDifficulty	    =   datas.gridDifficulty        ;
        newDatasFromTV.enDifficulty	        =   datas.enDifficulty          ;
        newDatasFromTV.exDifficulty	        =   datas.exDifficulty          ;
        newDatasFromTV.liquidatePrice	    =   datas.liquidatePrice        ;
        newDatasFromTV.stopPriceC	        =   datas.stopPriceC            ;
        newDatasFromTV.stopPriceF	        =   datas.stopPriceF            ;
        newDatasFromTV.buyTimes	            =   datas.buyTimes              ;
        newDatasFromTV.sellTimes	        =   datas.sellTimes             ;

        newDatasFromTV.crt_initialFund      =  datas.crt_initialFund        ;
        newDatasFromTV.crt_hghestFund       =  datas.crt_hghestFund         ;
        newDatasFromTV.crt_lowestFund       =  datas.crt_lowestFund         ;
        newDatasFromTV.crt_initialCoin      =  datas.crt_initialCoin        ;
        newDatasFromTV.crt_hghestCoin       =  datas.crt_hghestCoin         ;
        newDatasFromTV.crt_lowestCoin       =  datas.crt_lowestCoin         ;
        // newDatasFromTV.crt_avgBuyPrice      =  datas.crt_avgBuyPrice        ;
        // newDatasFromTV.tocrt_liquidatePrice =  datas.tocrt_liquidatePrice   ;
        // newDatasFromTV.tocrt_stopPriceC     =  datas.tocrt_stopPriceC       ;
        // newDatasFromTV.tocrt_stopPriceF     =  datas.tocrt_stopPriceF       ;

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
        let attempts            =  0;
        let waitTime            =  1000;

        while (attempts < 60 && Number(newDatasFromSheet.timestamp) < newDatasFromTV.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
            attempts    += 1;
            waitTime    =  attempts * 1000;
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


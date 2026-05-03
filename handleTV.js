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
                                notStop4F           , 
                                notStop4C           ) {
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


const   accStatus_normal                    =  "normal"                                     ;
const   accStatus_liquidated                =  "liquidated"                                 ;
const   accStatus_stopC                     =  "stop due to Coinloss"                       ;
const   accStatus_stopF                     =  "stop due to Fundloss"                       ;
const   accStatus_stopCF                    =  "stop due to Coinloss and Fundloss"          ;

const   BuyReason_belowTarget               =  "below targetLow"                            ;

const   SellReason_aboveTarget              =  "above targetHigh"                           ;
const   SellReason_enoughProfit             =  "get enough profit"                          ;
const   SellReason_stop4C                   =  "stop loss below highestCoin too much"       ;
const   SellReason_stop4F                   =  "stop loss below highestFund too much"       ;
const   SellReason_liquidate                =  "liquidation sell"                           ;
const   SellReason_cutBfLiquid              =  "cut before liquidation"                     ;
const   SellReason_cutHighBuyOrder          =  "cut order with too high buyPrice"           ;

const   NotBuySellReason_notInCanTrdTime    =  "not in can trading time"                    ;
const   NotBuySellReason_waitLast           =  "wait for last trading end"                  ;
const   NotBuySellReason_justTrade          =  "just a trade executed and need wait"        ;
const   NotBuySellReason_liquidate          =  "already liquidated"                         ;

const   NotBuyReason_notBuySell             =  "cant buy sell "                             ;
const   NotBuyReason_aboveLastUnclose       =  "above lastUncloseOrder.buyPrice"            ;
const   NotBuyReason_sellthisTime           =  "this time has sell/liquid order"            ;
const   NotBuyReason_difctyLimit            =  "cant buy due to gridDifficulty"             ;
const   NotBuyReason_aboveHighToBuy         =  "above highestToBuyPrice"                    ;
const   NotBuyReason_belowLowToBuy          =  "below lowestToBuyPrice"                     ;
const   NotBuyReason_closeToRndHigh         =  "close to roundHigh"                         ;
const   NotBuyReason_closeToRndLow          =  "close to roundLow"                          ;
const   NotBuyReason_noAdqtFund             =  "no adequate fund to buy"                    ;
const   NotBuyReason_maxEnExTooSmall        =  "after calculate maxEnExPosition too small"  ;
const   NotBuyReason_overMaxGridN           =  "account.gridNum over maxGridNumber"         ;
const   NotBuyReason_stopTriggered          =  "stop loss triggered"                        ;
const   NotBuyReason_closeToliquidWarn      =  "close to liquidation warning"               ;
const   NotBuyReason_closeToStop            =  "close to stopF or stopC"                    ;

const   NotSellReason_notBuySell            =  "cant buy sell "                             ;
const   NotSellReason_noPosition            =  "no positions"                               ;
const   NotSellReason_belowLowToSell        =  "below lowestToSellPrice"                    ;
const   NotSellReason_cantProfit            =  "cant get enough Profit"                     ;

const   toFill          = "toFill"          ;
const   toGCPRanges     = "toGCP!A:B"       ;
const   huanHang        = "__HuangHang__"   ;
export async function HandleTV(newDatas) {
    newDatas.touchTargetHgh             =  (newDatas.touchTargetHgh          || String(newDatas.touchTargetHgh         ).toUpperCase() === "TRUE")  ?  true  :  false  ;
    newDatas.touchTargetLow             =  (newDatas.touchTargetLow          || String(newDatas.touchTargetLow         ).toUpperCase() === "TRUE")  ?  true  :  false  ;
    newDatas.alreadyTouchHghThisWave    =  (newDatas.alreadyTouchHghThisWave || String(newDatas.alreadyTouchHghThisWave).toUpperCase() === "TRUE")  ?  true  :  false  ;
    newDatas.alreadyTouchLowThisWave    =  (newDatas.alreadyTouchLowThisWave || String(newDatas.alreadyTouchLowThisWave).toUpperCase() === "TRUE")  ?  true  :  false  ;
    newDatas.timestamp		            =   Number( newDatas.timestamp          ) ;
    newDatas.TradingSymbolPrice	        =   Number( newDatas.TradingSymbolPrice ) ;
    newDatas.tradeFeeRate		        =   Number( newDatas.tradeFeeRate       ) ;
    newDatas.fundingRate		        =   Number( newDatas.fundingRate        ) ;
    newDatas.roundHgh		            =   Number( newDatas.roundHgh           ) ;
    newDatas.roundLow		            =   Number( newDatas.roundLow           ) ;
    newDatas.waveUpChg		            =   Number( newDatas.waveUpChg          ) ;
    newDatas.waveDnChg		            =   Number( newDatas.waveDnChg          ) ;
    newDatas.targetHgh		            =   Number( newDatas.targetHgh          ) ;
    newDatas.targetLow		            =   Number( newDatas.targetLow          ) ;
    newDatas.touchHghTimes              =   Number( newDatas.touchHghTimes      ) ;
    newDatas.touchLowTimes              =   Number( newDatas.touchLowTimes      ) ;
    newDatas.barChgFR		            =   Number( newDatas.barChgFR           ) ;
    newDatas.barChgA		            =   Number( newDatas.barChgA            ) ;
    newDatas.barChgB		            =   Number( newDatas.barChgB            ) ;
    newDatas.isDiffRatio		        =   Number( newDatas.isDiffRatio        ) ;
    newDatas.ema_isDiffRatio	        =   Number( newDatas.ema_isDiffRatio    ) ;
    newDatas.BaseCoinPrice		        =   Number( newDatas.BaseCoinPrice      ) ;
    newDatas.A2B		                =   Number( newDatas.A2B                ) ;
    newDatas.Aup2B		                =   Number( newDatas.Aup2B              ) ;
    newDatas.Adn2B		                =   Number( newDatas.Adn2B              ) ;
    newDatas.B2A		                =   Number( newDatas.B2A                ) ;
    newDatas.Bup2A		                =   Number( newDatas.Bup2A              ) ;
    newDatas.Bdn2A		                =   Number( newDatas.Bdn2A              ) ;
    newDatas.avgA2B		                =   Number( newDatas.avgA2B             ) ;
    newDatas.avgAup2B		            =   Number( newDatas.avgAup2B           ) ;
    newDatas.avgAdn2B		            =   Number( newDatas.avgAdn2B           ) ;
    newDatas.avgB2A		                =   Number( newDatas.avgB2A             ) ;
    newDatas.avgBup2A		            =   Number( newDatas.avgBup2A           ) ;
    newDatas.avgBdn2A		            =   Number( newDatas.avgBdn2A           ) ;

    newDatas.tvUpdateTime               =   GetTimeStringWithOffset(8, newDatas.timestamp)  ;
    newDatas.gcpGetTime                 =   GetTimeStringWithOffset(8)                      ;



    try {
        const spreadsheetId = GetSheetID(newDatas.botNumber);

        //获取现存数据
        let ranges  = await GetDataFromSheet(sheets, spreadsheetId, toGCPRanges);
        ranges      = Object.fromEntries(ranges);
        let datas   = await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP);
        datas       = Object.fromEntries(datas);

        datas.liquidatePrice	    =   Number(datas.liquidatePrice         )   ;
        datas.stopPriceC	        =   Number(datas.stopPriceC             )   ;
        datas.stopPriceF	        =   Number(datas.stopPriceF             )   ;
        datas.lowToBuy              =   Number(datas.lowToBuy               )   ;
        datas.hghToBuy              =   Number(datas.hghToBuy               )   ;
        datas.lowToSell             =   Number(datas.lowToSell              )   ;
        datas.openProfit	        =   Number(datas.openProfit             )   ;
        datas.usedMargin	        =   Number(datas.usedMargin             )   ;
        datas.freeMargin	        =   Number(datas.freeMargin             )   ;
        datas.netProfit	            =   Number(datas.netProfit              )   ;
        datas.allTradeFee	        =   Number(datas.allTradeFee            )   ;
        datas.allFundFee	        =   Number(datas.allFundFee             )   ;
        datas.allFund	            =   Number(datas.allFund                )   ;
        datas.initialFund	        =   Number(datas.initialFund            )   ;
        datas.hghestFund	        =   Number(datas.hghestFund             )   ;
        datas.lowestFund	        =   Number(datas.lowestFund             )   ;
        datas.allCoin	            =   Number(datas.allCoin                )   ;
        datas.initialCoin	        =   Number(datas.initialCoin            )   ;
        datas.hghestCoin	        =   Number(datas.hghestCoin             )   ;
        datas.lowestCoin	        =   Number(datas.lowestCoin             )   ;
        datas.crtFund	            =   Number(datas.crtFund                )   ;
        datas.crtCoin	            =   Number(datas.crtCoin                )   ;
        datas.allPosition	        =   Number(datas.allPosition            )   ;
        datas.avgBuyPrice	        =   Number(datas.avgBuyPrice            )   ;
        datas.avgBuyPriceUnclose    =   Number(datas.avgBuyPriceUnclose     )   ;
        datas.lstBuyPriceUnclose    =   Number(datas.lstBuyPriceUnclose     )   ;
        datas.hghBuyPriceUnclose    =   Number(datas.hghBuyPriceUnclose     )   ;
        datas.lowBuyPriceUnclose    =   Number(datas.lowBuyPriceUnclose     )   ;
        datas.gridNum               =   Number(datas.gridNum                )   ;
        datas.gridDifficulty	    =   Number(datas.gridDifficulty         )   ;
        datas.enDifficulty	        =   Number(datas.enDifficulty           )   ;
        datas.exDifficulty	        =   Number(datas.exDifficulty           )   ;
        datas.buyTimes	            =   Number(datas.buyTimes               )   ;
        datas.sellTimes	            =   Number(datas.sellTimes              )   ;

        datas.realTradeTime	        =   Number(datas.realTradeTime          )   ;
        datas.inFund	            =   Number(datas.inFund                 )   ;
        datas.inCoin	            =   Number(datas.inCoin                 )   ;
        datas.inTradingSymbolPrice  =   Number(datas.inTradingSymbolPrice   )   ;
        datas.inBaseCoinPrice       =   Number(datas.inBaseCoinPrice        )   ;
        datas.BaseCoinHairCut	    =   Number(datas.BaseCoinHairCut        )   ;
        datas.leverage	            =   Number(datas.leverage               )   ;
        datas.MaxGrid	            =   Number(datas.MaxGrid                )   ;
        datas.minEnExPosition       =   Number(datas.minEnExPosition        )   ;
        datas.basicHghToBuy         =   Number(datas.basicHghToBuy          )   ;
        datas.basicLowToBuy         =   Number(datas.basicLowToBuy          )   ;
        datas.basicLowToSell        =   Number(datas.basicLowToSell         )   ;
        datas.stopRate4F	        =   Number(datas.stopRate4F             )   ;
        datas.stopRate4C	        =   Number(datas.stopRate4C             )   ;
        datas.notStop4C	            =   Number(datas.notStop4C              )   ;
        datas.notStop4F	            =   Number(datas.notStop4F              )   ;
        datas.difficultyCoefficient =   Number(datas.difficultyCoefficient  )   ;


        if (newDatas.timestamp > datas.realTradeTime) {
            // 收到新消息数据初始化
            // 主要考虑3种情况：
            // 1, 未初始化时
            // 2, 正常运行时
            // 3, 出错时, 需重新初始化
            datas.runningWell       =  (datas.runningWell || String(datas.runningWell).toUpperCase() === "TRUE")  ?  true  :  false  ;

            datas.netProfit         =  ( (!datas.runningWell) || isNaN(datas.netProfit   ) ) ?  0              :  datas.netProfit                                                   ;
            datas.avgBuyPrice       =  ( (!datas.runningWell) || isNaN(datas.avgBuyPrice ) ) ?  0              :  datas.avgBuyPrice                                                 ;
            datas.allPosition       =  ( (!datas.runningWell) || isNaN(datas.allPosition ) ) ?  0              :  datas.allPosition                                                 ;
            datas.openProfit        =  datas.allPosition * (newDatas.TradingSymbolPrice - datas.avgBuyPrice)                                                                        ;
            datas.crtFund           =  ( (!datas.runningWell) || isNaN(datas.crtFund     ) ) ?  datas.inFund   :  datas.inFund + datas.netProfit + datas.openProfit                 ;
            datas.crtCoin           =  ( (!datas.runningWell) || isNaN(datas.crtCoin     ) ) ?  datas.inCoin   :  datas.crtCoin                                                     ;
            datas.allFund           =  datas.crtFund + datas.crtCoin * newDatas.BaseCoinPrice                                                                                       ;
            datas.initialFund       =  ( (!datas.runningWell) || isNaN(datas.initialFund ) ) ?  datas.allFund  :  datas.initialFund                                                 ;
            datas.hghestFund        =  ( (!datas.runningWell) || isNaN(datas.hghestFund  ) ) ?  datas.allFund  :  ( datas.allFund > datas.hghestFund ? datas.allFund : datas.hgh )  ;
            datas.lowestFund        =  ( (!datas.runningWell) || isNaN(datas.lowestFund  ) ) ?  datas.allFund  :  ( datas.allFund < datas.lowestFund ? datas.allFund : datas.low )  ;
            datas.allCoin           =  datas.crtFund / newDatas.BaseCoinPrice + datas.crtCoin                                                                                       ;
            datas.initialCoin       =  ( (!datas.runningWell) || isNaN(datas.initialCoin ) ) ?  datas.allCoin  :  datas.initialCoin                                                 ;
            datas.hghestCoin        =  ( (!datas.runningWell) || isNaN(datas.hghestCoin  ) ) ?  datas.allCoin  :  ( datas.allCoin > datas.hghestCoin ? datas.allCoin : datas.hgh )  ;
            datas.lowestCoin        =  ( (!datas.runningWell) || isNaN(datas.lowestCoin  ) ) ?  datas.allCoin  :  ( datas.allCoin < datas.lowestCoin ? datas.allCoin : datas.low )  ;
            datas.usedMargin        =  datas.allPosition * newDatas.TradingSymbolPrice / datas.leverage                                                                             ;
            datas.freeMargin        =  datas.crtFund + datas.crtCoin * newDatas.BaseCoinPrice * datas.BaseCoinHairCut - datas.usedMargin                                            ;
            datas.allTradeFee       =  ( (!datas.runningWell) || isNaN(datas.allTradeFee ) ) ?  0              :  datas.allTradeFee                                                 ;
            datas.allFundFee        =  ( (!datas.runningWell) || isNaN(datas.allFundFee  ) ) ?  0              :  datas.allFundFee                                                  ;
            datas.positionN         =  ( (!datas.runningWell) || isNaN(datas.positionN   ) ) ?  0              :  datas.positionN                                                   ;
            datas.buyTimes          =  ( (!datas.runningWell) || isNaN(datas.buyTimes    ) ) ?  0              :  datas.buyTimes                                                    ;
            datas.sellTimes         =  ( (!datas.runningWell) || isNaN(datas.sellTimes   ) ) ?  0              :  datas.sellTimes                                                   ;
            datas.crt_initialFund   =  (datas.allFund - datas.initialFund) / datas.initialFund                                                                                      ;
            datas.crt_hghestFund    =  (datas.allFund - datas.hghestFund ) / datas.hghestFund                                                                                       ;
            datas.crt_lowestFund    =  (datas.allFund - datas.lowestFund ) / datas.lowestFund                                                                                       ;
            datas.crt_initialCoin   =  (datas.allCoin - datas.initialCoin) / datas.initialCoin                                                                                      ;
            datas.crt_hghestCoin    =  (datas.allCoin - datas.hghestCoin ) / datas.hghestCoin                                                                                       ;
            datas.crt_lowestCoin    =  (datas.allCoin - datas.lowestCoin ) / datas.lowestCoin                                                                                       ;
            datas.crt_avgBuyPrice   =  (newDatas.TradingSymbolPrice - datas.avgBuyPrice) / datas.avgBuyPrice                                                                        ;


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
                                                                                    newDatas.TradingSymbolPrice         , 
                                                                                    newDatas.BaseCoinPrice              , 
                                                                                    datas.BaseCoinHairCut               , 
                                                                                    newDatas.Adn2B                      , 
                                                                                    newDatas.waveUpChg                  , 
                                                                                    datas.hghestFund                    , 
                                                                                    datas.hghestCoin                    , 
                                                                                    datas.stopRate4F                    , 
                                                                                    datas.stopRate4C                    , 
                                                                                    datas.notStop4F                     , 
                                                                                    datas.notStop4C                     );

            datas.liquidatePrice    =   liquidatePrice  ;
            datas.stopPriceC        =   stopPriceC      ;
            datas.stopPriceF        =   stopPriceF      ;

            datas.tocrt_liquidatePrice  =  (datas.liquidatePrice - newDatas.TradingSymbolPrice) / newDatas.TradingSymbolPrice   ;
            datas.tocrt_stopPriceC      =  (datas.stopPriceC     - newDatas.TradingSymbolPrice) / newDatas.TradingSymbolPrice   ;
            datas.tocrt_stopPriceF      =  (datas.stopPriceF     - newDatas.TradingSymbolPrice) / newDatas.TradingSymbolPrice   ;

            // 账户状态判断
            datas.accStatus =  accStatus_normal ; 
            if (newDatas.TradingSymbolPrice < datas.liquidatePrice) {datas.accStatus = accStatus_liquidated   ;}
            if (newDatas.TradingSymbolPrice < datas.stopPriceC    ) {datas.accStatus = accStatus_stopC        ;}
            if (newDatas.TradingSymbolPrice < datas.stopPriceF    ) {datas.accStatus = accStatus_stopF        ;}
            if (newDatas.TradingSymbolPrice < datas.stopPriceC    &&
                newDatas.TradingSymbolPrice < datas.stopPriceF    ) {datas.accStatus = accStatus_stopCF       ;}

            datas.therePosition     =  datas.gridNum > 0  ?  true  :  false  ; 
            

            datas.thisAlertMessage  =  String(newDatasFromTV.thisAlertMessage).replaceAll(huanHang, "\n")  ;

            datas.thisAlertMessage  =  "there is no Error!" + "\n"  ;

            datas.runningWell  =  true;
        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }


        // if (!datas.ifNoError || datas.ifNoError === "FALSE") { //|| datas.TradingSymbol !== newDatasFromTV.TradingSymbol) {
        //     throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol`) ;
        // }

        newDatas.thisAlertMessage       =   datas.thisAlertMessage      ;

        newDatas.runningWell            =   datas.runningWell           ;
        newDatas.accStatus              =   datas.accStatus             ;
        newDatas.liquidatePrice	        =   datas.liquidatePrice        ;
        newDatas.stopPriceC	            =   datas.stopPriceC            ;
        newDatas.stopPriceF	            =   datas.stopPriceF            ;
        newDatas.lowToBuy               =   datas.lowToBuy              ;
        newDatas.hghToBuy               =   datas.hghToBuy              ;
        newDatas.lowToSell              =   datas.lowToSell             ;
        newDatas.openProfit	            =   datas.openProfit            ;
        newDatas.usedMargin	            =   datas.usedMargin            ;
        newDatas.freeMargin	            =   datas.freeMargin            ;
        newDatas.netProfit	            =   datas.netProfit             ;
        newDatas.allTradeFee	        =   datas.allTradeFee           ;
        newDatas.allFundFee	            =   datas.allFundFee            ;
        newDatas.allFund	            =   datas.allFund               ;
        newDatas.initialFund	        =   datas.initialFund           ;
        newDatas.hghestFund	            =   datas.hghestFund            ;
        newDatas.lowestFund	            =   datas.lowestFund            ;
        newDatas.allCoin	            =   datas.allCoin               ;
        newDatas.initialCoin	        =   datas.initialCoin           ;
        newDatas.hghestCoin	            =   datas.hghestCoin            ;
        newDatas.lowestCoin	            =   datas.lowestCoin            ;
        newDatas.crtFund	            =   datas.crtFund               ;
        newDatas.crtCoin	            =   datas.crtCoin               ;
        newDatas.therePosition          =   datas.therePosition         ;
        newDatas.allPosition	        =   datas.allPosition           ;
        newDatas.avgBuyPrice	        =   datas.avgBuyPrice           ;
        newDatas.avgBuyPriceUnclose     =   datas.avgBuyPriceUnclose    ;
        newDatas.lstBuyPriceUnclose     =   datas.lstBuyPriceUnclose    ;
        newDatas.hghBuyPriceUnclose     =   datas.hghBuyPriceUnclose    ;
        newDatas.lowBuyPriceUnclose     =   datas.lowBuyPriceUnclose    ;
        newDatas.gridNum                =   datas.gridNum               ;
        newDatas.gridDifficulty	        =   datas.gridDifficulty        ;
        newDatas.enDifficulty	        =   datas.enDifficulty          ;
        newDatas.exDifficulty	        =   datas.exDifficulty          ;
        newDatas.buyTimes	            =   datas.buyTimes              ;
        newDatas.sellTimes	            =   datas.sellTimes             ;

        newDatas.tocrt_liquidatePrice   =  datas.tocrt_liquidatePrice   ;
        newDatas.tocrt_stopPriceC       =  datas.tocrt_stopPriceC       ;
        newDatas.tocrt_stopPriceF       =  datas.tocrt_stopPriceF       ;
        newDatas.crt_initialFund        =  datas.crt_initialFund        ;
        newDatas.crt_hghestFund         =  datas.crt_hghestFund         ;
        newDatas.crt_lowestFund         =  datas.crt_lowestFund         ;
        newDatas.crt_initialCoin        =  datas.crt_initialCoin        ;
        newDatas.crt_hghestCoin         =  datas.crt_hghestCoin         ;
        newDatas.crt_lowestCoin         =  datas.crt_lowestCoin         ;
        newDatas.crt_avgBuyPrice        =  datas.crt_avgBuyPrice        ;



        const writeToRange = newDatas.sheetTitle + '!A:B'; // 指定操作 A 到 B 列
        // 1. 先清空该区域的所有数据
        await sheets.spreadsheets.values.clear({
            spreadsheetId                   ,
            range           : writeToRange  ,
        });

        // 2. 写入新数据
        await sheets.spreadsheets.values.update({
            spreadsheetId                                   ,
            range               : writeToRange              ,
            valueInputOption    : 'USER_ENTERED'            , // 允许自动识别数字/日期格式
            requestBody         : {
                values: Object.entries(newDatas)    ,
            }                                               ,
        });

        let newDatasFromSheet   =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
        let attempts            =  0;
        let waitTime            =  1000;

        while (attempts < 60 && Number(newDatasFromSheet.timestamp) < newDatas.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
            attempts    += 1;
            waitTime    =  attempts * 1000;
        }
        if (Number(newDatasFromSheet.timestamp) >= newDatas.timestamp) {
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

    } catch (err) {
        throw new Error(`TV消息处理失败: ${err.message}`);
    }

}


import {GetTimeStringWithOffset         , 
        SendSplitTGMessages             ,
        GetSpreadsheetID                      ,                      
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

async function SendOrderToBroker(S, sheets, spreadsheetId) {
    await sheets.spreadsheets.values.update(    { 
        spreadsheetId       : spreadsheetId                     ,
        range               : 'simBroker!A10'                   ,
        valueInputOption    : 'USER_ENTERED'                    ,
        requestBody         : {values: Object.entries(S)}       } )  ;
    
    const res_broker =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A2:A9') )  ;

    S.ing_orderID   =  res_broker.orderID  ;
    
    return S ;
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

const   toFill          =  "toFill"         ;
const   toGCPRanges     =  "toGCP!A:B"      ;
const   huanHang        =  "__HuangHang__"  ;
const   order_T_LMT     =  "LMT"            ;
const   order_T_MKT     =  "MKT"            ; 
const   order_BUY       =  "B"              ;
const   order_SELL      =  "S"              ;
const   order_pending   =  "pending"        ;
const   order_waiting   =  "waiting"        ;
const   order_confirm   =  "confirm"        ;

export async function HandleTV(D) {
    D.touchTargetHgh            =   (D.touchTargetHgh          || String(D.touchTargetHgh         ).toUpperCase() === "TRUE")  ?  true  :  false  ;
    D.touchTargetLow            =   (D.touchTargetLow          || String(D.touchTargetLow         ).toUpperCase() === "TRUE")  ?  true  :  false  ;
    D.alreadyTouchHghThisWave   =   (D.alreadyTouchHghThisWave || String(D.alreadyTouchHghThisWave).toUpperCase() === "TRUE")  ?  true  :  false  ;
    D.alreadyTouchLowThisWave   =   (D.alreadyTouchLowThisWave || String(D.alreadyTouchLowThisWave).toUpperCase() === "TRUE")  ?  true  :  false  ;
    D.TradingSymbol             =   String(D.TradingSymbol   )                              ;     
    D.botNumber                 =   String(D.botNumber       )                              ;
    D.sheetTitle                =   String(D.sheetTitle      )                              ;
    D.fromTVcheck               =   String(D.fromTVcheck     )                              ;
    D.thisAlertMessage          =   String(D.thisAlertMessage).replaceAll(huanHang, "\n")   ;
    D.timestamp		            =   Number( D.timestamp          ) ;
    D.TradingSymbolPrice	    =   Number( D.TradingSymbolPrice ) ;
    D.tradeFeeRate		        =   Number( D.tradeFeeRate       ) ;
    D.fundingRate		        =   Number( D.fundingRate        ) ;
    D.roundHgh		            =   Number( D.roundHgh           ) ;
    D.roundLow		            =   Number( D.roundLow           ) ;
    D.waveUpChg		            =   Number( D.waveUpChg          ) ;
    D.waveDnChg		            =   Number( D.waveDnChg          ) ;
    D.targetHgh		            =   Number( D.targetHgh          ) ;
    D.targetLow		            =   Number( D.targetLow          ) ;
    D.touchHghTimes             =   Number( D.touchHghTimes      ) ;
    D.touchLowTimes             =   Number( D.touchLowTimes      ) ;
    D.barChgFR		            =   Number( D.barChgFR           ) ;
    D.barChgA		            =   Number( D.barChgA            ) ;
    D.barChgB		            =   Number( D.barChgB            ) ;
    D.isDiffRatio		        =   Number( D.isDiffRatio        ) ;
    D.ema_isDiffRatio	        =   Number( D.ema_isDiffRatio    ) ;
    D.BaseCoinPrice		        =   Number( D.BaseCoinPrice      ) ;
    D.A2B		                =   Number( D.A2B                ) ;
    D.Aup2B		                =   Number( D.Aup2B              ) ;
    D.Adn2B		                =   Number( D.Adn2B              ) ;
    D.B2A		                =   Number( D.B2A                ) ;
    D.Bup2A		                =   Number( D.Bup2A              ) ;
    D.Bdn2A		                =   Number( D.Bdn2A              ) ;
    D.avgA2B		            =   Number( D.avgA2B             ) ;
    D.avgAup2B		            =   Number( D.avgAup2B           ) ;
    D.avgAdn2B		            =   Number( D.avgAdn2B           ) ;
    D.avgB2A		            =   Number( D.avgB2A             ) ;
    D.avgBup2A		            =   Number( D.avgBup2A           ) ;
    D.avgBdn2A		            =   Number( D.avgBdn2A           ) ;

    D.tvUpdateTime              =   GetTimeStringWithOffset(8, D.timestamp)  ;
    D.gcpGetTime                =   GetTimeStringWithOffset(8)                      ;

    try {
        const spreadsheetId = GetSpreadsheetID(D.botNumber);
        //获取现存数据
        let ranges  = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, toGCPRanges ) ) ;
        let d       = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP) ) ;

        D.runningWell               =   (d.runningWell || String(d.runningWell).toUpperCase() === "TRUE")  ?  true  :  false  ;
        D.accStatus                 =   String(d.accStatus                  )   ;
        D.liquidatePrice	        =   Number(d.liquidatePrice             )   ;
        D.stopPriceC	            =   Number(d.stopPriceC                 )   ;
        D.stopPriceF	            =   Number(d.stopPriceF                 )   ;
        D.lowToBuy                  =   Number(d.lowToBuy                   )   ;
        D.hghToBuy                  =   Number(d.hghToBuy                   )   ;
        D.lowToSell                 =   Number(d.lowToSell                  )   ;
        D.openProfit	            =   Number(d.openProfit                 )   ;
        D.usedMargin	            =   Number(d.usedMargin                 )   ;
        D.freeMargin	            =   Number(d.freeMargin                 )   ;
        D.netProfit	                =   Number(d.netProfit                  )   ;
        D.allTradeFee	            =   Number(d.allTradeFee                )   ;
        D.allFundFee	            =   Number(d.allFundFee                 )   ;
        D.allFund	                =   Number(d.allFund                    )   ;
        D.initialFund	            =   Number(d.initialFund                )   ;
        D.hghestFund	            =   Number(d.hghestFund                 )   ;
        D.lowestFund	            =   Number(d.lowestFund                 )   ;
        D.allCoin	                =   Number(d.allCoin                    )   ;
        D.initialCoin	            =   Number(d.initialCoin                )   ;
        D.hghestCoin	            =   Number(d.hghestCoin                 )   ;
        D.lowestCoin	            =   Number(d.lowestCoin                 )   ;
        D.crtFund	                =   Number(d.crtFund                    )   ;
        D.crtCoin	                =   Number(d.crtCoin                    )   ;
        D.therePosition             =   (d.therePosition || String(d.therePosition).toUpperCase() === "TRUE")  ?  true  :  false  ;
        D.allPosition	            =   Number(d.allPosition                )   ;
        D.avgBuyPrice	            =   Number(d.avgBuyPrice                )   ;
        D.avgBuyPriceUnclose        =   Number(d.avgBuyPriceUnclose         )   ;
        D.lstBuyPriceUnclose        =   Number(d.lstBuyPriceUnclose         )   ;
        D.hghBuyPriceUnclose        =   Number(d.hghBuyPriceUnclose         )   ;
        D.lowBuyPriceUnclose        =   Number(d.lowBuyPriceUnclose         )   ; 
        D.lstBuySerial              =   Number(D.lstBuySerial               )   ;
        D.hghBuySerial              =   Number(D.hghBuySerial               )   ;
        D.lowBuySerial              =   Number(D.lowBuySerial               )   ;
        D.gridNum                   =   Number(d.gridNum                    )   ;
        D.gridDifficulty            =   Number(d.gridDifficulty             )   ;
        D.enDifficulty	            =   Number(d.enDifficulty               )   ;
        D.exDifficulty	            =   Number(d.exDifficulty               )   ;
        D.buyTimes	                =   Number(d.buyTimes                   )   ;
        D.sellTimes	                =   Number(d.sellTimes                  )   ;

        D.isReal                    =   (d.isReal || String(d.isReal).toUpperCase() === "TRUE")  ?  true  :  false  ;
        D.realTradeTime	            =   Number(d.realTradeTime              )   ;
        D.realTradeTimeTo           =   Number(d.realTradeTimeTo            )   ;
        D.inFund	                =   Number(d.inFund                     )   ;
        D.inCoin	                =   Number(d.inCoin                     )   ;
        D.inTradingSymbolPrice      =   Number(d.inTradingSymbolPrice       )   ;
        D.inBaseCoinPrice           =   Number(d.inBaseCoinPrice            )   ;
        D.BaseCoinHairCut	        =   Number(d.BaseCoinHairCut            )   ;
        D.leverage	                =   Number(d.leverage                   )   ;
        D.MaxGrid	                =   Number(d.MaxGrid                    )   ;
        D.minEnExPosition           =   Number(d.minEnExPosition            )   ;
        D.basicHghToBuy             =   Number(d.basicHghToBuy              )   ;
        D.basicLowToBuy             =   Number(d.basicLowToBuy              )   ;
        D.basicLowToSell            =   Number(d.basicLowToSell             )   ;
        D.notBuyCloseToRndHghStep   =   Number(d.notBuyCloseToRndHghStep    )   ;
        D.notBuyCloseToRndLowStep   =   Number(d.notBuyCloseToRndLowStep    )   ;
        D.stopRate4F	            =   Number(d.stopRate4F                 )   ;
        D.stopRate4C	            =   Number(d.stopRate4C                 )   ;
        D.notStop4C	                =   Number(d.notStop4C                  )   ;
        D.notStop4F	                =   Number(d.notStop4F                  )   ;
        D.difficultyCoefficient     =   Number(d.difficultyCoefficient      )   ;
        
        D.rcd_hghFund               =   Number(d.rcd_hghFund                )   ;
        D.rcd_lowFund               =   Number(d.rcd_lowFund                )   ;
        D.rcd_hghCoin               =   Number(d.rcd_hghCoin                )   ;
        D.rcd_lowCoin               =   Number(d.rcd_lowCoin                )   ;

        d = null ;

        if (D.timestamp > D.realTradeTime) {
            // 收到新消息数据初始化
            // 主要考虑3种情况：
            // 1, 未初始化时
            // 2, 正常运行时
            // 3, 出错时, 需重新初始化
            D.allPosition           =  (!D.runningWell) || isNaN(D.allPosition )  ?  0          :  D.allPosition                                                ;
            D.avgBuyPrice           =  (!D.runningWell) || isNaN(D.avgBuyPrice )  ?  0          :  D.avgBuyPrice                                                ;
            D.netProfit             =  (!D.runningWell) || isNaN(D.netProfit   )  ?  0          :  D.netProfit                                                  ;
            D.openProfit            =  D.allPosition * (D.TradingSymbolPrice - D.avgBuyPrice)                                                                   ;
            D.crtFund               =  D.inFund + D.netProfit + D.openProfit                                                                                    ;
            D.crtCoin               =  D.inCoin                                                                                                                 ;
            D.usedMargin            =  D.allPosition * D.TradingSymbolPrice / D.leverage                                                                        ;
            D.freeMargin            =  D.crtFund + D.crtCoin * D.BaseCoinPrice * D.BaseCoinHairCut - D.usedMargin                                               ;
            D.allFund               =  D.crtFund + D.crtCoin * D.BaseCoinPrice                                                                                  ;
            D.allCoin               =  D.crtFund / D.BaseCoinPrice + D.crtCoin                                                                                  ;
            D.initialFund           =  D.inFund + D.inCoin * D.inBaseCoinPrice                                                                                  ;
            D.initialCoin           =  D.inFund / D.inBaseCoinPrice + D.inCoin                                                                                  ;
            D.hghestFund            =  (!D.runningWell) || isNaN(D.hghestFund  )  ?  D.initialFund  :  ( D.allFund > D.hghestFund ? D.allFund : D.hghestFund )  ;
            D.lowestFund            =  (!D.runningWell) || isNaN(D.lowestFund  )  ?  D.initialFund  :  ( D.allFund < D.lowestFund ? D.allFund : D.lowestFund )  ;
            D.hghestCoin            =  (!D.runningWell) || isNaN(D.hghestCoin  )  ?  D.initialCoin  :  ( D.allCoin > D.hghestCoin ? D.allCoin : D.hghestCoin )  ;
            D.lowestCoin            =  (!D.runningWell) || isNaN(D.lowestCoin  )  ?  D.initialCoin  :  ( D.allCoin < D.lowestCoin ? D.allCoin : D.lowestCoin )  ;
            D.allTradeFee           =  (!D.runningWell) || isNaN(D.allTradeFee )  ?  0          :  D.allTradeFee                                                ;
            D.allFundFee            =  (!D.runningWell) || isNaN(D.allFundFee  )  ?  0          :  D.allFundFee                                                 ;
            D.gridNum               =  (!D.runningWell) || isNaN(D.gridNum     )  ?  0          :  D.gridNum                                                    ;
            D.buyTimes              =  (!D.runningWell) || isNaN(D.buyTimes    )  ?  0          :  D.buyTimes                                                   ;
            D.sellTimes             =  (!D.runningWell) || isNaN(D.sellTimes   )  ?  0          :  D.sellTimes                                                  ;
            D.avgBuyPriceUnclose    =  (!D.runningWell) || isNaN(D.avgBuyPriceUnclose )  ?  0  :  D.avgBuyPriceUnclose                                          ; 
            D.lstBuyPriceUnclose    =  (!D.runningWell) || isNaN(D.lstBuyPriceUnclose )  ?  0  :  D.lstBuyPriceUnclose                                          ; 
            D.hghBuyPriceUnclose    =  (!D.runningWell) || isNaN(D.hghBuyPriceUnclose )  ?  0  :  D.hghBuyPriceUnclose                                          ; 
            D.lowBuyPriceUnclose    =  (!D.runningWell) || isNaN(D.lowBuyPriceUnclose )  ?  0  :  D.lowBuyPriceUnclose                                          ; 
            D.lstBuySerial          =  (!D.runningWell) || isNaN(D.lstBuySerial       )  ?  0  :  D.lstBuySerial                                                ;
            D.hghBuySerial          =  (!D.runningWell) || isNaN(D.hghBuySerial       )  ?  0  :  D.hghBuySerial                                                ;
            D.lowBuySerial          =  (!D.runningWell) || isNaN(D.lowBuySerial       )  ?  0  :  D.lowBuySerial                                                ;


            D.rcd_hghFund       =  (!D.runningWell) || isNaN(D.rcd_hghFund )  ?  D.hghestFund  :  D.rcd_hghFund                                             ;
            D.rcd_lowFund       =  (!D.runningWell) || isNaN(D.rcd_lowFund )  ?  D.lowestFund  :  D.rcd_lowFund                                             ;
            D.rcd_hghCoin       =  (!D.runningWell) || isNaN(D.rcd_hghCoin )  ?  D.hghestCoin  :  D.rcd_hghCoin                                             ;
            D.rcd_lowCoin       =  (!D.runningWell) || isNaN(D.rcd_lowCoin )  ?  D.lowestCoin  :  D.rcd_lowCoin                                             ;

            D.crt_initialFund   =  (D.allFund - D.initialFund) / D.initialFund      ;
            D.crt_hghestFund    =  (D.allFund - D.hghestFund ) / D.hghestFund       ;
            D.crt_lowestFund    =  (D.allFund - D.lowestFund ) / D.lowestFund       ;
            D.crt_initialCoin   =  (D.allCoin - D.initialCoin) / D.initialCoin      ;
            D.crt_hghestCoin    =  (D.allCoin - D.hghestCoin ) / D.hghestCoin       ;
            D.crt_lowestCoin    =  (D.allCoin - D.lowestCoin ) / D.lowestCoin       ;

            D.crt_avgBuyPrice   =  (D.TradingSymbolPrice - D.avgBuyPrice) / D.avgBuyPrice   ;

            let [gridDifficulty, enDifficulty, exDifficulty] = GetGridDifficulty(   D.gridNum               ,
                                                                                    D.difficultyCoefficient , 
                                                                                    D.MaxGrid               )  ;
            D.gridDifficulty    =  gridDifficulty   ;
            D.enDifficulty      =  enDifficulty     ;
            D.exDifficulty      =  exDifficulty     ;

            let [liquidatePrice, stopPriceC, stopPriceF] = GetLiquidateStopPrice(   D.allPosition           , 
                                                                                    D.avgBuyPrice           , 
                                                                                    D.inFund                , 
                                                                                    D.netProfit             , 
                                                                                    D.crtCoin               , 
                                                                                    D.TradingSymbolPrice    , 
                                                                                    D.BaseCoinPrice         , 
                                                                                    D.BaseCoinHairCut       , 
                                                                                    D.avgAdn2B              , 
                                                                                    D.waveUpChg             , 
                                                                                    D.hghestFund            , 
                                                                                    D.hghestCoin            , 
                                                                                    D.stopRate4F            , 
                                                                                    D.stopRate4C            , 
                                                                                    D.notStop4F             , 
                                                                                    D.notStop4C             );

            D.liquidatePrice    =   liquidatePrice  ;
            D.stopPriceC        =   stopPriceC      ;
            D.stopPriceF        =   stopPriceF      ;

            D.tocrt_liquidatePrice  =  (D.liquidatePrice - D.TradingSymbolPrice) / D.TradingSymbolPrice   ;
            D.tocrt_stopPriceC      =  (D.stopPriceC     - D.TradingSymbolPrice) / D.TradingSymbolPrice   ;
            D.tocrt_stopPriceF      =  (D.stopPriceF     - D.TradingSymbolPrice) / D.TradingSymbolPrice   ;

            // 账户状态判断
            D.accStatus =  'Normal' ; 
            if (D.TradingSymbolPrice < D.liquidatePrice) {
                D.accStatus         = 'liquidated'                      ;
                D.thisAlertMessage  =  accStatus_liquidated     + '\n'  ;
            }
            if (D.TradingSymbolPrice < D.stopPriceC    ) {
                D.accStatus         = 'stopC'                           ;
                D.thisAlertMessage  =  accStatus_stopC          + '\n'  ;
            } 
            if (D.TradingSymbolPrice < D.stopPriceF    ) {
                D.accStatus         = 'stopF'                           ;
                D.thisAlertMessage  =  accStatus_stopF          + '\n'  ;
            }
            if (D.TradingSymbolPrice < D.stopPriceC  &&  D.TradingSymbolPrice < D.stopPriceF ) {
                D.accStatus         = 'stopCF'                          ;
                D.thisAlertMessage  =  accStatus_stopCF         + '\n'  ;
            }

            D.therePosition     =  D.gridNum > 0  ?  true  :  false  ; 

            /////////////////////////////////////////////////////////////////////////////////////////////////////////////

            if (D.allFund > (1+D.barChgA)*D.rcd_hghFund) { D.thisAlertMessage += 'new rcd_hghFund' + '\n' ; D.rcd_hghFund = D.allFund ;}
            if (D.allFund < (1-D.barChgA)*D.rcd_lowFund) { D.thisAlertMessage += 'new rcd_lowFund' + '\n' ; D.rcd_lowFund = D.allFund ;}
            if (D.allCoin > (1+D.barChgA)*D.rcd_hghCoin) { D.thisAlertMessage += 'new rcd_hghCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}
            if (D.allCoin < (1-D.barChgA)*D.rcd_lowCoin) { D.thisAlertMessage += 'new rcd_lowCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}

            D.canBuy            =  true     ;
            D.cantBuyReason     =  ""       ;
            D.canSell           =  true     ;
            D.cantSellReason    =  ""       ;
            
            D.closeToRndHgh     =  D.roundHgh / Math.pow((1+D.waveUpChg), D.notBuyCloseToRndHghStep)  ;
            D.closeToRndLow     =  D.roundLow / Math.pow((1+D.waveDnChg), D.notBuyCloseToRndLowStep)  ;
            D.hghToBuy          =  Math.min(D.basicHghToBuy, D.closeToRndHgh    )   ;
            D.lowToBuy          =  Math.max(D.basicLowToBuy, D.closeToRndLow    )   ;
            D.lowToSell         =  Math.max(D.basicLowToSell                    )   ;
            if (D.TradingSymbolPrice > D.basicHghToBuy) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=  'price > basicHghToBuy'  + '\n' ;
            }
            if (D.TradingSymbolPrice > D.closeToRndHgh) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=  'price closeToRndHgh'    + '\n' ;
            }
            if (D.TradingSymbolPrice < D.basicLowToBuy) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=  'price < basicLowToBuy'  + '\n' ;
            } 
            if (D.TradingSymbolPrice < D.closeToRndLow) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=  'price closeToRndLow'    + '\n' ;
            }
            if (D.TradingSymbolPrice < D.basicLowToSell) {
                D.canSell           =   false                           ;
                D.cantSellReason    +=  'price < basicLowToSell' + '\n' ;
            }
            D.thisAlertMessage      +=  D.cantBuyReason + D.cantSellReason  ;


            // 测试
            if (D.canBuy && D.touchTargetLow) {
                let S = {} ;
                S.ing_orderID       =  'od-' + D.tvUpdateTime           ;
                S.ing_orderDate     =  GetTimeStringWithOffset(8)       ;
                S.ing_confirmDate   =  null                             ;         
                S.ing_serial        =  D.gridNum + 1                    ;
                S.ing_buysell       =  order_BUY                        ;
                S.ing_triggerPrice  =  D.TradingSymbolPrice             ;
                S.ing_orderType     =  order_T_LMT                      ;
                S.ing_orderPrice    =  D.ing_triggerPrice               ;
                s.ing_confirmPrice  =  null                             ;
                S.ing_qty           =  D.minEnExPosition * Math.max(1, Math.floor(D.freeMargin*D.leverage/D.TradingSymbolPrice/D.minEnExPosition) ) ;
                S.ing_getProfit     =  null                             ;
                S.ing_avgBuyPrice   =  null                             ;
                S.ing_tradeFee      =  null                             ;
                S.ing_allFund       =  null                             ;
                S.ing_allCoin       =  null                             ;
                S.ing_reason        =  BuyReason_belowTarget            ;
                S.ing_orderStatus   =  order_pending                    ;

                S = await SendOrderToBroker(S, sheets, spreadsheetId) ;

                Object.assign(D, S) ;
            }

            // 测试


            D.runningWell       =   true                ;

        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }


        // if (!datas.ifNoError || datas.ifNoError === "FALSE") { //|| datas.TradingSymbol !== newDatasFromTV.TradingSymbol) {
        //     throw new Error(`!datas.ifNoError || datas.ifNoError === "FALSE" || datas.TradingSymbol !== newDatasFromTV.TradingSymbol`) ;
        // }


        const writeToRange = D.sheetTitle + '!A:B'; // 指定操作 A 到 B 列
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
                values: Object.entries(D)    ,
            }                                               ,
        });

        let newDatasFromSheet   =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
        let attempts            =  0;
        let waitTime            =  1000;

        while (attempts < 60 && Number(newDatasFromSheet.timestamp) < D.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP));
            attempts    += 1;
            waitTime    =  attempts * 1000;
        }
        if (Number(newDatasFromSheet.timestamp) >= D.timestamp) {
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


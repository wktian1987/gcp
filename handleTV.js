import {    NumStrBool                      , 
            CleanObjToNumStrBool            ,
            GetTimeStringWithOffset         , 
            SendSplitTGMessages             ,
            GetSpreadsheetID                ,                      
            FormatMatrixToString            ,            
            GetDataFromSheet                } from "./utility.js";
import {    SendOrderToBroker               ,
            CheckOrderConfirm               } from "./broker.js";    

import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

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
const   HuanHang        =  "__HuangHang__"  ;
const   order_T_LMT     =  "LMT"            ;
const   order_T_MKT     =  "MKT"            ; 
const   order_BUY       =  "B"              ;
const   order_SELL      =  "S"              ;
const   order_pending   =  "pending"        ;
const   order_waiting   =  "waiting"        ;
const   order_confirm   =  "confirm"        ;

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


function ReNewAccount(D, newData) {
        if (newData !== undefined) { Object.assign(D, newData) ; }
        CleanObjToNumStrBool(D) ;
        D.thisAlertMessage  +=  "\n"  ;
        // D.testAvai  += "\n" + "Now allPosition: "  + String(D.allPosition); // 删除本行

        D.allPosition           =  isNaN(D.allPosition )  ?  0          :  D.allPosition                                                ;
        D.avgBuyPrice           =  isNaN(D.avgBuyPrice )  ?  0          :  D.avgBuyPrice                                                ;
        D.netProfit             =  isNaN(D.netProfit   )  ?  0          :  D.netProfit                                                  ;
        D.openProfit            =  D.allPosition * (D.TradingSymbolPrice - D.avgBuyPrice)                                               ;
        D.crtFund               =  D.inFund + D.netProfit + D.openProfit                                                                ;
        D.crtCoin               =  D.inCoin                                                                                             ;
        D.usedMargin            =  D.allPosition * D.TradingSymbolPrice / D.leverage                                                    ;
        D.freeMargin            =  D.crtFund + D.crtCoin * D.BaseCoinPrice * D.BaseCoinHairCut - D.usedMargin                           ;
        D.allFund               =  D.crtFund + D.crtCoin * D.BaseCoinPrice                                                              ;
        D.allCoin               =  D.crtFund / D.BaseCoinPrice + D.crtCoin                                                              ;
        D.initialFund           =  D.inFund + D.inCoin * D.inBaseCoinPrice                                                              ;
        D.initialCoin           =  D.inFund / D.inBaseCoinPrice + D.inCoin                                                              ;
        D.hghestFund            =  isNaN(D.hghestFund  )  ?  D.initialFund  :  ( D.allFund > D.hghestFund ? D.allFund : D.hghestFund )  ;
        D.lowestFund            =  isNaN(D.lowestFund  )  ?  D.initialFund  :  ( D.allFund < D.lowestFund ? D.allFund : D.lowestFund )  ;
        D.hghestCoin            =  isNaN(D.hghestCoin  )  ?  D.initialCoin  :  ( D.allCoin > D.hghestCoin ? D.allCoin : D.hghestCoin )  ;
        D.lowestCoin            =  isNaN(D.lowestCoin  )  ?  D.initialCoin  :  ( D.allCoin < D.lowestCoin ? D.allCoin : D.lowestCoin )  ;
        D.allTradeFee           =  isNaN(D.allTradeFee )  ?  0          :  D.allTradeFee                                                ;
        D.allFundFee            =  isNaN(D.allFundFee  )  ?  0          :  D.allFundFee                                                 ;
        D.gridNum               =  isNaN(D.gridNum     )  ?  0          :  D.gridNum                                                    ;
        D.buyTimes              =  isNaN(D.buyTimes    )  ?  0          :  D.buyTimes                                                   ;
        D.sellTimes             =  isNaN(D.sellTimes   )  ?  0          :  D.sellTimes                                                  ;
        D.avgBuyPriceUnclose    =  isNaN(D.avgBuyPriceUnclose )  ?  0  :  D.avgBuyPriceUnclose                                          ; 
        D.lstBuyPriceUnclose    =  isNaN(D.lstBuyPriceUnclose )  ?  0  :  D.lstBuyPriceUnclose                                          ; 
        D.hghBuyPriceUnclose    =  isNaN(D.hghBuyPriceUnclose )  ?  0  :  D.hghBuyPriceUnclose                                          ; 
        D.lowBuyPriceUnclose    =  isNaN(D.lowBuyPriceUnclose )  ?  0  :  D.lowBuyPriceUnclose                                          ; 
        D.lstBuySerial          =  isNaN(D.lstBuySerial       )  ?  0  :  D.lstBuySerial                                                ;
        D.hghBuySerial          =  isNaN(D.hghBuySerial       )  ?  0  :  D.hghBuySerial                                                ;
        D.lowBuySerial          =  isNaN(D.lowBuySerial       )  ?  0  :  D.lowBuySerial                                                ;
        D.last_orderTime        =  isNaN(D.last_orderTime     )  ?  0  :  D.last_orderTime                                ;

        D.rcd_hghFund           =  isNaN(D.rcd_hghFund )  ?  D.hghestFund  :  D.rcd_hghFund                                             ;
        D.rcd_lowFund           =  isNaN(D.rcd_lowFund )  ?  D.lowestFund  :  D.rcd_lowFund                                             ;
        D.rcd_hghCoin           =  isNaN(D.rcd_hghCoin )  ?  D.hghestCoin  :  D.rcd_hghCoin                                             ;
        D.rcd_lowCoin           =  isNaN(D.rcd_lowCoin )  ?  D.lowestCoin  :  D.rcd_lowCoin                                             ;

        D.crt_initialFund       =  (D.allFund - D.initialFund) / D.initialFund      ;
        D.crt_hghestFund        =  (D.allFund - D.hghestFund ) / D.hghestFund       ;
        D.crt_lowestFund        =  (D.allFund - D.lowestFund ) / D.lowestFund       ;
        D.crt_initialCoin       =  (D.allCoin - D.initialCoin) / D.initialCoin      ;
        D.crt_hghestCoin        =  (D.allCoin - D.hghestCoin ) / D.hghestCoin       ;
        D.crt_lowestCoin        =  (D.allCoin - D.lowestCoin ) / D.lowestCoin       ;

        D.crt_avgBuyPrice       =  (D.TradingSymbolPrice - D.avgBuyPrice) / D.avgBuyPrice   ;

        [D.gridDifficulty, D.enDifficulty, D.exDifficulty] = GetGridDifficulty( D.gridNum               ,
                                                                                D.difficultyCoefficient , 
                                                                                D.MaxGrid               )  ;

        [D.liquidatePrice, D.stopPriceC, D.stopPriceF] = GetLiquidateStopPrice( D.allPosition           , 
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

        if (D.allFund > (1+D.barChgA)*D.rcd_hghFund) { D.thisAlertMessage += 'new rcd_hghFund' + '\n' ; D.rcd_hghFund = D.allFund ;}
        if (D.allFund < (1-D.barChgA)*D.rcd_lowFund) { D.thisAlertMessage += 'new rcd_lowFund' + '\n' ; D.rcd_lowFund = D.allFund ;}
        if (D.allCoin > (1+D.barChgA)*D.rcd_hghCoin) { D.thisAlertMessage += 'new rcd_hghCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}
        if (D.allCoin < (1-D.barChgA)*D.rcd_lowCoin) { D.thisAlertMessage += 'new rcd_lowCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}

        D.closeToRndHgh     =  D.roundHgh / Math.pow((1+D.waveUpChg), D.notBuyCloseToRndHghStep)  ;
        D.closeToRndLow     =  D.roundLow / Math.pow((1+D.waveDnChg), D.notBuyCloseToRndLowStep)  ;
        D.hghToBuy          =  Math.min(D.basicHghToBuy, D.closeToRndHgh    )   ;
        D.lowToBuy          =  Math.max(D.basicLowToBuy, D.closeToRndLow    )   ;
        D.lowToSell         =  Math.max(D.basicLowToSell                    )   ;

}



export async function HandleTV(d) {
    CleanObjToNumStrBool(d) ;
    d.thisAlertMessage          =   String(d.thisAlertMessage || "").replaceAll(HuanHang, "\n")         ;
    d.tvUpdateTime              =   GetTimeStringWithOffset(8, d.timestamp)                             ;
    d.gcpGetTime                =   GetTimeStringWithOffset(8)                                          ;
    

    try {
        const spreadsheetId = GetSpreadsheetID(d.botNumber);
        //获取现存数据
        const ranges    =   Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, toGCPRanges ) )                                ;
        const D         =   ranges.toGCP                                                                                            ?
                            CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP)))   :  
                            {}                                                                                                              ;
        Object.assign(D, d);
        

        if (D.timestamp > D.realTradeTime) {
            // 收到新消息数据初始化
            // 主要考虑3种情况：
            // 1, 未初始化时
            // 2, 正常运行时
            // 3, 出错时, 需重新初始化
            ReNewAccount(D) ;

            /////////////////////////////////////////////////////////////////////////////////////////////////////////////
            if (D.ing_orderStatus === order_waiting) {
                D.ifOrderWaiting    =  true                                                             ;
                D.thisAlertMessage  +=  'cannot trade due to existing order waiting confirmed' + '\n'   ;

                let ifWaitingThenCancel = true  ;
                if (D.ing_buysell = order_BUY  && D.TradingSymbolPrice < D.ing_orderPrice*(1+D.waveUpChg)) {ifWaitingThenCancel = false ;}
                if (D.ing_buysell = order_SELL && D.TradingSymbolPrice > D.ing_orderPrice*(1+D.waveDnChg)) {ifWaitingThenCancel = false ;}
                const res_broker = await CheckOrderConfirm(ifWaitingThenCancel, sheets, spreadsheetId) ;
                if (res_broker.ing_orderStatus === "cancel" )  {
                    delete D.ing_orderID            ; 
                    delete D.ing_orderTimestamp     ; 
                    delete D.ing_orderDate          ; 
                    delete D.ing_confirmTimestamp   ; 
                    delete D.ing_confirmDate        ; 
                    delete D.ing_serial             ; 
                    delete D.ing_buysell            ; 
                    delete D.ing_triggerPrice       ; 
                    delete D.ing_orderType          ; 
                    delete D.ing_orderPrice         ; 
                    delete D.ing_confirmPrice       ; 
                    delete D.ing_boughtPrice        ; 
                    delete D.ing_qty                ; 
                    delete D.ing_getProfit          ; 
                    delete D.ing_avgBuyPrice        ; 
                    delete D.ing_tradeFee           ; 
                    delete D.ing_allFund            ; 
                    delete D.ing_allCoin            ; 
                    delete D.ing_reason             ; 
                    delete D.ing_orderStatus        ; 
                }

                if (res_broker.ing_orderStatus  === "confirm")  {
                    Object.assign(D, res_broker)  ;// 此时res_broker中已包括 last_orderTime
                    const newTradehistory = [ [ D.ing_orderID       || "NA"  ,
                                                D.ing_orderDate     || "NA"  ,
                                                D.ing_confirmDate   || "NA"  ,
                                                D.ing_serial        || "NA"  ,
                                                D.ing_buysell       || "NA"  ,
                                                D.ing_triggerPrice  || "NA"  ,
                                                D.ing_orderType     || "NA"  ,
                                                D.ing_orderPrice    || "NA"  ,
                                                D.ing_confirmPrice  || "NA"  ,
                                                D.ing_boughtPrice   || "NA"  ,
                                                D.ing_qty           || "NA"  ,
                                                D.ing_getProfit     || "NA"  ,
                                                D.ing_avgBuyPrice   || "NA"  ,
                                                D.ing_tradeFee      || "NA"  ,
                                                D.ing_allFund       || "NA"  ,
                                                D.ing_allCoin       || "NA"  ,
                                                D.ing_reason        || "NA"  ] ]  ;
                    await sheets.spreadsheets.values.append({
                        spreadsheetId                                           ,
                        range               : "tradeHistory!A1:A"               ,
                        valueInputOption    : 'USER_ENTERED'                    , 
                        requestBody         : { values: newTradehistory }       }   )   ;
                    
                    let uncloseOrders = await GetDataFromSheet(sheets, spreadsheetId, ranges.uncloseOrdersRange) || []; // 确保它永远是个数组
                    if (D.ing_buysell === order_BUY) {
                        uncloseOrders.push( [ 
                                            D.ing_orderID                   || "NA"  ,
                                            D.ing_orderDate                 || "NA"  ,
                                            D.ing_serial                    || "NA"  ,
                                            D.ing_triggerPrice              || "NA"  ,
                                            D.ing_confirmPrice              || "NA"  ,
                                            D.ing_qty                       || "NA"  ,
                                            D.ing_confirmPrice * D.ing_qty  || "NA"  ,
                                            D.ing_reason                    || "NA"  ] ) ;
                    } 
                    if (D.ing_buysell === order_SELL) {
                        uncloseOrders = uncloseOrders.filter(row => String(row[2]) !== String(D.ing_serial));
                    }
                    await sheets.spreadsheets.values.clear( {
                        spreadsheetId                                   ,
                        range           : ranges.uncloseOrdersRange     } ) ;
                    if (uncloseOrders.length > 0) {
                        await sheets.spreadsheets.values.update({
                            spreadsheetId                                           ,
                            range               : ranges.uncloseOrdersRange         ,
                            valueInputOption    : 'USER_ENTERED'                    , 
                            requestBody         : { values: uncloseOrders }         }   )   ;
                    }

                    D.ifOrderWaiting        =   false                                                                                                   ;
                    D.netProfit             +=  D.ing_getProfit + D.ing_tradeFee                                                                        ;
                    D.avgBuyPrice           =   D.ing_avgBuyPrice                                                                                       ;
                    D.allTradeFee           +=  D.ing_tradeFee                                                                                          ;
                    D.gridNum               +=  D.ing_buysell===order_BUY  ?  1  : -1                                                                   ;
                    D.buyTimes              +=  D.ing_buysell===order_BUY  ?  1  : 0                                                                    ;
                    D.sellTimes             +=  D.ing_buysell===order_BUY  ?  1  : 0                                                                    ;
                    D.avgBuyPriceUnclose    =   D.gridNum > 0  ?
                                                (D.avgBuyPriceUnclose * D.allPosition + D.ing_avgBuyPrice * D.ing_qty) / (D.allPosition + D.ing_qty) :
                                                0                                                                                                       ;
                    D.allPosition           +=  D.ing_qty                                                                                               ;

                    D.lstBuyPriceUnclose    =  uncloseOrders.length > 0  ?  uncloseOrders[0][4]  :  0    ;
                    D.hghBuyPriceUnclose    =  uncloseOrders.length > 0  ?  uncloseOrders[0][4]  :  0    ; 
                    D.lowBuyPriceUnclose    =  uncloseOrders.length > 0  ?  uncloseOrders[0][4]  :  0    ; 
                    D.lstBuySerial          =  uncloseOrders.length > 0  ?  0                    :  0    ;

                    if (uncloseOrders.length > 0) {
                        uncloseOrders.forEach((order) => {
                            D.lstBuyPriceUnclose    = D.lstBuySerial       < order[2]   ?  order[4]  :  D.lstBuyPriceUnclose    ;
                            D.hghBuyPriceUnclose    = D.hghBuyPriceUnclose < order[4]   ?  order[4]  :  D.hghBuyPriceUnclose    ; 
                            D.lowBuyPriceUnclose    = D.lowBuyPriceUnclose > order[4]   ?  order[4]  :  D.lowBuyPriceUnclose    ; 
                            D.lstBuySerial          = D.lstBuySerial       < order[2]   ?  order[2]  :  D.lstBuySerial          ;
                        });
                    }

                    ReNewAccount(D) ;
                }
            }


            D.canBuy            =  true     ;
            D.cantBuyReason     =  ""       ;
            D.canSell           =  true     ;
            D.cantSellReason    =  ""       ;

            D.inOrdersInterval =  false  ;
            if (D.timestamp - D.last_orderTime < D.ordersInterval * 60000) {
                D.inOrdersInterval  =  true  ;
                D.thisAlertMessage  += 'cannot trade due to ordersInterval' + '\n'  ;
            }
            if (D.inOrdersInterval || D.ing_orderStatus === order_waiting) {
                D.canBuy            =  false  ;
                D.canSell           =  false  ;
                D.cantBuyReason     +=  'there order waiting' + '\n' ;
                D.cantSellReason    +=  'there order waiting' + '\n' ;
            }

            if (D.gridNum >= D.MaxGrid) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=  "gridNum >== MaxGrid"    + "\n" ;
            }
            

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

            if (D.freeMargin / (D.MaxGrid - D.gridNum) < 1.1 * D.minEnExPosition * D.TradingSymbolPrice / D.leverage) {
                D.canBuy            =   false                           ;
                D.cantBuyReason     +=   'Not enough freeMargin' + '\n' ;
            }

            if (D.gridNum < 1) {
                D.canSell           =   false                           ;
                D.cantSellReason    +=  'No position to sell'    + '\n' ;
            }

            D.thisAlertMessage      +=  D.cantBuyReason + D.cantSellReason  ;
            

            if (D.canBuy && D.touchTargetLow) {
            // if (D.canBuy) {
                let nowTimestamp = Date.now()   ;
                let S = {} ;
                S.ing_orderID           =  'B-' + D.tvUpdateTime           ;
                S.ing_orderTimestamp    =  nowTimestamp                     ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8)       ;
                S.ing_confirmTimestamp  =  "NA"                             ;
                S.ing_confirmDate       =  "NA"                             ;
                S.ing_serial            =  D.gridNum + 1                    ;
                S.ing_buysell           =  order_BUY                        ;
                S.ing_triggerPrice      =  D.TradingSymbolPrice             ;
                S.ing_orderType         =  order_T_LMT                      ;
                S.ing_orderPrice        =  S.ing_triggerPrice               ;
                S.ing_confirmPrice      =  "NA"                             ;
                S.ing_boughtPrice       =  "NA"                             ;
                S.ing_qty               =  D.minEnExPosition * Math.max(1, Math.floor(D.freeMargin*D.leverage/D.TradingSymbolPrice/D.minEnExPosition/(D.MaxGrid - D.gridNum)) ) ;
                S.ing_getProfit         =  "NA"                             ;
                S.ing_avgBuyPrice       =  "NA"                             ;
                S.ing_tradeFee          =  "NA"                             ;
                S.ing_allFund           =  "NA"                             ;
                S.ing_allCoin           =  "NA"                             ;
                S.ing_reason            =  BuyReason_belowTarget            ;
                S.ing_orderStatus       =  order_pending                    ;

                S = await SendOrderToBroker(S, sheets, spreadsheetId) ;

                S.thisAlertMessage  +=  "New buy order" + "\n"  ;
                Object.assign(D, S) ;
            }

            D.toSell        =  false    ;
            let toSellOrder =  []       ;
            // orderID	orderDate	serial	triggerPrice	confirmPrice	qty	P×Q	reason
            if ( D.canSell && (D.TradingSymbolPrice > (1+D.waveUpChg) * D.lstBuyPriceUnclose)  &&  D.touchTargetHgh  ) {
                let uncloseOrders = await GetDataFromSheet(sheets, spreadsheetId, ranges.uncloseOrdersRange) || []; // 确保它永远是个数组
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.lstBuySerial)   ) ;
                toSellOrder[7] = 'touchTargetHgh'   ;
            }


            if (D.canSell &&  D.toSell ) {
                let nowTimestamp = Date.now()   ;
                let S = {} ;
                S.ing_orderID           =  toSellOrder[0].trim().replace('B', 'S')          ;
                S.ing_orderTimestamp    =  nowTimestamp                                     ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8)                       ;
                S.ing_confirmTimestamp  =  "NA"                                             ;
                S.ing_confirmDate       =  "NA"                                             ;
                S.ing_serial            =  -1 * Number(toSellOrder[2])                      ;
                S.ing_buysell           =  order_SELL                                       ;
                S.ing_triggerPrice      =  D.TradingSymbolPrice                             ;
                S.ing_orderType         =  order_T_LMT                                      ;
                S.ing_orderPrice        =  S.ing_triggerPrice                               ;
                S.ing_confirmPrice      =  "NA"                                             ;
                S.ing_boughtPrice       =  NumStrBool(toSellOrder[4])                       ;
                S.ing_qty               =  -1 * Number(toSellOrder[5])                      ;
                S.ing_getProfit         =  "NA"                                             ;
                S.ing_avgBuyPrice       =  "NA"                                             ;
                S.ing_tradeFee          =  "NA"                                             ;
                S.ing_allFund           =  "NA"                                             ;
                S.ing_allCoin           =  "NA"                                             ;
                S.ing_reason            =  toSellOrder[7]                                   ;
                S.ing_orderStatus       =  order_pending                                    ;

                S = await SendOrderToBroker(S, sheets, spreadsheetId) ;

                S.thisAlertMessage  +=  "New sell order" + "\n"  ;
                Object.assign(D, S) ;
            }

            D.runningWell       =   true    ;

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
            spreadsheetId                                               ,
            range               : writeToRange                          ,
            valueInputOption    : 'USER_ENTERED'                        , // 允许自动识别数字/日期格式
            requestBody         : {values: Object.entries(D)    ,   }   ,
        });

        let newDatasFromSheet   =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toTgBotRange));
        let attempts            =  0;
        let waitTime            =  1000;

        while (attempts < 60 && Number(newDatasFromSheet.timestamp) < D.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasFromSheet = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toTgBotRange));
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


import {    NumStrBool                      , 
            CleanObjToNumStrBool            ,
            GetTimeStringWithOffset         , 
            SendSplitTGMessages             ,
            FormatMatrixToString            ,            
            GetSpreadsheetID                ,
            GetDataFromSheet                } from "./utility.js";
import {    SendOrderToBroker               ,
            CheckOrderConfirm               ,               
            CheckFundFee                    } from "./broker.js";    

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

const   noLOCK          =  "noLOCK"         ;
const   NA              =  "NA"             ;
const   toFill          =  "toFill"         ;
const   toGCPRanges     =  "toGCP!A:B"      ;
const   lockRange       =  "toGCP!B1"       ;
const   HuanHang        =  "__HuangHang__"  ;
const   order_T_LMT     =  "LMT"            ;
const   order_T_MKT     =  "MKT"            ; 
const   order_BUY       =  "B"              ;
const   order_SELL      =  "S"              ;
const   order_FUND      =  "F"              ;
const   order_pending   =  "pending"        ;
const   order_waiting   =  "waiting"        ;
const   order_confirm   =  "confirm"        ;
const   order_cancel    =  "cancel"         ;

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

function CalUncloseordersAvgprice(uncloseOrders) {
    let all_P   = 0  ;
    let all_PXQ = 0  ;
    uncloseOrders.forEach(element => {
        all_P   += Number(element[5]) ;
        all_PXQ += Number(element[6]) ;
    });
    return all_PXQ / all_P  ;
}

function isValue(v) {
    if (v === NA)                           return true ;
    if (typeof v === "boolean")             return true ;
    if (typeof v === "number" && !isNaN(v)) return true ; // 纯数字类型            return true;
    return false ;
}
function isNotV(v) {
    return !isValue(v) ;
}
function NA0(v, z) {
    if (v === NA) return (z===undefined ? 0 : z);
    return v;
}

function ReNewAccount(D, newData) {
        if (newData !== undefined) { Object.assign(D, newData) ; }
        CleanObjToNumStrBool(D) ;
        D.thisAlertMessage  +=  "\n"  ;

        D.gridNum               =  isNaN(D.gridNum)  ?  0               :  D.gridNum    ;
        D.therePosition         =  D.gridNum > 0     ?  true            :  false        ;
        D.allPosition           =  D.therePosition   ?  D.allPosition   :  NA           ;
        D.avgBuyPrice           =  D.therePosition   ?  D.avgBuyPrice   :  NA           ;
        D.openProfit            =  D.therePosition   ?  D.allPosition * (D.TradingSymbolPrice - D.avgBuyPrice)  :  NA     ;
        D.usedMargin            =  D.therePosition   ?  D.allPosition * D.TradingSymbolPrice / D.leverage       :  NA     ;

        D.netProfit             =  isNotV(D.netProfit)  ?  NA  :  D.netProfit  ;

        D.crtFund               =  D.inFund + NA0(D.netProfit) + NA0(D.openProfit)                                  ;
        D.crtCoin               =  D.inCoin                                                                         ;
        D.freeMargin            =  D.crtFund + D.crtCoin * D.BaseCoinPrice * D.BaseCoinHairCut - NA0(D.usedMargin)  ;
        D.allFund               =  D.crtFund + D.crtCoin * D.BaseCoinPrice                                          ;
        D.allCoin               =  D.crtFund / D.BaseCoinPrice + D.crtCoin                                          ;
        D.initialFund           =  D.inFund + D.inCoin * D.inBaseCoinPrice                                          ;
        D.initialCoin           =  D.inFund / D.inBaseCoinPrice + D.inCoin                                          ;

        D.hghestFund            =  isNaN(D.hghestFund)  ?  D.initialFund  :  ( D.allFund > D.hghestFund ? D.allFund : D.hghestFund )   ;
        D.lowestFund            =  isNaN(D.lowestFund)  ?  D.initialFund  :  ( D.allFund < D.lowestFund ? D.allFund : D.lowestFund )   ;
        D.hghestCoin            =  isNaN(D.hghestCoin)  ?  D.initialCoin  :  ( D.allCoin > D.hghestCoin ? D.allCoin : D.hghestCoin )   ;
        D.lowestCoin            =  isNaN(D.lowestCoin)  ?  D.initialCoin  :  ( D.allCoin < D.lowestCoin ? D.allCoin : D.lowestCoin )   ;

        D.allTradeFee           =  isNotV(D.allTradeFee )  ?  NA  :  D.allTradeFee   ;
        D.allFundFee            =  isNotV(D.allFundFee  )  ?  NA  :  D.allFundFee    ;

        D.buyTimes              =  isNaN(D.buyTimes )  ?  0  :  D.buyTimes   ;
        D.sellTimes             =  isNaN(D.sellTimes)  ?  0  :  D.sellTimes  ;

        D.avgBuyPriceUnclose    =  !D.therePosition  ?  NA  :  D.avgBuyPriceUnclose   ;
        D.lstBuyPriceUnclose    =  !D.therePosition  ?  NA  :  D.lstBuyPriceUnclose   ;
        D.hghBuyPriceUnclose    =  !D.therePosition  ?  NA  :  D.hghBuyPriceUnclose   ;
        D.lowBuyPriceUnclose    =  !D.therePosition  ?  NA  :  D.lowBuyPriceUnclose   ;
        D.lstBuySerialUnclose   =  !D.therePosition  ?  NA  :  D.lstBuySerialUnclose  ;
        D.hghBuySerialUnclose   =  !D.therePosition  ?  NA  :  D.hghBuySerialUnclose  ;
        D.lowBuySerialUnclose   =  !D.therePosition  ?  NA  :  D.lowBuySerialUnclose  ;

        D.lstBuyPrice           =  isNotV(D.lstBuyPrice        )  ?  NA  :  D.lstBuyPrice          ;
        D.lstBuySerial          =  isNotV(D.lstBuySerial       )  ?  NA  :  D.lstBuySerial         ;

        D.lstTradeTime          =  isNotV(D.lstTradeTime       )  ?  NA  :  D.lstTradeTime         ;
        D.lstFundTime           =  isNotV(D.lstFundTime        )  ?  NA  :  D.lstFundTime          ;

        D.rcd_hghFund           =  isNaN(D.rcd_hghFund )  ?  D.hghestFund  :  D.rcd_hghFund  ;
        D.rcd_lowFund           =  isNaN(D.rcd_lowFund )  ?  D.lowestFund  :  D.rcd_lowFund  ;
        D.rcd_hghCoin           =  isNaN(D.rcd_hghCoin )  ?  D.hghestCoin  :  D.rcd_hghCoin  ;
        D.rcd_lowCoin           =  isNaN(D.rcd_lowCoin )  ?  D.lowestCoin  :  D.rcd_lowCoin  ;

        D.frCRT_avgBuyPrice         =  D.therePosition  ?  (D.avgBuyPrice           - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_avgBuyPriceUnclose  =  D.therePosition  ?  (D.avgBuyPriceUnclose    - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_lstBuyPriceUnclose  =  D.therePosition  ?  (D.lstBuyPriceUnclose    - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_hghBuyPriceUnclose  =  D.therePosition  ?  (D.hghBuyPriceUnclose    - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_lowBuyPriceUnclose  =  D.therePosition  ?  (D.lowBuyPriceUnclose    - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_lstBuyPrice         =  typeof D.lstBuyPrice === "number"  ?  (D.lstBuyPrice - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;

        D.toCRT_initialFund     =  (D.allFund - D.initialFund) / D.initialFund      ;
        D.toCRT_hghestFund      =  (D.allFund - D.hghestFund ) / D.hghestFund       ;
        D.toCRT_lowestFund      =  (D.allFund - D.lowestFund ) / D.lowestFund       ;
        D.toCRT_initialCoin     =  (D.allCoin - D.initialCoin) / D.initialCoin      ;
        D.toCRT_hghestCoin      =  (D.allCoin - D.hghestCoin ) / D.hghestCoin       ;
        D.toCRT_lowestCoin      =  (D.allCoin - D.lowestCoin ) / D.lowestCoin       ;

        

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

        D.liquidatePrice    =  D.therePosition  ?  D.liquidatePrice  :  NA  ;
        D.stopPriceC        =  D.therePosition  ?  D.stopPriceC      :  NA  ;
        D.stopPriceF        =  D.therePosition  ?  D.stopPriceF      :  NA  ;
        D.frCRT_liquidatePrice  =  D.therePosition  ?  (D.liquidatePrice - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_stopPriceC      =  D.therePosition  ?  (D.stopPriceC     - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;
        D.frCRT_stopPriceF      =  D.therePosition  ?  (D.stopPriceF     - D.TradingSymbolPrice) / D.TradingSymbolPrice  :  NA  ;

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

        

        if (D.allFund > (1+D.barChgA)*D.rcd_hghFund) { D.thisAlertMessage += 'new rcd_hghFund' + '\n' ; D.rcd_hghFund = D.allFund ;}
        if (D.allFund < (1-D.barChgA)*D.rcd_lowFund) { D.thisAlertMessage += 'new rcd_lowFund' + '\n' ; D.rcd_lowFund = D.allFund ;}
        if (D.allCoin > (1+D.barChgA)*D.rcd_hghCoin) { D.thisAlertMessage += 'new rcd_hghCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}
        if (D.allCoin < (1-D.barChgA)*D.rcd_lowCoin) { D.thisAlertMessage += 'new rcd_lowCoin' + '\n' ; D.rcd_hghCoin = D.allCoin ;}

        D.closeToRndHgh     =  D.roundHgh / Math.pow((1+D.waveUpChg), D.notBuyCloseToRndHghStep)  ;
        D.closeToRndLow     =  D.roundLow / Math.pow((1+D.waveDnChg), D.notBuyCloseToRndLowStep)  ;
        D.hghToBuy          =  Math.min(D.basicHghToBuy                             ,
                                        D.closeToRndHgh                             ,
                                        NA0(D.lowBuyPriceUnclose, D.basicHghToBuy)  )   ;
        D.lowToBuy          =  Math.max(D.basicLowToBuy, D.closeToRndLow    )   ;
        D.lowToSell         =  Math.max(D.basicLowToSell                    )   ;

        D.canBuy            =  true     ;
        D.cantBuyReason     =  ""       ;
        D.canSell           =  true     ;
        D.cantSellReason    =  ""       ;

        if (D.timestamp - D.lstTradeTime < D.ordersInterval * 60000) {
            D.canSell           =  false  ;
            D.cantBuyReason     +=  'cant buy: '  + 'there order just done, wait some time' + '\n' ;
            D.cantSellReason    +=  'cant sell: ' + 'there order just done, wait some time' + '\n' ;
        }

        D.ifOrderWaiting  =  D.ing_orderStatus === order_waiting  ;
        if (D.ifOrderWaiting) {
            D.canBuy            =  false  ;
            D.canSell           =  false  ;
            D.cantBuyReason     +=  'cant buy: '  + 'there order waiting' + '\n' ;
            D.cantSellReason    +=  'cant sell: ' + 'there order waiting' + '\n' ;
        }

        if (D.gridNum >= D.MaxGrid) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + "gridNum >== MaxGrid"    + "\n" ;
        }
            
        if (D.TradingSymbolPrice > D.basicHghToBuy) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + 'price > basicHghToBuy'  + '\n' ;
        }
        if (D.TradingSymbolPrice > D.closeToRndHgh) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + 'price closeToRndHgh'    + '\n' ;
        }
        if(D.TradingSymbolPrice > D.lowBuyPriceUnclose) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + 'price > lowBuyPriceUnclose' + '\n' ;
        }
        if (D.TradingSymbolPrice < D.basicLowToBuy) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + 'price < basicLowToBuy'  + '\n' ;
        } 
        if (D.TradingSymbolPrice < D.closeToRndLow) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=  'cant buy: '  + 'price closeToRndLow'    + '\n' ;
        }
        if (D.freeMargin / (D.MaxGrid - D.gridNum) < 1.1 * D.minEnExPosition * D.TradingSymbolPrice / D.leverage) {
            D.canBuy            =   false                           ;
            D.cantBuyReason     +=   'cant buy: '  + 'Not enough freeMargin' + '\n' ;
        }



        if (D.TradingSymbolPrice < D.basicLowToSell) {
            D.canSell           =   false                           ;
            D.cantSellReason    +=  'cant sell: ' + 'price < basicLowToSell' + '\n' ;
        }

        if (D.gridNum < 1) {
            D.canSell           =   false                           ;
            D.cantSellReason    +=  'cant sell: ' + 'No position to sell'    + '\n' ;
        }

        D.thisAlertMessage      +=  D.cantBuyReason + D.cantSellReason  ;

}

async function CheckLock(lockName, sheets, spreadsheetId) {
    const _currentLOCK = await GetDataFromSheet(sheets, spreadsheetId, lockRange) ;
    const currentLOCK  = _currentLOCK[0][0]  ;
    return currentLOCK === lockName  ?  true  :  false  ;
}
async function SetLock(lockName, sheets, spreadsheetId) {
    let currentNoLock = await CheckLock(noLOCK, sheets, spreadsheetId)  ;
    let attempts = 1 ;
    while (!currentNoLock && attempts < 30) {
        attempts    +=  1  ;
        await new Promise(res => setTimeout(res, 1000));
        currentNoLock = await CheckLock(noLOCK, sheets, spreadsheetId)  ;
        console.log(`第${attempts}次尝试获取lock`) ;
    }
    if (attempts > 25) {return false}
    await sheets.spreadsheets.values.update({
                        spreadsheetId                                           ,
                        range               : lockRange                         ,
                        valueInputOption    : 'USER_ENTERED'                    , 
                        requestBody         : { values: [[lockName]] }          }   )   ;
    return await CheckLock(lockName, sheets, spreadsheetId) ;
}
async function ReleaseLock(lockName, sheets, spreadsheetId) {
    let currentLockRight = await CheckLock(lockName, sheets, spreadsheetId)  ;
    if (!currentLockRight) {return false ;}
    await sheets.spreadsheets.values.update({
                    spreadsheetId                                           ,
                    range               : lockRange                         ,
                    valueInputOption    : 'USER_ENTERED'                    , 
                    requestBody         : { values: [[noLOCK]] }            }   )   ;
    currentLockRight = await CheckLock(noLOCK, sheets, spreadsheetId)  ;
    if (!currentLockRight) {return false ;}
    return true ;
}

export async function HandleTV(d) {
    CleanObjToNumStrBool(d) ;
    d.thisAlertMessage          =   String(d.thisAlertMessage || "").replaceAll(HuanHang, "\n")  ;
    d.gcpGetTime                =   Date.now()                                                   ;

    const thisLockName = 'T' + String(d.timestamp) ;

    try {
        const spreadsheetId = await GetSpreadsheetID(d.botNumber, sheets)  ;
        //获取现存数据
        const ranges    =   CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, toGCPRanges )))           ;
        const D         =   ranges.toGCP                                                                                            ?
                            CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, ranges.toGCP)))   :  
                            {}                                                                                                              ;
        Object.assign(D, d);

        const setLock = await SetLock(thisLockName, sheets, spreadsheetId)  ;
        console.log( setLock ?  '✔ get lock success'  :  '✘ get lock fail')  ;
        if (!setLock) {throw new Error('get lock fail')}

        if (D.timestamp > D.realTradeTime) {

            let toCheckFundFee  =  false  ;
            toCheckFundFee      =  D.lstFundTime===NA ? true : toCheckFundFee ;
            if (D.lstFundTime != NA) {
                const lstRound  = Math.floor( D.lstFundTime / 28800000 ) ; // 8 * 60 * 60 * 1000
                const thisRound = Math.floor( D.timestamp   / 28800000 ) ;
                toCheckFundFee  = lstRound === thisRound  ?  false  :  true  ;
            }
            if (toCheckFundFee) {
                let S = {} ;
                S.fund_orderID           =  'F-' + GetTimeStringWithOffset(8, 28800000*Math.floor(D.timestamp/28800000) )    ;
                S.fund_orderTimestamp    =  Date.now()                                                                       ;
                S.fund_orderDate         =  GetTimeStringWithOffset(8, S.fund_orderTimestamp)                                ;
                S.fund_confirmTimestamp  =  NA                                                                               ;
                S.fund_confirmDate       =  NA                                                                               ;
                S.fund_serial            =  NA                                                                               ;
                S.fund_buysell           =  order_FUND                                                                       ;
                S.fund_triggerPrice      =  NA                                                                               ;
                S.fund_orderType         =  NA                                                                               ;
                S.fund_orderPrice        =  NA                                                                               ;
                S.fund_confirmPrice      =  NA                                                                               ;
                S.fund_boughtPrice       =  NA                                                                               ;
                S.fund_qty               =  NA                                                                               ;
                S.fund_getProfit         =  NA                                                                               ;
                S.fund_avgBuyPrice       =  D.avgBuyPrice                                                                    ;
                S.fund_tradeFee          =  NA                                                                               ;
                S.fund_fundFee           =  NA                                                                               ;
                S.fund_allFund           =  NA                                                                               ;
                S.fund_allCoin           =  NA                                                                               ;
                S.fund_reason            =  "FundFee"                                                                        ;
                S.fund_orderStatus       =  order_pending                                                                    ;

                S  =  await CheckFundFee(S, D.isReal, D.TradingSymbol, sheets, spreadsheetId)  ;
                Object.assign(D, S)  ;

                D.allFundFee    =  NA0(D.allFundFee) + D.fund_fundFee  ;
                D.netProfit     =  NA0(D.netProfit)  + D.fund_fundFee  ;
                D.lstFundTime   =  D.fund_confirmTimestamp             ;
                ReNewAccount(D)  ;
                D.fund_allFund  =  D.allFund  ;
                D.fund_allCoin  =  D.allCoin  ;

                const newTradehistory = [ [ D.fund_orderID       || NA  ,
                                            D.fund_orderDate     || NA  ,
                                            D.fund_confirmDate   || NA  ,
                                            D.fund_serial        || NA  ,
                                            D.fund_buysell       || NA  ,
                                            D.fund_triggerPrice  || NA  ,
                                            D.fund_orderType     || NA  ,
                                            D.fund_orderPrice    || NA  ,
                                            D.fund_confirmPrice  || NA  ,
                                            D.fund_boughtPrice   || NA  ,
                                            D.fund_qty           || NA  ,
                                            D.fund_getProfit     || NA  ,
                                            D.fund_avgBuyPrice   || NA  ,
                                            D.fund_tradeFee      || NA  ,
                                            D.fund_fundFee       || NA  ,
                                            D.fund_allFund       || NA  ,
                                            D.fund_allCoin       || NA  ,
                                            D.fund_reason        || NA  ] ]  ;
                await sheets.spreadsheets.values.append({
                    spreadsheetId                                           ,
                    range               : "tradeHistory!A1:A"               ,
                    valueInputOption    : 'USER_ENTERED'                    , 
                    requestBody         : { values: newTradehistory }       }   )   ;


                D.thisAlertMessage  +=  "New fund fee: " + String(D.fund_fundFee) + "\n"   ;

                delete D.fund_orderID          ;
                delete D.fund_orderTimestamp   ;
                delete D.fund_orderDate        ;
                delete D.fund_confirmTimestamp ;
                delete D.fund_confirmDate      ;
                delete D.fund_serial           ;
                delete D.fund_buysell          ;
                delete D.fund_triggerPrice     ;
                delete D.fund_orderType        ;
                delete D.fund_orderPrice       ;
                delete D.fund_confirmPrice     ;
                delete D.fund_boughtPrice      ;
                delete D.fund_qty              ;
                delete D.fund_getProfit        ;
                delete D.fund_avgBuyPrice      ;
                delete D.fund_tradeFee         ;
                delete D.fund_fundFee          ;
                delete D.fund_allFund          ;
                delete D.fund_allCoin          ;
                delete D.fund_reason           ;
                delete D.fund_orderStatus      ;
            }

            ReNewAccount(D) ;

            let uncloseOrders       =  []  ;
            let uncloseOrdersSort   =  []  ;
            // orderID	confirmDate	serial	triggerPrice	confirmPrice	qty	P×Q	reason
            // 0        1           2       3               4               5   6   7
            if (D.therePosition) {
                uncloseOrders       =  await GetDataFromSheet(sheets, spreadsheetId, ranges.uncloseOrdersRange)             ;
                uncloseOrdersSort   =  uncloseOrders.toSorted( (order1, order2) => Number(order1[4]) - Number(order2[4]) )  ;
            }

            if (D.ifOrderWaiting) {

                let ifWaitingThenCancel = true  ;
                if (D.ing_buysell === order_BUY  && D.TradingSymbolPrice < D.ing_orderPrice*(1+D.waveUpChg)) {ifWaitingThenCancel = false ;}
                if (D.ing_buysell === order_SELL && D.TradingSymbolPrice > D.ing_orderPrice*(1+D.waveDnChg)) {ifWaitingThenCancel = false ;}
                const res_broker = await CheckOrderConfirm(D.ing_orderID, ifWaitingThenCancel, D.isReal, D.TradingSymbol, sheets, spreadsheetId) ;


                if (res_broker.ing_orderStatus  === order_confirm)  {
                    Object.assign(D, res_broker)  ;
                    
                    if (D.ing_buysell === order_BUY) {
                        uncloseOrders.push( [ 
                                            D.ing_orderID                   || NA  ,
                                            D.ing_confirmDate               || NA  ,
                                            D.ing_serial                    || NA  ,
                                            D.ing_triggerPrice              || NA  ,
                                            D.ing_confirmPrice              || NA  ,
                                            D.ing_qty                       || NA  ,
                                            D.ing_confirmPrice * D.ing_qty  || NA  ,
                                            D.ing_reason                    || NA  ] ) ;
                        uncloseOrdersSort   =  uncloseOrders.toSorted( (order1, order2) => Number(order1[4]) - Number(order2[4]) )  ;
                        
                        D.lstBuyPrice   =  D.ing_confirmPrice   ;
                        D.lstBuySerial  =  D.ing_serial         ;
                    } 
                    if (D.ing_buysell === order_SELL) {
                        uncloseOrders       =  uncloseOrders.filter(row => String(row[2]) !== String(Math.abs(D.ing_serial)) )      ;
                        uncloseOrdersSort   =  uncloseOrders.toSorted( (order1, order2) => Number(order1[4]) - Number(order2[4]) )  ;
                    }

                    D.netProfit             =   NA0(D.netProfit) + D.ing_getProfit + D.ing_tradeFee                                                             ;
                    D.avgBuyPrice           =   D.ing_buysell===order_BUY                                                                                   ? 
                                                (NA0(D.allPosition)*NA0(D.avgBuyPrice) + D.ing_qty*D.ing_confirmPrice) / (NA0(D.allPosition)+D.ing_qty)     :  
                                                D.gridNum > 0 ? D.avgBuyPrice : NA                                                                              ;

                    D.allTradeFee           =   NA0(D.allTradeFee) + D.ing_tradeFee                                                                             ;
                    D.gridNum               +=  D.ing_buysell===order_BUY  ?  1  : -1                                                                           ;
                    D.buyTimes              +=  D.ing_buysell===order_BUY  ?  1  : 0                                                                            ;
                    D.sellTimes             +=  D.ing_buysell===order_SELL ?  1  : 0                                                                            ;
                    D.allPosition           =   D.gridNum > 0  ?  NA0(D.allPosition) + D.ing_qty  :  NA                                                         ;

                    D.avgBuyPriceUnclose    =  D.gridNum > 0  ?  CalUncloseordersAvgprice(uncloseOrders)    :  NA  ;
                    D.lstBuyPriceUnclose    =  D.gridNum > 0  ?  uncloseOrders    [D.gridNum-1][4]          :  NA  ;
                    D.hghBuyPriceUnclose    =  D.gridNum > 0  ?  uncloseOrdersSort[D.gridNum-1][4]          :  NA  ; 
                    D.lowBuyPriceUnclose    =  D.gridNum > 0  ?  uncloseOrdersSort[0]          [4]          :  NA  ; 
                    D.lstBuySerialUnclose   =  D.gridNum > 0  ?  uncloseOrders    [D.gridNum-1][2]          :  NA  ;
                    D.hghBuySerialUnclose   =  D.gridNum > 0  ?  uncloseOrdersSort[D.gridNum-1][2]          :  NA  ;
                    D.lowBuySerialUnclose   =  D.gridNum > 0  ?  uncloseOrdersSort[0]          [2]          :  NA  ;

                    D.lstTradeTime          =  D.ing_confirmTimestamp   ;

                    ReNewAccount(D) ;
                    D.ing_avgBuyPrice   =  D.avgBuyPrice    ;
                    D.ing_allFund       =  D.allFund        ;
                    D.ing_allCoin       =  D.allCoin        ;
                    const newTradehistory = [ [ D.ing_orderID       || NA  ,
                                                D.ing_orderDate     || NA  ,
                                                D.ing_confirmDate   || NA  ,
                                                D.ing_serial        || NA  ,
                                                D.ing_buysell       || NA  ,
                                                D.ing_triggerPrice  || NA  ,
                                                D.ing_orderType     || NA  ,
                                                D.ing_orderPrice    || NA  ,
                                                D.ing_confirmPrice  || NA  ,
                                                D.ing_boughtPrice   || NA  ,
                                                D.ing_qty           || NA  ,
                                                D.ing_getProfit     || NA  ,
                                                D.ing_avgBuyPrice   || NA  ,
                                                D.ing_tradeFee      || NA  ,
                                                D.ing_fundFee       || NA  ,
                                                D.ing_allFund       || NA  ,
                                                D.ing_allCoin       || NA  ,
                                                D.ing_reason        || NA  ] ]  ;
                    await sheets.spreadsheets.values.append({
                        spreadsheetId                                           ,
                        range               : "tradeHistory!A1:A"               ,
                        valueInputOption    : 'USER_ENTERED'                    , 
                        requestBody         : { values: newTradehistory }       }   )   ;

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

                    D.thisAlertMessage  +=  D.ing_buysell===order_BUY           ?
                                            "Buy  Order confirmed" + "\n"       :
                                            "Sell Order confirmed" + "\n"                   ;
                    

                }

                if (res_broker.ing_orderStatus === order_cancel || res_broker.ing_orderStatus === order_confirm)  {
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
                    delete D.ing_fundFee            ;
                    delete D.ing_allFund            ; 
                    delete D.ing_allCoin            ; 
                    delete D.ing_reason             ; 
                    delete D.ing_orderStatus        ; 
                }

            }


            if (D.canBuy && D.touchTargetLow) {
                let nowTimestamp = Date.now()   ;
                let S = {} ;
                S.ing_orderID           =  'B-' + GetTimeStringWithOffset(8, D.timestamp)                                                                                       ;
                S.ing_orderTimestamp    =  nowTimestamp                                                                                                                         ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8, nowTimestamp)                                                                                             ;
                S.ing_confirmTimestamp  =  NA                                                                                                                                   ;
                S.ing_confirmDate       =  NA                                                                                                                                   ;
                S.ing_serial            =  NA0(D.lstBuySerial) + 1                                                                                                              ;
                S.ing_buysell           =  order_BUY                                                                                                                            ;
                S.ing_triggerPrice      =  D.TradingSymbolPrice                                                                                                                 ;
                S.ing_orderType         =  order_T_LMT                                                                                                                          ;
                S.ing_orderPrice        =  S.ing_triggerPrice                                                                                                                   ;
                S.ing_confirmPrice      =  NA                                                                                                                                   ;
                S.ing_boughtPrice       =  NA                                                                                                                                   ;
                S.ing_qty               =  D.minEnExPosition * Math.max(1, Math.floor(D.freeMargin*D.leverage/D.TradingSymbolPrice/D.minEnExPosition/(D.MaxGrid - D.gridNum)) ) ;
                S.ing_getProfit         =  NA                                                                                                                                   ;
                S.ing_avgBuyPrice       =  NA                                                                                                                                   ;
                S.ing_tradeFee          =  NA                                                                                                                                   ;
                S.ing_fundFee           =  NA                                                                                                                                   ;
                S.ing_allFund           =  NA                                                                                                                                   ;
                S.ing_allCoin           =  NA                                                                                                                                   ;
                S.ing_reason            =  BuyReason_belowTarget                                                                                                                ;
                S.ing_orderStatus       =  order_pending                                                                                                                        ;

                S = await SendOrderToBroker(S, D.isReal, D.TradingSymbol, sheets, spreadsheetId) ;

                Object.assign(D, S) ;
                D.ifOrderWaiting    =   S.ing_orderStatus === order_waiting  ;
                D.thisAlertMessage  +=  "New buy order, waiting confirmed" + "\n"  ;
            }

            D.toSell        =  false    ;
            let toSellOrder =  []       ;
            // orderID	confirmDate	serial	triggerPrice	confirmPrice	qty	P×Q	reason
            // 0        1           2       3               4               5   6   7
            if ( D.canSell && (D.TradingSymbolPrice > (1+D.waveUpChg) * D.lowBuyPriceUnclose)  &&  D.touchTargetHgh  ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.lowBuySerialUnclose)   ) ;
                toSellOrder[7] = 'touchTargetHgh'   ;
            }

            // mustSellProfitStep
            if ( D.canSell && (D.TradingSymbolPrice > Math.pow((1+D.waveUpChg), D.mustSellProfitStep) * Math.max( D.lowBuyPriceUnclose , D.avgBuyPriceUnclose) ) ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.lowBuySerialUnclose)   ) ;
                toSellOrder[7] = 'must sell Profit'  ;
            }

            //cut too high buy order
            if ( D.canSell && (D.hghBuyPriceUnclose/D.TradingSymbolPrice > D.roundHgh/D.roundLow)  ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.hghBuySerialUnclose) ) ;
                toSellOrder[7] = 'cut too hgh buy order'  ;
            }
            //cut due to stopC
            if ( D.canSell && (D.TradingSymbolPrice < D.stopPriceC)  ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.hghBuySerialUnclose) ) ;
                toSellOrder[7] = 'cut due to stopC'  ;
            }
            //cut due to stopF
            if ( D.canSell && (D.TradingSymbolPrice < D.stopPriceF)  ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.hghBuySerialUnclose) ) ;
                toSellOrder[7] = 'cut due to stopF'  ;
            }
            //cut due to liquidate
            if ( D.canSell && (D.TradingSymbolPrice < D.liquidatePrice)  ) {
                D.toSell    =  true  ;
                toSellOrder = uncloseOrders.find( v => String(v[2]) === String(D.hghBuySerialUnclose) ) ;
                toSellOrder[7] = 'cut due to liquidate'  ;
            }



            if (D.canSell &&  D.toSell ) {
                let nowTimestamp = Date.now()   ;
                let S = {} ;
                S.ing_orderID           =  toSellOrder[0].trim().replace('B', 'S')          ;
                S.ing_orderTimestamp    =  nowTimestamp                                     ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8)                       ;
                S.ing_confirmTimestamp  =  NA                                               ;
                S.ing_confirmDate       =  NA                                               ;
                S.ing_serial            =  -1 * Number(toSellOrder[2])                      ;
                S.ing_buysell           =  order_SELL                                       ;
                S.ing_triggerPrice      =  D.TradingSymbolPrice                             ;
                S.ing_orderType         =  order_T_LMT                                      ;
                S.ing_orderPrice        =  S.ing_triggerPrice                               ;
                S.ing_confirmPrice      =  NA                                               ;
                S.ing_boughtPrice       =  NumStrBool(toSellOrder[4])                       ;
                S.ing_qty               =  -1 * Number(toSellOrder[5])                      ;
                S.ing_getProfit         =  NA                                               ;
                S.ing_avgBuyPrice       =  NA                                               ;
                S.ing_tradeFee          =  NA                                               ;
                S.ing_fundFee           =  NA                                               ;
                S.ing_allFund           =  NA                                               ;
                S.ing_allCoin           =  NA                                               ;
                S.ing_reason            =  toSellOrder[7]                                   ;
                S.ing_orderStatus       =  order_pending                                    ;

                S = await SendOrderToBroker(S, D.isReal, D.TradingSymbol, sheets, spreadsheetId) ;

                Object.assign(D, S) ;
                D.ifOrderWaiting    =   S.ing_orderStatus === order_waiting ;
                D.thisAlertMessage  +=  "New sell order, waiting confirmed" + "\n"  ;
            }

            D.runningWell       =   true    ;

        } else {
            // 未到交易时刻的逻辑
            console.log("收到TradingView消息, 但未到交易时刻");
        }


        const writeToRange = D.sheetTitle + '!A:B';
        // 1. 先清空该区域的所有数据
        await sheets.spreadsheets.values.clear({
            spreadsheetId                   ,
            range           : writeToRange  ,
        });

        // 2. 写入新数据
        await sheets.spreadsheets.values.update({
            spreadsheetId                                       ,
            range               : writeToRange                  ,
            valueInputOption    : 'USER_ENTERED'                ,
            requestBody         : {values: Object.entries(D) }  }   )  ;

        let newDatasToRead      =  await GetDataFromSheet(sheets, spreadsheetId, ranges.toReadRange)  ;
        let timestampToRead     =  Number(newDatasToRead.at(-1)[0])     ;
        let attempts            =  0                                    ;
        let waitTime            =  1000                                 ;

        while (attempts < 60 && timestampToRead < D.timestamp) {
            await new Promise(res => setTimeout(res, waitTime));
            newDatasToRead      =   await GetDataFromSheet(sheets, spreadsheetId, ranges.toReadRange);
            timestampToRead     =   Number(newDatasToRead.at(-1)[0])    ;
            attempts            +=  1                                   ;
            waitTime            =   attempts * 1000                     ;
        }
        if (timestampToRead >= D.timestamp) {
            console.log('✔ TV数据写入表格成功');
            await SendSplitTGMessages(  process.env.TG_TOKEN                    , 
                                        process.env.TG_CHAT_ID                  , 
                                        "Get TV webhook Message"                , 
                                        FormatMatrixToString(newDatasToRead)    )  ;
        } else {
            console.log('✘ TV数据写入表格失败');
            await SendSplitTGMessages(  process.env.TG_TOKEN                    , 
                                        process.env.TG_CHAT_ID                  , 
                                        "Get TV webhook Message"                ,
                                        "But FAIL write to Google Sheets"       )  ;
            throw new Error("TV数据写入表格失败");
        }

        const releaseLock  =  await ReleaseLock(thisLockName, sheets, spreadsheetId)  ;
        console.log( releaseLock ?  '✔ release lock success'  :  '✘ release lock fail')  ;
        if (!releaseLock) { throw new Error('release lock fail') }

    } catch (err) {
        throw new Error(`TV消息处理失败: ${err.message}`);
    }

}


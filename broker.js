import {    CleanObjToNumBoolStr    ,
            GetGS        } from "./utility.js";

export async function SendOrderToBroker(S, isReal, TradingSymbol, sheets, spreadsheetId) {
    if (isReal && TradingSymbol.startsWith("BINANCE:")) {return await BINANCE_SendOrderToBroker(S, TradingSymbol) ;}

    await sheets.spreadsheets.values.clear( {
        spreadsheetId                       ,
        range           : 'simBroker!A30:B' } ) ;


    await sheets.spreadsheets.values.update(    { 
        spreadsheetId       : spreadsheetId                     ,
        range               : 'simBroker!A30:B'                 ,
        valueInputOption    : 'USER_ENTERED'                    ,
        requestBody         : {values: Object.entries(S)}       } )  ;
    
    const res_broker    =  Object.fromEntries(await GetGS(sheets, spreadsheetId, 'simBroker!A1:B29') )  ;
    const res           =  CleanObjToNumBoolStr(res_broker)  ;

    S.ing_orderID		    = res.orderID        ;
    S.ing_orderStatus		= res.orderStatus    ;

    return S ;
}
async function BINANCE_SendOrderToBroker(S, TradingSymbol) {
    return {} ;
}

export async function CheckOrderConfirm(ing_orderID, ifWaitingThenCancel, isReal, TradingSymbol, sheets, spreadsheetId) { 
    if (isReal && TradingSymbol.startsWith("BINANCE:")) {return await BINANCE_CheckOrderConfirm(ing_orderID, ifWaitingThenCancel) ;}
    const res   = CleanObjToNumBoolStr(Object.fromEntries(await GetGS(sheets, spreadsheetId, 'simBroker!A1:B29'))) ;
    if (res.orderStatus === "confirm")  {
        const S = CleanObjToNumBoolStr(Object.fromEntries(await GetGS(sheets, spreadsheetId, 'simBroker!A30:B' )))  ;
        S.ing_orderID		    = res.orderID                       ;
        S.ing_confirmTimestamp  = res.confirmTimestamp              ;
        S.ing_confirmDate		= res.confirmDate                   ;
        S.ing_confirmPrice		= res.confirmPrice                  ;
        S.ing_getProfit		    = res.getProfit                     ;
        S.ing_avgBuyPrice		= res.avgBuyPrice                   ;
        S.ing_tradeFee		    = res.tradeFee                      ;
        S.ing_allFund		    = res.allFund + S.ing_tradeFee      ;
        S.ing_allCoin		    = S.ing_allFund / res.BaseCoinPrice ;
        S.ing_orderStatus		= res.orderStatus                   ;
        S.ing_pXq               = S.ing_confirmPrice * S.ing_qty    ;

        await sheets.spreadsheets.values.clear( {
            spreadsheetId                       ,
            range           : 'simBroker!A30:B' } ) ;

        return S  ;
    } 

    if (ifWaitingThenCancel) {
        return {ing_orderStatus: "cancel"} ;
    }

    return {}  ;
}
async function BINANCE_CheckOrderConfirm(ing_orderID, ifWaitingThenCancel) {
    return {}  ;
}

export async function CheckFundFee(S, isReal, TradingSymbol, sheets, spreadsheetId) {
    if (isReal && TradingSymbol.startsWith("BINANCE:")) {return await BINANCE_CheckFundFee(TradingSymbol) ;}
    const res                =  CleanObjToNumBoolStr(Object.fromEntries(await GetGS(sheets, spreadsheetId, 'simBroker!A1:B29'))) ;
    S.fund_fundFee           =  typeof res.fundFee === 'number'  ?  res.fundFee  :  0   ;
    S.fund_confirmDate       =  S.fund_orderDate        ;
    S.fund_confirmTimestamp  =  S.fund_orderTimestamp   ;
    S.fund_allFund           =  res.allFund + S.fund_fundFee  ;
    S.fund_allCoin           =  S.fund_allFund / res.BaseCoinPrice  ;

   
    return S  ;
}
async function BINANCE_CheckFundFee(TradingSymbol) {
    return {}  ;
}
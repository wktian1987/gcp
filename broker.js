import {    CleanObjToNumStrBool    ,
            GetDataFromSheet        } from "./utility.js";

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
    
    const res_broker    =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29') )  ;
    const res           =  CleanObjToNumStrBool(res_broker)  ;

    S.ing_orderID		    = res.orderID        ;
    S.ing_confirmDate		= res.confirmDate    ;
    S.ing_confirmPrice		= res.confirmPrice   ;
    S.ing_getProfit		    = res.getProfit      ;
    S.ing_avgBuyPrice		= res.avgBuyPrice    ;
    S.ing_tradeFee		    = res.tradeFee       ;
    S.ing_allFund		    = res.allFund        ;
    S.ing_allCoin		    = res.allCoin        ;
    S.ing_orderStatus		= res.orderStatus    ;

    return S ;
}
async function BINANCE_SendOrderToBroker(S, TradingSymbol) {
    return {} ;
}

export async function CheckOrderConfirm(ing_orderID, ifWaitingThenCancel, isReal, TradingSymbol, sheets, spreadsheetId) { 
    if (isReal && TradingSymbol.startsWith("BINANCE:")) {return await BINANCE_CheckOrderConfirm(ing_orderID, ifWaitingThenCancel) ;}
    const res   = CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29'))) ;
    if (res.orderStatus === "confirm")  {
        const S = CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A30:B' )))  ;
        S.ing_orderID		    = res.orderID           ;
        S.ing_confirmTimestamp  = res.confirmTimestamp  ;
        S.ing_confirmDate		= res.confirmDate       ;
        S.ing_confirmPrice		= res.confirmPrice      ;
        S.ing_getProfit		    = res.getProfit         ;
        S.ing_avgBuyPrice		= res.avgBuyPrice       ;
        S.ing_tradeFee		    = res.tradeFee          ;
        S.ing_allFund		    = res.allFund           ;
        S.ing_allCoin		    = res.allCoin           ;
        S.ing_orderStatus		= res.orderStatus       ;
        S.lstBuyTime            = res.lstBuyTime        ;

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
    const res               =  CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29'))) ;
    S.ing_fundFee           =  res.fundFee         ;
    S.ing_confirmDate       =  res.confirmDate     ;
    S.ing_confirmTimestamp  =  res.lstFundTime     ;
    return S  ;
}
async function BINANCE_CheckFundFee(TradingSymbol) {
    return {}  ;
}
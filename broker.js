import { CleanObjToNumStrBool } from "./utility.js";

export async function SendOrderToBroker(S, sheets, spreadsheetId) {

    await sheets.spreadsheets.values.clear( {
        spreadsheetId                       ,
        range           : 'simBroker!A30:B' } ) ;


    await sheets.spreadsheets.values.update(    { 
        spreadsheetId       : spreadsheetId                     ,
        range               : 'simBroker!A30:B'                 ,
        valueInputOption    : 'USER_ENTERED'                    ,
        requestBody         : {values: Object.entries(S)}       } )  ;
    
    const res_broker    =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29') )  ;
    const res           = CleanObjToNumStrBool(res_broker) ;

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

export async function CheckOrderConfirm(ifWaitingThenCancel) {
    const res_broker    = Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29'));
    const res           = CleanObjToNumStrBool(res_broker) ;
    if (res.orderStatus = "confirm")  {
        const S = CleanObjToNumStrBool(Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A30:B')))  ;
        S.ing_orderID		    = res.orderID        ;
        S.ing_confirmDate		= res.confirmDate    ;
        S.ing_confirmPrice		= res.confirmPrice   ;
        S.ing_getProfit		    = res.getProfit      ;
        S.ing_avgBuyPrice		= res.avgBuyPrice    ;
        S.ing_tradeFee		    = res.tradeFee       ;
        S.ing_allFund		    = res.allFund        ;
        S.ing_allCoin		    = res.allCoin        ;
        S.ing_orderStatus		= res.orderStatus    ;
        return S  ;
    } 

    if (ifWaitingThenCancel) {
        return {ing_orderStatus: "cancel"} ;
    }

    return {}  ;
}
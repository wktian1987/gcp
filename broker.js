export async function SendOrderToBroker(S, sheets, spreadsheetId) {

    await sheets.spreadsheets.values.clear( {
        spreadsheetId                       ,
        range           : 'simBroker!A30:B' } ) ;


    await sheets.spreadsheets.values.update(    { 
        spreadsheetId       : spreadsheetId                     ,
        range               : 'simBroker!A30:B'                 ,
        valueInputOption    : 'USER_ENTERED'                    ,
        requestBody         : {values: Object.entries(S)}       } )  ;
    
    const res_broker =  Object.fromEntries(await GetDataFromSheet(sheets, spreadsheetId, 'simBroker!A1:B29') )  ;

    S.ing_orderID		    = res_broker.orderID        ;
    S.ing_confirmDate		= res_broker.confirmDate    ;
    S.ing_confirmPrice		= res_broker.confirmPrice   ;
    S.ing_getProfit		    = res_broker.getProfit      ;
    S.ing_avgBuyPrice		= res_broker.avgBuyPrice    ;
    S.ing_tradeFee		    = res_broker.tradeFee       ;
    S.ing_allFund		    = res_broker.allFund        ;
    S.ing_allCoin		    = res_broker.allCoin        ;
    S.ing_orderStatus		= res_broker.orderStatus    ;

    return S ;
}
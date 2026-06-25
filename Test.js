import { GetGS, GetSpreadsheetID, SendTG, Sleep } from "./utility.js"

export async function test(chat_id) {
    await SendTG('TEST信号处理开始', '这里是test()正在处理...', chat_id) ;

    await testFunctionFromGS0() ;

    await SendTG('TEST信号处理结束', 'TEST信号处理结束', chat_id) ;
}

async function testFunctionFromGS0() {
    const functionRegion    = 'test!A1' ;
    const spreadsheetID     = await GetSpreadsheetID('TradingBot_00') ;
    const functionString    = await GetGS(spreadsheetID, functionRegion) ;
    eval(functionString) ;
    await functionA1() ;
}

async function functionA1() {
    await SendTG('ceshiaA1', '这里是A1正在处理...', chat_id) ;

}
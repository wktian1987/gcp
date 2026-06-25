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
    try { await functionA1() } catch (e) {
        throw new Error('A1函数执行失败: ' + e.message)
    }
}

async function functionA1() {
    await SendTG('成功测试来自A1的函数', 'A1函数执行成功...', chat_id) ;

}
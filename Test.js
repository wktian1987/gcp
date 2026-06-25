import { GetGS, GetSpreadsheetID, SendTG, Sleep, UpdateGS } from "./utility.js"

export async function test(chat_id) {
    await SendTG('TEST信号处理开始', '这里是test()正在处理...', chat_id) ;

    await testFunctionFromGS0(chat_id) ;

    await SendTG('TEST信号处理结束', 'TEST信号处理结束', chat_id) ;
}

async function testFunctionFromGS0(chat_id) {
    const functionRegion    = 'test!A1' ;
    const spreadsheetID     = await GetSpreadsheetID('TradingBot_00') ;
    const functionString    = await GetGS(spreadsheetID, functionRegion) ;
    eval(functionString) ;
    try { await functionA1(chat_id) } catch (e) {
        throw new Error('A1函数执行失败: ' + e.message)
    }
}

// 在下面函数中写入测试逻辑, 并将函数复制到A1单元格中, 然后去TG执行test指令
// 这样就可以在不重启cloudrun的情况下, 快速测试或者部署新的函数了
async function functionA1(chat_id) {
    
    // 测试大范围内下范围的内容修改
    const bigRegion = 'test!B3:F22';
    const newContent = [
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] 
    ] ;

    const spreadsheetID     = await GetSpreadsheetID('TradingBot_00') ;
    await UpdateGS(spreadsheetID, bigRegion, newContent) ;



    SendTG('成功测试来自A1的函数', 'A1函数执行成功...', chat_id).catch(() => { });
}
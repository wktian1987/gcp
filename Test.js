import { GetGS, GetSpreadsheetID, SendTG, Sleep, UpdateGS, ClearGS } from "./utility.js"

export async function testA1FromGS00(chat_id) {
    await SendTG('TEST信号处理开始', '开始加载00文件中的A1函数...', chat_id) ;

    const functionRegion    = 'test!A1' ;
    const spreadsheetID     = await GetSpreadsheetID('TradingBot_00') ;
    const functionString    = (await GetGS(spreadsheetID, functionRegion))[0][0] ;
    await SendTG('A1函数为: ', functionString, chat_id) ;
    eval(functionString) ;

    await SendTG('A1函数加载成功', '开始执行A1函数...', chat_id);

    try { 
        await functionA1(spreadsheetID, chat_id);
        await SendTG('A1执行成功', 'A1函数执行成功...', chat_id);

    } catch (e) {
        await SendTG('A1执行失败', 'A1函数执行失败: ' + e.message, chat_id);
    }
    await SendTG('TEST信号处理结束', 'TEST信号处理结束', chat_id) ;
}

// 在下面函数中写入测试逻辑, 并将函数复制到A1单元格中, 然后去TG执行test指令
// 这样就可以在不重启cloudrun的情况下, 快速测试或者部署新的函数了
async function functionA1(spreadsheetID, chat_id) {
    
    // 测试大范围内下范围的内容修改
    const bigRegion = 'test!B3:F22';
    const newContent = [
        [2, 2, 2] ,
        [2, 2, 3] ,
        [2, 2, 4] ,
        [2, 2, 5] ,
        [2, 2, 6] ,
        [2, 2, 2] ,
        [2, 2, 2] ,
        [2, 2, 2] 
    ] ;

    await ClearGS(spreadsheetID, bigRegion) ;
    await UpdateGS(spreadsheetID, bigRegion, newContent) ;



    SendTG('成功测试来自A1的函数', 'A1函数执行成功...', chat_id).catch(() => { });
}
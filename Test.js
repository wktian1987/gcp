import { GetGS, GetSpreadsheetID, SendTG, Sleep, UpdateGS, ClearGS } from "./utility.js"

export async function testA1FromGS00(chat_id) {
    await SendTG('TEST信号处理开始', '开始加载00文件中的A1函数...', chat_id) ;

    const functionRegion    = 'test!A1' ;

    try { 
        const spreadsheetID = await GetSpreadsheetID('TradingBot_00');
        const rawFunctionString = (await GetGS(spreadsheetID, functionRegion))[0][0];
        let cleanFunctionString = rawFunctionString.replace(/\\n/g, '\n').trim();

        await SendTG('A1函数为: ', rawFunctionString, chat_id);

        let targetFunction;

        // 👑 降维打击正则：兼容带或不带 async，兼容有或没有函数名
        // 匹配规则：捕捉开头的 (async 加上可选空格) + function + (可选的函数名)
        const superRegex = /^(async\s+)?function(\s+\w+)?/;

        if (superRegex.test(cleanFunctionString)) {
            // 核心卡扣：强行把函数名蒸发掉，只留下 function(...) 或 async function(...)
            const expression = cleanFunctionString.replace(superRegex, (match, p1) => {
                const hasAsync = p1 ? 'async ' : '';
                return `${hasAsync}function`;
            });

            // 稳稳当当转换为可执行对象
            targetFunction = eval(`(${expression})`);
        } else {
            // 兜底：如果你在表格里丧心病狂地写了现代箭头函数 (spreadsheetID, chat_id) => { ... }
            targetFunction = eval(`(${cleanFunctionString})`);
        }



        await SendTG('A1函数加载成功', '开始执行A1函数...', chat_id);

        await targetFunction(spreadsheetID, chat_id);

        await SendTG('A1执行成功', 'A1函数执行成功...', chat_id);

    } catch (e) {
        await SendTG('A1执行失败', 'A1函数执行失败: ' + e.message, chat_id);
    }

    await SendTG('TEST信号处理结束', 'TEST信号处理结束', chat_id) ;
}

// 在下面函数中写入测试逻辑, 并将函数复制到A1单元格中, 然后去TG执行test指令

// 经测试只会更新直接有更新数据的区域的内容, 如果这个区域没有新的数据输入, 仍然保留旧数据
async function test_updateSmallRegionDataToBigRegion(spreadsheetID, chat_id) {
    
    // 测试大范围内下范围的内容修改
    const bigRegion = 'test!B3:F22';
    const newContent = [
        [2, 2, 2, 9] ,
        [2, 2, 3, 9] ,
        [2, 2, 4, 9] ,
        [2, 2, 5, 9] ,
        [2, 2, 6, 9] ,
        [2, 2, 2, 9] ,
        [2, 2, 2, 9] ,
        [2, 2, 2, 9] 
    ] ;

    await UpdateGS(spreadsheetID, bigRegion, newContent) ;

    SendTG('成功测试来自A1的函数', 'A1函数执行成功...', chat_id).catch(() => { });
}

// 经测试目标区域必须比实际输入的内容所占区域大，至少相同, 否则会报错, 
// 报错信息:
// A1函数执行失败: Requested writing within range [test!B3:C], but tried writing to column [D]
async function test_updateBigRegionDataToSmallRegion(spreadsheetID, chat_id) {
    
    // 测试大范围内下范围的内容修改
    const smallRegion = 'test!B3:C';
    const newContent = [
        [2, 2, 2, 9] ,
        [2, 2, 3, 9] ,
        [2, 2, 4, 9] ,
        [2, 2, 5, 9] ,
        [2, 2, 6, 9] ,
        [2, 2, 2, 9] ,
        [2, 2, 2, 9] ,
        [2, 2, 2, 9] 
    ] ;

    await UpdateGS(spreadsheetID, smallRegion, newContent) ;

    SendTG('成功测试来自A1的函数', 'A1函数执行成功...', chat_id).catch(() => { });
}
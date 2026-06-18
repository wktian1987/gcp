import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] } ) ;
const sheets = google.sheets({ version: 'v4', auth });

export function isStrictNumber  (val) { return typeof val === 'number' && Number.isFinite(val)          }
export function isStrictBoolean (val) { return typeof val === "boolean"                                 }
export function isStrictTrue    (val) { return isStrictBoolean(val) && val                              }
export function isStrictFalse   (val) { return isStrictBoolean(val) && !val                             }
export function isStrictString  (val) { return typeof val === "string" && val.trim() !== ""             }
export function isStrictSet     (val) { return Object.prototype.toString.call(val) === '[object Set]'   }

/**
 * 只有number boolean string 类型会返回true
 */
export function isStrictNumBoolStr(val) {
    if (isStrictTrue(isStrictNumber (val))) {return true}
    if (isStrictTrue(isStrictBoolean(val))) {return true}
    if (isStrictTrue(isStrictString (val))) {return true}
    return false ;
}

export function isPlainObject(obj) {
    if (typeof obj !== 'object' || obj === null) {return false}
    const proto = Object.getPrototypeOf(obj);
    return proto === null || proto === Object.prototype;
} // 对于继承自其他对象的对象, 这个会返回true吗 ? // 答案: 会返回false
// 所以大部分情况，键值对对象, 用下面的函数判断
/**
 * 判断一个对象是否是标准的键值对对象 
 * @param {object} obj 
 */
export function isObjectOfKeyValue(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {return false}
    return true ;
}

/**
 * 👑 工业级高阶万能字符串确权器（完全体）
 * 100% 免疫任何反人类崩溃，绝不吐出 [object Object]，保留对象与数组的真实业务肉身
 */
export function ToStrictString(val, notAvailableValueTo) {
    const notAvailableValue = isStrictString(notAvailableValueTo) ? notAvailableValueTo.trim() : 'notAvailableValue';

    // 🛡️ 1. 前置安全确权：null 和 undefined 直接原位安全串化，免去后续探测开销
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';

    try {
        // 🌟 核心增益：如果是一个对象（不管是普通对象还是数组矩阵）
        // 绝对不要用无情的 String()，而是用 JSON.stringify 完美锁死、保留它的数据资产！
        if (typeof val === 'object') {
            return JSON.stringify(val);
        }

        // 🚀 剩下的原生基础类型 (number, string, boolean, 还有合法的 Symbol)
        // 直接由最安全的显式 String() 畅通无阻地转化输出
        return String(val);
        
    } catch {
        // 🛡️ 终极防空壕：一旦遭遇循环引用、爆栈死循环、或者 Object.create(null) 孤儿对象抛错
        // 绝不砸盘，由你亲手指定的保底占位符完成最后的荣誉兜底
        return notAvailableValue;
    }
}

/**
 * 将新的信息行添加到旧信息后面 ; 
 * 注意：本函数不会对重复信息进行处理, 也就是说如果传入重复的信息, 新的信息永远会加在旧信息后面, 这回导致重复 ; 
 * 如果需要保证新添加的信息不会与就信息重复, 请使用Set的功能
 * @param {string} theOld 如果输入的数据不是string类型, 则原数据将被无情抛弃
 * @param {string} theNew 
 * @param {string} [notAvailableValueTo='notAvailableValue'] 如果输入的theNew不是纯字符串的话, 用此值
 * @returns 
 */
export function AddMessage (theOld, theNew, notAvailableValueTo = 'notAvailableValue') {
    const notAvailableValue = isStrictString(notAvailableValueTo) ? notAvailableValueTo : 'notAvailableValue' ;
    const   newMessage  =   isStrictString(theNew)  ?  theNew.trim()  :  ToStrictString(theNew, notAvailableValue )  ;
    return isStrictString(theOld) ? theOld.trim() + "\n" + newMessage : newMessage ;
}

/**
 * 直接在原Set上修改 ; 
 * 添加新的Set信息行; 
 * 如果发现新进来的警报在历史缓存里有重名的, 先无情抹杀掉旧的占位; 
 * 刷新到整个集合的最底部（最新时间线）; 
 * 如果确认输入的两个参数值都是正确的格式(Set, String)的话, 可以不验证使用
 * @param {Set} messageSet 
 * @param {string} newMessageLine 
 * @returns string: 表示错误信息
 */
export function AddSetMessage(messageSet, newMessageLine) {
    if (!isStrictSet(messageSet)) { return 'AddAlertMessage Error: oldMessageSet is not strictSet' }
    if (!isStrictString(newMessageLine)) { return 'AddAlertMessage Error: newMessage is not strictString' }
    const cleanMsg = newMessageLine.trim();
    // 核心防线：如果发现新进来的警报在历史缓存里有重名的, 先无情抹杀掉旧的占位！
    if (messageSet.has(cleanMsg)) { messageSet.delete(cleanMsg) }
    // 重新 add。因为 Set 严格按插入顺序排列，这一步会强行把这条重复的最新警报，刷新到整个集合的最底部（最新时间线）！
    messageSet.add(cleanMsg);
}

export function StrFromSetMessage(messageSet) {return [...messageSet].join('\n').trim() }

/**
 * 将字符串形式的数字转换为纯数字
 * 不会处理带有%的数字
 * 3,4.5这种不符合千分位,逗号规则的字符串会判定为false
 * 本函数 需配合 isStrictNumber() 使用
 * 如果对于不能转换为数字的值转换为一个默认值，可以添加第二个参数 NA0
 * @param {string} val 
 * @param {number} NA0 , 如果输入的值不是数字类型的话，则遇到不能转换为数字的形式，转换为false
 * @returns  false or strictNumber or NA0
 */
export function ToStrictNumber(val, NA0) {
    const NA0Val =  isStrictNumber(NA0)  ?  NA0  :  false  ;

    if ( isStrictNumber(val) ) {return val  }
    if (!isStrictString(val) ) {return NA0Val}
    const cleanVal = val.trim() ;
    // 处理数字 (支持标准金融千分位，如 "65,000.50"，但铁面拦截像 "3,4.5" 的位置错误刺客)
    // 正则含义：检查字符串里是否包含逗号，如果包含了，就必须符合标准的金融千分位规则
    if (cleanVal.includes(',')) {
        // 这个正则的意思是：逗号后面必须紧跟 3 位数字，直到碰到小数点、另一个逗号或字符串结尾
        // 如果不符合这个规整的财务格式，直接判定为脏文本，跳过不当数字处理！
        if (!/^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$/.test(cleanVal)) {
            // 没通过标准的千分位指纹检测，说明是像 "3,4.5" 或 "123,45" 这样的手误，拒绝当成数字！
            return NA0Val ;
        }
    }
    // 只有通过了上面的千分位指纹检测（或者原本就没有逗号），才允许拔掉逗号
    const valNumber = Number(cleanVal.replaceAll(',', ''));
    if (isStrictNumber(valNumber)) { return valNumber; }
    return NA0Val  ;
}

export function ToStrictNumBoolStr(val, notAvailableValueTo) {
    const notAvailableValue = isStrictString(notAvailableValueTo)  ?  notAvailableValueTo.trim()  :  "notAvailableValue"  ;
    // Number("") 和 Number(null) 会变成 0
    // 如果不希望空值变0，可以加判断：
    if (val === "" || val === null || val === undefined) return notAvailableValue;

    if (isStrictNumber (val) ) {return val}
    if (isStrictBoolean(val) ) {return val}

    if (isStrictString (val) ) {
        const cleanVal = val.trim()  ;

        // 处理布尔类字符串判断 (忽略大小写)
        const lowerVal  =  cleanVal.toLowerCase()  ;
        if (lowerVal === "true" ) { return true     }
        if (lowerVal === "false") { return false    }

        // 处理百分数
        if (cleanVal.endsWith('%') && !cleanVal.startsWith('%')) {
            const val100 = ToStrictNumber(cleanVal.replace('%', ''))  ;
            if (isStrictNumber(val100)) { return val100 / 100 } // 返回 0.05, 也可能返回零
        }

        // 处理数字，包括符合千分位规则的含逗号数字
        const valNumber = ToStrictNumber(cleanVal)  ;
        if (isStrictNumber(valNumber)) {return valNumber}

        return  cleanVal  ;
    }
    
    return  notAvailableValue  ;
}

/**
 * 将一个二维数组转换为标准的obj
 * @param {Array<Array>} a2d 需要转换的二维数组: [['key1', 'val1'], ['key2', 'val2']] 形式
 * @param {String} notAvailableValueTo , 将不合法的数据全部转换为此
 * @returns obj
 */
export function A2dToCleanObj(a2d, notAvailableValueTo) {
    const notAvailableValue = isStrictString(notAvailableValueTo) ? notAvailableValueTo.trim() : "notAvailableValue" ;
    if (!Array.isArray(a2d) || a2d.length === 0) {return false}
    const clean_a2d = a2d.map(val => {
        let newA2d = [] ;
        if (!Array.isArray(val)) {newA2d = [notAvailableValue, notAvailableValue]}
        if (Array.isArray(val) && val.length===0) {newA2d = [notAvailableValue, notAvailableValue]}
        if (Array.isArray(val) && val.length===1) {newA2d = [ToStrictString(val[0], notAvailableValue), notAvailableValue]}
        if (Array.isArray(val) && val.length  >1) {newA2d = [ToStrictString(val[0], notAvailableValue), ToStrictNumBoolStr(val[1], notAvailableValue)]}
        return newA2d ;
    })

    return Object.fromEntries(clean_a2d) ;
}

/**
 * 将两行数组, 转换为Obj
 */
export function A2LinesToCleanObj(a2lines, notAvailableValueTo) {
    const notAvailableValue = isStrictString(notAvailableValueTo) ? notAvailableValueTo.trim() : "notAvailableValue" ;
    if( !Array.isArray(a2lines)                 ||
        a2lines.length !== 2                    ||
        !Array.isArray(a2lines[0])              ||
        !Array.isArray(a2lines[1])              ||
        a2lines[0].length !== a2lines[1].length     ) {
        return false ;
    }
    const [keys, values] = [a2lines[0], a2lines[1]] ;

    const entries = keys.map((key, i) => { return [key, values[i]] });

    return A2dToCleanObj(entries, notAvailableValue);
}

/**
 * 标准对象转二维数组矩阵
 * 并将字符串形式的FALSE, '12'等转换为false, 12
 */
export function ObjToA2dNumBoolStr(obj) {
    // 1. 前置安全门禁
    if (!isObjectOfKeyValue(obj)) { return false; }

    // 2. 动用高效的 Object.keys 管道，一枪流出水
    return Object.keys(obj)
        .filter(key => isStrictNumBoolStr(obj[key])) // 第一步：在海选阶段，就把 Function/Set 等脏垃圾物理蒸发掉
        .map(key => {
            // 第二步：此时留下的全是绝对合规的核心资产
            // 对 key 进行严格串化（确保安全），而对 value，我们要保留它纯正的物理原色！
            const cleanKey = ToStrictString(key, "INVALID_KEY");
            const cleanValue = ToStrictNumBoolStr(obj[key]);

            return [cleanKey, cleanValue];
        });
}

/**
 * 清洗对象 o 中的所有属性, 返回新的对象，不是直接在原对象上修改 ; 
 * 对于对象中的 function, set, array 等修改为 notAvailableValueTo， 
 * 仅保留 number, bool, string . 
 * @param {object} o  需要转换的对象 , 需要是一个标准对象{A:1, B:'b'} 这样的形式
 * @param {String} notAvailableValueTo 对于不可转换的元素转换为此 
 * @returns 如果返回值是false表示输入的值不是标准的object ; 
 * @returns 如果确认输入值为标准对象，可以不判断返回值，直接使用返回的cleanO
 */
export function CleanObjToNumBoolStr(o, notAvailableValueTo) {
    const notAvailableValue = isStrictString(notAvailableValueTo) ? notAvailableValueTo.trim() : 'notAvailableValue' ;
    if (!isObjectOfKeyValue(o)) {return false}
    const cleanO = {} ;
    Object.keys(o).forEach(key => {
        cleanO[key] = ToStrictNumBoolStr(o[key], notAvailableValueTo);
    });
    return cleanO; 
}

/**
 * 清洗数组 a 中的所有属性 ; 
 * 对于对象中的 function, set, array 等转换为 'NA', 保留这个位置的目的是避免有效数据在Array中的index发生变化 ; 
 * 仅保留 number, bool, string . 
 * @param {Array} a  需要转换的对象 
 * @param {String} notAvailableValueTo 对于不可用数据需要替换的内容
 * @returns 如果返回值是false表示输入的值不是标准的Array
 */
export function CleanArrayToNumStrBool(a, notAvailableValueTo) {
    if (!Array.isArray(a)) {return false}
    return a.map(val => ToStrictNumBoolStr(val, notAvailableValueTo));
}

/**
 * 将二维数组转换为对齐的表格字符串
 * @param {Array<Array>} matrix - 输入的二维数组
 * @param {number} padding - 列之间的额外空格距离
 */
export function FormatMatrixToString(matrix, padding = 4) {
    if (!matrix || matrix.length === 0) return "";

    // 1. 计算每一列的最大宽度
    const colWidths = matrix[0].map((_, colIndex) => {
        return Math.max(...matrix.map(row => String(row[colIndex] || "").length));
    });

    // 2. 将每一行转换为对齐的字符串
    return matrix.map(row => {
        return row.map((cell, colIndex) => {
            const str = String(cell || "");
            // 使用 padEnd 在字符串后面填充空格以对齐
            return str.padEnd(colWidths[colIndex] + padding, ' ');
        }).join('').trimEnd(); // 去掉行尾多余空格
    }).join('\n');
}

/**
 * 将二维数组转换为 HTML 表格字符串
 * @param {Array[]} rows 从 Google Sheets 读取的原始数据
 * @returns {string} HTML 字符串
 */
export function ConvertRowsToHtmlTable(rows) {
    if (!rows || rows.length === 0) return '<p>无数据</p>';

    let html = '<table style="border-collapse: collapse; border: 1px solid; text-align: left; white-space: pre; font-family: monospace; font-size: 1em">';

    // 处理表头 (第一行)
    html += '<thead><tr>';
    rows[0].forEach(header => {
        html += `<th style="border-collapse: collapse; border: 1px solid; text-align: left; white-space: pre; font-family: monospace; font-size: 1.1em; padding: 0 0.5em">${header}</th>`;
    });
    html += '</tr></thead>';

    // 处理数据行
    html += '<tbody>';
    for (let i = 1; i < rows.length; i++) {
        html += '<tr>';
        rows[i].forEach(cell => {
            html += `<td style="border-collapse: collapse; border: 1px solid; text-align: left; white-space: pre; font-family: monospace; font-size: 1em; padding: 0 0.5em">${cell || ''}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    html = String(html).replaceAll("\n", "<br/>")  ;

    return html;
}

/**
 * 从 "0" 号核心配置表中精准提取指定键的原生高精度类型值
 * @async
 * @param {string} keyName - 期望读取的配置项键名（例如："IS_BOT_OPEN", "MAX_SLIPPAGE"）
 * @returns {Promise<string|number|boolean>} 返回底层未经格式化的原生 JS 类型数据（字符串、数字或布尔值）
 * @throws {Error} 当 keyName 类型非法、process.env.SHEET_ID 缺失或表格中找不到该配置项时抛出致命异常
 */
export async function GetKeyValueFrom0(keyName) {
    if (!isStrictString(keyName)) {throw new Error('GetKeyValueFrom0 参数错误: keyName 只能是字符串')}
    const TradingBot_00_ID  =   process.env.SHEET_ID  ;
    if (!TradingBot_00_ID) {throw new Error('GetKeyValueFrom0 参数错误: keyName 或 process.env.SHEET_ID 环境变量不能为空') }
    const keyvalues =  CleanObjToNumBoolStr ( Object.fromEntries( await GetGS(TradingBot_00_ID, "0!A:B") ) )  ;
    if (keyvalues[keyName] !== undefined) { return String(keyvalues[keyName]) } 
    throw new Error(`not find value for ${keyName}`) ;
}

export async function GetSpreadsheetID(botNumber) {return await GetKeyValueFrom0(botNumber) } 

/**
 * 精准检测特定工作表(Tab)是否存在，支持不存在时自动原子创建
 * @async
 * @function CheckIfSheetExists
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {string} sheetTitle - 期望检查或创建的工作表名称（如："MAIN", "LOG_2026"）
 * @param {boolean} [ifNoThenNew=false] - 可选：若为 true 且表格不存在时，自动触发原子创建操作
 * @returns {Promise<boolean>} 返回最终是否存在（或是否成功创建）的布尔标志
 * @throws {Error} 当入参非法或网络请求失败时向外层抛出原始异常
 */
export async function CheckIfSheetExists(spreadsheetID, sheetTitle, ifNoThenNew = false) {
    // 🛡️ 哨兵防线：基础输入严格拦截
    if (!spreadsheetID || !isStrictString(sheetTitle)) {
        throw new Error('CheckIfSheetExists 参数错误: spreadsheetID 不能为空且 sheetTitle 必须是严格字符串');
    }

    // 1. 极致网络优化：只捞取所有子表的 title 属性，斩断冗余数据流
    const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetID,
        fields: 'sheets.properties.title'
    });

    const sheetList = response.data.sheets || [];

    // 2. 检查是否存在完全匹配的 title
    let exists = sheetList.some(sheet => sheet?.properties?.title === sheetTitle);

    // 3. 临门一脚：触发自动原子创建
    if (!exists && ifNoThenNew) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetID,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: { title: sheetTitle }
                    }
                }]
            }
        });
        exists = true; // 创建成功后，状态强行修正为存在
    }

    return exists;
}

/**
 * 精准扫描指定工作表，计算并返回含有任何有效数据（数字、字符串、布尔值等）的最小闭环 A1 范围边界
 * @async
 * @function GetActiveDataRange
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {string} sheetTitle - 工作表名称
 * @returns {Promise<string|null>} 返回 A1 表示法的全域范围字符串（例如 "MAIN!A1:E25"），若全表完全为空则返回 null
 * @throws {Error} 当参数非法或网络底座请求崩溃时抛出原始异常
 */
export async function GetActiveDataRange(spreadsheetID, sheetTitle) {
    // 🛡️ 哨兵防线：严格基础入参校验
    if (!spreadsheetID || !isStrictString(sheetTitle)) {
        throw new Error('GetActiveDataRange 参数错误: spreadsheetID 不能为空且 sheetTitle 必须是严格字符串');
    }

    // 1. 临门一脚：调用高精度 GetGS 底座，拿回原生全要素二维数组
    const rows = await GetGS(spreadsheetID, sheetTitle);

    if (rows.length === 0) {
        return null;
    }

    let maxRowIndex = -1;
    let maxColIndex = -1;

    // 2. 深度遍历矩阵，捕捉任意非空数据的最大边缘
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) { continue; } // 行节点防空防御

        for (let c = 0; c < row.length; c++) {
            const cellValue = row[c];
            
            // 🛡️ 核心判定升级：全要素拦截
            // 只要格子被赋值了，且把它强转字符串并去掉两端空格后不是空字符串 ""
            // 那么不管是 true, false, "BTC", 0 还是 -1.5，全部视作有效数据占位！
            if (
                cellValue !== undefined && 
                cellValue !== null && 
                String(cellValue).trim() !== ""
            ) {
                maxRowIndex = Math.max(maxRowIndex, r);
                maxColIndex = Math.max(maxColIndex, c);
            }
        }
    }

    // 如果把整张表翻个底朝天，全是空气，优雅熔断
    if (maxRowIndex === -1) {
        return null;
    }

    // 3. 将列下标无损转为 A1 字母符号的纯函数
    const colIndexToLetter = (col) => {
        let letter = '';
        let tempCol = col;
        while (tempCol >= 0) {
            letter = String.fromCharCode(65 + (tempCol % 26)) + letter;
            tempCol = Math.floor(tempCol / 26) - 1;
        }
        return letter;
    };

    // 4. 组装具备绝对确定性的全要素 A1 边界航道
    const startCell = 'A1';
    const endCell = `${colIndexToLetter(maxColIndex)}${maxRowIndex + 1}`;

    return `${sheetTitle}!${startCell}:${endCell}`;
}

/**
 * 从固定区域读取数据 ; 
 * 如果只有 "A!A1:B5" 这个区域内有数据的话，用"A!A:B" 会比"A!A1:B5" 效率不会差很多，可以不考虑
 * @param {string} spreadsheetID 
 * @param {string} fullRange
 * @param {string} [read_calculate='calculate'] 默认值是calculate, 除了'read'其他值包括不输入值都是默认值, 表示从GS中取到的数据都是原始值
 * @returns  返回一个二维数组 ; 
 */
export async function GetGS(spreadsheetID, fullRange, read_calculate = 'calculate') {
    if (!spreadsheetID || !fullRange) {throw new Error('GetDataFromSheet 参数错误: spreadsheetID 或 fullRange 不能为空')}
    const valueRenderOption = read_calculate === 'read' ? 'FORMATTED_VALUE' : 'UNFORMATTED_VALUE' ;
    const response = await sheets.spreadsheets.values.get(  {
        spreadsheetId           : spreadsheetID         ,
        range                   : fullRange             ,
        valueRenderOption       : valueRenderOption     , // 脱掉格式外衣，直接拿最底层的 Number, Boolean 和纯 String（保护精度）
        dateTimeRenderOption    : 'FORMATTED_STRING'    }   )   ;  // 日期保持字符串形式（防止时间戳沦为奇怪的浮点数）

    const rows = response.data.values;
    // 安全兜底：如果表格完全为空，rows 为 undefined，此时转为空数组 [] 返回
    // 这样外层可以直接安全地执行 forEach、map 或读取 .length，绝不崩溃
    return rows || [];
}

/**
 * 擦除指定区域的数据（单项原子清空）
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {string} fullRange - 想要清空的单区域，例如 'MAIN!A2:D'
 */
export async function ClearGS(spreadsheetID, fullRange) {
    // 哨兵防线：前置白名单拦截
    if (!spreadsheetID || !fullRange) {
        throw new Error('ClearGS 参数错误: spreadsheetID 或 fullRange 不能为空');
    }

    // 临门一脚，直接调用原生的 clear 接口，干净利落
    await sheets.spreadsheets.values.clear({
        spreadsheetId   : spreadsheetID ,
        range           : fullRange     
    });
}

/**
 * 往指定区域写入数据（单项原子覆盖/写入）
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {string} fullRange - 想要写入的单区域，例如 'MAIN!A23:23' 或 'MAIN!A11:D'
 * @param {Array<Array>} values - 期望写入的二维数组数据
 */
export async function UpdateGS(spreadsheetID, fullRange, values) {
    // 短路验证（基础非空 ➔ 数组判定 ➔ 空数组探测 ➔ 二维深度抽查）
    if (!isStrictString(spreadsheetID) || !isStrictString(fullRange) || !Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
        throw new Error('UpdateGS 参数错误: 输入结构非法或 values 不是合法的非空二维数组');
    }

    await sheets.spreadsheets.values.update({
        spreadsheetId   : spreadsheetID ,
        range           : fullRange     ,
        valueInputOption: 'USER_ENTERED', // 锁死用户输入模式，保护数字与布尔的原生高精度
        resource        : { values }    }  ) ;
}

/**
 * 往指定区域最下行追加数据
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {string} fullRange - 想要写入的单区域, 如tradeHistory!$A$24:Z
 * @param {Array<Array>} values - 期望写入的二维数组数据
 */
export async function AppendGS(spreadsheetID, fullRange, values) {
    // 短路验证（基础非空 ➔ 数组判定 ➔ 空数组探测 ➔ 二维深度抽查）
    if (!isStrictString(spreadsheetID) || !isStrictString(fullRange) || !Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
        throw new Error('UpdateGS 参数错误: 输入结构非法或 values 不是合法的非空二维数组');
    }
    await sheets.spreadsheets.values.append(  {
        spreadsheetId       : spreadsheetID         ,
        range               : fullRange             ,
        valueInputOption    : 'USER_ENTERED'        , // 保持高精度感化
        insertDataOption    : 'INSERT_ROWS'         , // 核心硬核参数：物理空间不够时，谷歌后台自动插行，绝不报错！
        resource            : {values: values }     } ) ;
}

/**
 * 批量读取多个区域内容（多区域打包，类型对齐，精度不失）
 * @async
 * @param {string} spreadsheetID - 电子表格 ID
 * @param {Array<string>} rangesList - 想要读取的区域数组，例如 ['MAIN!A:B', 'LOG!C:D']
 * @returns {Array<Array<Array>>} 返回一个三维数组，顺序对应 rangesList 中每个区域的二维数据
 */
export async function BatchGetGS(spreadsheetID, rangesList) {
    // 哨兵防线 1：鉴别大外壳是否为数组，且不能为空
    if (!Array.isArray(rangesList) || rangesList.length === 0) {
        throw new Error('BatchGetGS @param rangesList 输入错误，期望非空数组');
    }
    if (!spreadsheetID) {
        throw new Error('BatchGetGS @param spreadsheetID 不能为空');
    }

    // 临门一脚，打包请求
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: spreadsheetID,
        ranges: rangesList, // 👈 直接把你的区域数组丢给 ranges 参数
        
        // 🌟 核心补丁 1：脱掉格式外衣，直接拿最底层的 Number, Boolean 和纯 String（保护精度）
        valueRenderOption: 'UNFORMATTED_VALUE',
        
        // 💡 核心补丁 2：日期保持字符串形式（防止时间戳沦为奇怪的 Excel 浮点数）
        dateTimeRenderOption: 'FORMATTED_STRING' 
    });

    // Google 返回的结构在 response.data.valueRanges 中
    const valueRanges = response.data.valueRanges;

    // 🛡️ 安全兜底：遍历每个区域的数据，如果某个区域完全为空，Google 吐回的该项没有 values 属性
    // 我们用 .map 和 || [] 把它洗成干净的空数组，确保外层接收到的结构绝对整齐，读 .length 永不崩溃
    return valueRanges.map(rangeData => rangeData.values || []);
}

/**
 * 批量清空对应区域数据
 * @param {Array<String>} toClearRangeList 必须保证输入的toClearRangeList是一个数组; 例如： ["MAIN!A:B", "toGCP!A:B"];
 * @returns 
 * 无返回值，只要正确运行就说明操作成功
 */
export async function BatchClearGS(spreadsheetID, toClearRangeList) {
    if (!Array.isArray(toClearRangeList) ) { throw new Error('BatchClearGS @param toClearRangeList 输入错误') }
    if (toClearRangeList.length === 0    ) { return }
    await sheets.spreadsheets.values.batchClear(    {
        spreadsheetId   : spreadsheetID             ,
        requestBody     : {ranges: toClearRangeList }   }   )   ;
}

/**
 * 批量更新区域内容；
 * 先清空，后写入;
 * 这个函数使用时，必须保证清空更新范围，必须是一个大的无限类型的区域;
 * 例如: A:B 这样，
 * @param {Array} toUpdateRangeList 
 * 必须保证输入的toUpdateRangeList是一个数组;
 * 数组中每个元素都是一个对象，对象包括range 和 values两个属性
 * 例如[{range: 'MAIN!A:B', values:[[3,4],[5,6]]}, {range: 'MAIN2!A:B', values:[['A','B'],['C','D']]}]
 * @returns 无返回值，只要正确运行就说明操作成功
 */
export async function BatchClearUpdateGS(spreadsheetID, toUpdateRangeList) {
    if (!Array.isArray(toUpdateRangeList) ) { throw new Error('BatchClearUpdateGS @param toUpdateRangeList 输入错误 type1') }
    if (toUpdateRangeList.length === 0    ) { return }
    const toClearListSet    = new Set() ;
    const toClearUpdateList = []        ;
    toUpdateRangeList.forEach(element => {
        const {range, values} = element ;
        if (!range || !values || !Array.isArray(values) || values.length===0 || !Array.isArray(values[0])) {
            throw new Error("BatchClearUpdateGS @param toUpdateRangeList 输入错误 type2") ;
        } 
        toClearListSet.add(range)    ;
        toClearUpdateList.push( {range , values     } )    ;
    });

    await BatchClearGS(spreadsheetID, Array.from(toClearListSet) ) ;

    await Sleep(100) ;

    await sheets.spreadsheets.values.batchUpdate(   {
        spreadsheetId   :   spreadsheetID  ,
        resource        :   { 
            valueInputOption    : 'USER_ENTERED'    , 
            data                : toClearUpdateList }   }   )   ;
}

export async function SendTG(subject, text, toChatID = process.env.TG_CHAT_ID) {
    const TG_TOKEN = process.env.TG_TOKEN;

    const CHUNK_SIZE = 3800;

    // 先准备好原始的全文本（不转义）
    const fullRawText = subject + "\n" + "------------------" + "\n\n" + text;

    // 先分段，再转义，防止转义字符被切断导致 HTML 报错
    let messageTimes = 1;
    let isManyMessages = false;
    if (fullRawText.length > CHUNK_SIZE) {
        messageTimes = Math.ceil(fullRawText.length / CHUNK_SIZE);
        isManyMessages = true;
    }

    for (let i = 0; i < fullRawText.length; i += CHUNK_SIZE) {

        // 1. 先截取原始文本
        const rawChunk = fullRawText.substring(i, i + CHUNK_SIZE);

        // 2. 对这一段进行转义
        const escapedChunk = rawChunk
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const formattedChunk = `<pre>${escapedChunk}</pre>`;

        const payload = {
            "chat_id": toChatID,
            "text": formattedChunk,
            "parse_mode": "HTML"
        };

        const response = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json(); // 必须加上这一行，否则 result 是 undefined

        if (!response.ok) {
            throw new error(`TG消息发送失败: [${result.error_code}] , ${result.description}`);
        }

        await Sleep(1000);
    }
}

/**
 * 发送邮件 ;
 * 发件人为默认google email, 收件人为默认收件人
 * @param {String} mail_subject 
 * @param {String} mail_content 
 */
export async function SendEmail(mail_subject, mail_content, mailReceiver = process.env.RECEIVER_EMAIL) {
    const mailUser = process.env.GMAIL_USER                         ;
    const mailPass = process.env.GMAIL_APP_PASS                     ;

    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({ service: 'gmail', auth: { user: mailUser, pass: mailPass } });

    // 构建邮件选项
    const mailOptions = {
        from: `"GCP Router" <${mailUser}>`,
        to: mailReceiver,
        subject: mail_subject,
        html: mail_content // 传入你生成的 HTML Table 字符串
    };

    await transporter.sendMail(mailOptions);
}

/**
 * 100% 物理对齐动态时效微操，自带安全测谎与 0 毫秒穿透拦截装甲 ; 
 * 核心确权大闸：如果手抖没传参、传了 undefined、或者是计算出来的 NaN ; 
 * 使用: await Sleep(1000) ; 
 * @param {Number} ms - 期望主线程原地躺平的物理毫秒数
 * @returns {Promise<void>} 纯净的期约原色，由外层总控大闸刚性 await 拦截
 */
export function Sleep(ms) { return new Promise(resolve => setTimeout(resolve, isStrictNumber(ms) ? ms : 1000)) }


export class ResultWithErrMessage {
    constructor({result, errMessage}={}) {
        this.result     = result        ;
        this.errMessage = errMessage    ;
    }
    AddResult(result) {this.result = result}
    AddErrMessage(errMessage) { this.errMessage = AddMessage(this.errMessage, ToStrictString(errMessage, 'unkownErr')) }
    noError() {return !isStrictString(this.errMessage) }
}

/**
 * 将时间戳转换为特定格式: 260423:140155.126
 * @param {number} offsetHours - 例如 东8区，填写8
 * @param {number} timestamp - 毫秒级时间戳
 */
export function GetTimeStringWithOffset(offsetHours, timestamp) {
    const dateTs = timestamp > 0 ? timestamp : Date.now();
    // 加上偏移量后，必须使用 UTC 方法提取，以屏蔽服务器本地时区干扰
    const date = new Date(dateTs + offsetHours * 3600000);

    const yy = String(date.getUTCFullYear()).slice(-2);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');

    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');

    return `${yy}${mm}${dd}:${hh}${min}${ss}.${ms}`;
}

export class DATETIME {
    constructor(timestamp) {
        if (timestamp && !isStrictNumber(timestamp)) { throw new Error('input param to DATETIME is not right') }
        this.timestamp = isStrictNumber(timestamp) ? timestamp : Date.now();
    }
    TimeStringWithOffset(offsetHours) { return GetTimeStringWithOffset(offsetHours, this.timestamp) }
    HowLongToNOW() {return Math.max(0, Date.now() - this.timestamp)}
}
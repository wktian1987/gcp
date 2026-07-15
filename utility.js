import { google } from 'googleapis';
import https from 'node:https';
import { createTransport } from 'nodemailer';

//  1. 注入长效物理套接字蓄水池（全局只初始化一次，焊死长链接）
const sheetsAgent = new https.Agent({
    keepAlive: true,             // 保持长连接，请求完了留在原地等下一个信号
    keepAliveMsecs: 3000,        // 3秒发一次空包维持通道通畅， 能否改为60000？？？不能改为60000, 消耗资源极低, 不用担心计费问题
    maxSockets: 64,              // 允许的最大并发套接字数
    maxFreeSockets: 10,          // 闲置时最多保留的热连接数
    timeout: 30000,              // 30秒无响应刚性断开 , 刚性断开后, 下次有信号进来调用sheetsClient会自动重连
});

const auth = new google.auth.GoogleAuth({ 
    scopes: ['https://www.googleapis.com/auth/spreadsheets'] 
});

//  2. 全局并网：将 Agent 注入到全局客户端中
export const sheetsClient = google.sheets({ 
    version: 'v4', 
    auth,
    options: {
        //  注入这一枪，让后续所有的 API 请求自动走长链接光纤通道
        httpAgent: sheetsAgent,
        httpsAgent: sheetsAgent
    }
});

// 上述的长连接方式是不是会导致费用很高
// 帮我重写，每次使用的时候新建连接


// 原始方案如下
// import { google } from 'googleapis';
// const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] } ) ;
// const sheetsClient = google.sheets({ version: 'v4', auth });



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
 * 空置率核查官：刚性判定一个输入目标是否为纯净的空对象 `{}`
 * * * [安全防御] 内置绝对门禁，自动熔断 `null`、`undefined`、数组及所有基础数据类型。
 * * [性能模型] 采用 O(1) 级的可枚举键名脚印扫描，拒绝内存长拉单。
 * * [实盘避坑] 严禁使用 `JSON.stringify(A) === '{}'` 这种会遗漏 undefined/Function 的欺骗性盲区打法。
 * * @example
 * isEmptyObject({});          // ➔ true
 * isEmptyObject({ a: 1 });    // ➔ false
 * isEmptyObject(null);        // ➔ false (被刚性熔断拦截)
 * isEmptyObject([]);          // ➔ false (数组不是纯空对象)
 * * @param {any} A - 待检测的任意入参目标
 * @returns {boolean} 若目标是 100% 自身不带任何可枚举属性的纯空对象，返回 true；否则一律返回 false
 */
export function isEmptyObject(A) {
    // 刚性前置风控：防止 null、undefined 或非对象类型引发报错
    if (A === null || typeof A !== 'object') return false; 
    
    // 额外风控：排除数组 `[]` 的干扰（因为 typeof [] 也是 'object'）
    if (Array.isArray(A)) return false;

    return Object.keys(A).length === 0;
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

/**
 * 从两个数字变量中找出绝对值最小的一个
 * @param {string} n1 
 * @param {string} n2 
 * @returns false: 表示出错, 输入的值不是标准数字
 */
export function MinABSnumber(n1, n2) {
    if (!isStrictNumber(n1) || !isStrictNumber(n2)) {return false}
    return  Math.abs(c1) > Math.abs(c2) ? c2 : c1 ;
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
 * 工业级通用三发断路重试器（带指数退避策略）。
 * * @description
 * 该函数是中台防空洞机制的核心组件。当传入的异步函数 `f` 遭遇网络抖动或配额风控（如 Google Sheets API 限制）而砸盘时，
 * 本重试器会自动执行以下因果律流向：
 * 1. 首发火网：直接执行，成功则秒回出港。
 * 2. 二发补枪：首发受挫后，就地静默 1000ms 开火。
 * 3. 三发决战：补枪再灭后，延长安全期至 2000ms 避开风控波峰进行最终交割。
 * 若三枪全灭，则刚性抛出最终的物理创口痕迹。
 *
 * @template T
 * @param {function(...any[]): Promise<T>} f - 准备交由重试器全量托管的异步目标函数（需返回 Promise）。
 * @param {...any} payloads - 动态解包并平摊传递给目标函数 `f` 的变长参数载荷队列。
 * @returns {Promise<T>} 完美投递最终命中那一枪的物理回执（若 `f` 无返回值则投递 `undefined`）。
 * @throws {Error} 如果连续三枪物理爆破均宣告全灭，则向外侧策略层甩出最终的致命异常。
 * * @example
 * // 消费场景一：包裹 Google Sheets 批量交割（传 2 个参数，承接返回值）
 * const result = await try3times(BatchUpdateGS, this.spreadsheetID, this.batchUpdateList);
 * * @example
 * // 消费场景二：包裹纯动作型函数（无返回值）
 * await try3times(clearOldSheets, targetSheetId);
 */
export async function try3times(f, ...payloads) {
    try { return await f(...payloads) } catch {
        await Sleep(1000);
        try { return await f(...payloads) } catch {
            await Sleep(2000);
            return await f(...payloads);
        }
    }
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
    const response = await sheetsClient.spreadsheets.get({
        spreadsheetId: spreadsheetID,
        fields: 'sheets.properties.title'
    });

    const sheetList = response.data.sheets || [];

    // 2. 检查是否存在完全匹配的 title
    let exists = sheetList.some(sheet => sheet?.properties?.title === sheetTitle);

    // 3. 临门一脚：触发自动原子创建
    if (!exists && ifNoThenNew) {
        await sheetsClient.spreadsheets.batchUpdate({
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
 * 从 A1 表达式中精准提取起始行号（数字类型）
 * @param {string} rangeStr 标准 range 字符串 (如 'sheet1!A25:B32' 或 "'持仓 明细'!AA25:C30")
 * @returns {number|null} 返回纯数字行号，解析失败返回 null
 */
export function GetStartRowFromRange(rangeStr) {
    // 核心正则：捕获惊叹号后面紧跟的【字母+数字】组合
    const regex = /!([A-Za-z]+)(\d+)/;
    const match = rangeStr.match(regex);

    if (match && match[2]) {
        // match[2] 锁定的就是第二捕获组（纯数字部分）
        // 刚性转换：捞出来的是字符串 "25"，必须强转成 Number 类型才能参与下一步算力
        return parseInt(match[2], 10); 
    }
    
    return null;
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
    const response = await sheetsClient.spreadsheets.values.get(  {
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
    await sheetsClient.spreadsheets.values.clear({
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

    await sheetsClient.spreadsheets.values.update({
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
    await sheetsClient.spreadsheets.values.append(  {
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
    const response = await sheetsClient.spreadsheets.values.batchGet({
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
    await sheetsClient.spreadsheets.values.batchClear(    {
        spreadsheetId   : spreadsheetID             ,
        requestBody     : {ranges: toClearRangeList }   }   )   ;
}

/**
 * 金融级原子化：批量清空并更新区域内容（一枪流锁死）
 * @param {string} spreadsheetID 大表ID
 * @param {Array<{sheetID: number, range: string, values: Array<Array<any>>}>} toClearUpdateRangeList 待更新的矩阵队列
 */
export async function BatchClearUpdateGS(spreadsheetID, toClearUpdateRangeList) {
    // 1. 入站硬性风控风控
    if (!Array.isArray(toClearUpdateRangeList)) { 
        throw new Error('BatchClearUpdateGS @param toClearUpdateRangeList aa须为数组类型'); 
    }
    if (toClearUpdateRangeList.length === 0) return;

    // 2. 在内存中将任务解构并网
    const requests = [];

    // 🎯 极致防空洞：使用现代 for...of 纯净迭代，绝不污染原型链
    for (const element of toClearUpdateRangeList) {
        requests.push(...(makeRequestBodyArrayofBatchUpdate_clearUpdate(element)))
    }

    // 3. 扣动大一统原子扳机
    // 直接一发全包闪击云端！
    await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetID,
        requestBody: {
            requests: requests // 包含了所有清空和写入的完美原子流
        }
    });

    // 只要代码能走到这里，说明在云端“要么全清全写成功了”，绝不存在半途崩盘的可能！
}

/**
 * 拓扑反查官：拉取大表元数据，生成【表名 ➔ 纯数字 sheetId】的高速对账字典
 * * [性能刚性] 默认物理关闭 includeGridData，仅抓取轻量级骨架，传输提速 100 倍，拒绝网络卡顿滑点。
 * * [风控设计] 字典 Key 强行归一化为全小写，物理超渡因人类手抖大小写不一致导致的查表失败。
 * * @example
 * const sheetIdMap = await GetSheetIDfromSheet(spreadsheetID);
 * // 返回: { "main": 0, "log": 148294231 }
 * const myLogId = sheetIdMap["log"]; // ➔ 148294231 (纯数字)
 * * @param {string} spreadsheetID - 整个大表的身份证 ID (从浏览器 URL 中截取)
 * @returns {Promise<Object.<string, number>>} 以全小写表名字符串为键、纯数字 sheetId 为值的映射字典
 */
export async function GetSheetsIDfromSheet(spreadsheetID) {
    // 入站刚性风控
    if (!spreadsheetID || typeof spreadsheetID !== 'string') {
        throw new Error('GetSheetIDfromSheet 拒绝执行：spreadsheetID 缺失或类型错误');
    }

    // 闪击云端元数据骨架（死死关闭 includeGridData，确保毫秒级极速回执）
    const response = await sheetsClient.spreadsheets.get({
        spreadsheetId: spreadsheetID,
        includeGridData: false // 降维打击性能漏洞！只拿骨架，不要肉身，拒绝长拉单
    });

    const sheetsMetadata = response.data.sheets;
    if (!Array.isArray(sheetsMetadata)) {
        throw new Error('GetSheetIDfromSheet 抓取云端元数据大包失败或结构畸形');
    }

    const sheetIDData = {};

    // 🎯 使用纯净 for...of 迭代，绝不污染原型链
    for (const sheet of sheetsMetadata) {
        const title = sheet.properties?.title;
        const id = sheet.properties?.sheetId;

        // 🔒 安全门禁：确保元数据字段完好
        if (typeof title === 'string' && typeof id === 'number') {
            sheetIDData[title] = id;
        }
    }

    return sheetIDData;
}

/**
 * 细胞级数据包装器 (Google Sheets API 专用复水工人)
 * * 将人类可读的扁平二维数组，在内存中瞬间转化为 Google Sheets API 
 * `appendCells` 或 `updateCells` 接口望眼欲穿的标准 `RowData[]` 基因骨架。
 * * @example
 * const rawInput = [["BTC", 65000, true]];
 * const googleRowData = ToGoogleRowData(rawInput);
 * // 输出: [ { values: [ { userEnteredValue: { stringValue: "BTC" } }, ... ] } ]
 * * @param {Array<Array<string|number|boolean>>} rawDataA2d - 待转换的标准二维数组（数据矩阵）
 * @returns {Array<{values: Array<{userEnteredValue: {stringValue?: string, numberValue?: number, boolValue?: boolean}}}>}>} 符合谷歌底层 RowData 规范的细胞级嵌套数组
 */
export function ToGoogleRowData(rawDataA2d) {
    // 入站刚性风控
    if (!Array.isArray(rawDataA2d) || rawDataA2d.length === 0 || !Array.isArray(rawDataA2d[0])) {
        throw new Error('ToGoogleRowData 入参必须是合规的非空二维数组');
    }

    return rawDataA2d.map(row => ({
        values: row.map(cell => {
            // 黄金分流门禁：精准捕获原子数据类型，注入对应的谷歌原生舱位
            if (typeof cell === 'number')  return { userEnteredValue: { numberValue: cell } };
            if (typeof cell === 'boolean') return { userEnteredValue: { boolValue: cell } };
            // 安全防护兜底：非数字非布尔值，统一转为字符串合规防护服，绝不漏水
            return { userEnteredValue: { stringValue: String(cell) } };
        })
    }));
}

/**
 * 拼装器：生成 batchUpdate 结构轨道所需的指定区域物理大清洗单个原子请求
 * * 业务特性：支持全地形坐标。无论传入单格子（A1）、整行（A25:25）、无限向下（A25:B）还是标准区域（A25:B26），均能精准擦除。
 * * 坐标翻译：输入参数支持带 $ 的绝对引用。内部自动完成表名防火墙隔离、$ 符号物理蒸发，以及 0-based 索引转换。
 * * @param {Object} clearObj - 触发物理大清洗的任务配置对象
 * @param {number} clearObj.sheetID - 目标标签页的终身制纯数字物理 ID (如 0)
 * @param {string} clearObj.range - 目标 A1 区域坐标字符串
 * @returns {Object} 官方规范的 updateCells 单个原子请求对象（不带外层数组）
 * @throws {Error} 当传入字段缺失、类型错误或 A1 坐标正则解析失败时抛出错误并强行熔断
 */
export function makeRequestBodyArrayofBatchUpdate_clear(clearObj) {
    const { sheetID, range } = clearObj;

    // 入站刚性风控
    if (typeof sheetID !== 'number' || !range) {
        throw new Error('clear 构造器配置内容残缺或类型错误');
    }

    // 📡 终极全地形坐标雷达（先隔离、后清洗）
    let a1Notation = range.includes('!') ? range.split('!')[1] : range;
    a1Notation = a1Notation.replace(/\$/g, '');

    // 终极可选阀门门禁正则，完美吞咽所有坐标变体
    // 所用正则表达式意思：
    // ^ 和 $/i：头尾死锁，且不区分大小写。意味着整行文本必须纯净，前后多一个空格都会被拒绝。
    // ([A-Z]+)（第 1 捕获组：起始列）：匹配至少一个英文字母。
    // ([0-9]+)（第 2 捕获组：起始行）：匹配至少一个数字。
    // (?:: ... )?（后半截大轨道：整体可选）：
    // ?: 告诉引擎：这个外层圆括号只用来把冒号后面的东西“打包打包”，不占用捕获组的舱位。
    // 末尾的 ? 是核心外挂，代表后半截可有可无。这就是为什么它能兼容没有冒号的单单元格（如 A1）。
    // ([A-Z]*)（第 3 捕获组：结束列）：冒号右边的字母，* 代表允许出现 0 次或多次（可有可无）。
    // ([0-9]*)（第 4 捕获组：结束行）：冒号右边的数字，* 代表允许出现 0 次或多次（可有可无）。
    const match = a1Notation.match(/^([A-Z]+)([0-9]+)(?::([A-Z]*)([0-9]*))?$/i);

    if (!match) {
        throw new Error(`A1坐标格式畸形，无法解析。收到: [${range}]`);
    }

    // 26进制字母转数字进制翻译官
    const colToNumber = (colStr) => {
        if (!colStr) return null;
        let num = 0;
        const str = colStr.toUpperCase();
        for (let i = 0; i < str.length; i++) {
            num = num * 26 + (str.charCodeAt(i) - 64);
        }
        return num;
    };

    // 基础变量提取分配
    const startColStr = match[1];
    const startRowStr = match[2];
    // 刚性安全网：先用 match.length 卡死物理边界，防止数组缩水时强行读取溢出
    const endColStr = (match.length > 3 && match[3] !== undefined) ? match[3] : null;
    const endRowStr = (match.length > 4 && match[4] !== undefined) ? match[4] : null;

    const startCol = colToNumber(startColStr);
    const startRow = parseInt(startRowStr, 10);

    const googleStartRow = startRow - 1; 
    const googleStartCol = startCol - 1; 

    // 组装 GridRange 核心骨架（首发 0-based 物理校准锁死）
    const clearGridRange = {
        sheetId: sheetID,
        startRowIndex: googleStartRow,
        startColumnIndex: googleStartCol
    };

    // 终极边界留空因果律矩阵
    if (range.includes(':')) {
        // 场景 A：带有冒号的多元变体族群 (A25:B26, A25:25, A25:B)
        if (endColStr) {
            clearGridRange.endColumnIndex = colToNumber(endColStr);
        }
        if (endRowStr) {
            clearGridRange.endRowIndex = parseInt(endRowStr, 10);
        }
    } else {
        // 场景 B：绝对无冒号的纯单细胞格子变体 (如 "A1", "B25")
        clearGridRange.endRowIndex = googleStartRow + 1;
        clearGridRange.endColumnIndex = googleStartCol + 1;
    }

    // 直接返回单个 Request 对象，切断多维嵌套风险
    return {
        updateCells: {
            range: clearGridRange,
            fields: "userEnteredValue"
        }
    };
}

/**
 * 拼装器：生成 batchUpdate 结构轨道所需的指定区域大清洗并定点平铺覆盖写入原子请求数组
 * * 业务特性：支持全地形坐标。自动处理 0-based 索引与开区间对账，先后两发子弹顺序串行，微秒级原子交割。
 * * @param {Object} clearUpdateObj - 触发清洗并定点覆盖写入的任务配置对象
 * @param {number} clearUpdateObj.sheetID - 目标标签页的纯数字物理 ID
 * @param {string} clearUpdateObj.range - 目标 A1 区域坐标字符串
 * @param {Array<Array<string|number|boolean>>} clearUpdateObj.values - 准备平铺覆盖写入的纯净二维数组
 * @returns {Array<Object>} 包含一发大清洗和一发覆盖写入的顺序串行请求数组（外部需配合 .flat() 或展开运算符）
 * @throws {Error} 当传入字段缺失、类型错误或 A1 坐标正则解析失败时抛出错误
 */
export function makeRequestBodyArrayofBatchUpdate_update(clearUpdateObj) {
    const { sheetID, range, values } = clearUpdateObj;

    // 入站刚性风控
    if (typeof sheetID !== 'number' || !range || !values) {
        throw new Error('clearUpdate 构造器配置内容残缺或类型错误');
    }

    // 📡 终极全地形坐标雷达（先隔离、后清洗）
    let a1Notation = range.includes('!') ? range.split('!')[1] : range;
    a1Notation = a1Notation.replace(/\$/g, '');

    const match = a1Notation.match(/^([A-Z]+)([0-9]+)(?::([A-Z]*)([0-9]*))?$/i);

    if (!match) {
        throw new Error(`A1坐标格式畸形，无法解析。收到: [${range}]`);
    }

    // 26进制字母转数字进制翻译官
    const colToNumber = (colStr) => {
        if (!colStr) return null;
        let num = 0;
        const str = colStr.toUpperCase();
        for (let i = 0; i < str.length; i++) {
            num = num * 26 + (str.charCodeAt(i) - 64);
        }
        return num;
    };

    // 基础变量提取分配
    const startColStr = match[1];
    const startRowStr = match[2];
    // 刚性安全网：先用 match.length 卡死物理边界，防止数组缩水时强行读取溢出
    const endColStr = (match.length > 3 && match[3] !== undefined) ? match[3] : null;
    const endRowStr = (match.length > 4 && match[4] !== undefined) ? match[4] : null;

    const startCol = colToNumber(startColStr);
    const startRow = parseInt(startRowStr, 10);

    const googleStartRow = startRow - 1; 
    const googleStartCol = startCol - 1; 

    // 复水工人无缝并网，将二维数组转换出谷歌需要的细胞基因骨架
    const googleRowData = ToGoogleRowData(values);

    // const requests = [];

    // 1. 组装第一发子弹：物理大清洗 GridRange
    const clearGridRange = {
        sheetId: sheetID,
        startRowIndex: googleStartRow,
        startColumnIndex: googleStartCol
    };

    if (range.includes(':')) {
        if (endColStr) {
            clearGridRange.endColumnIndex = colToNumber(endColStr);
        }
        if (endRowStr) {
            clearGridRange.endRowIndex = parseInt(endRowStr, 10);
        }
    } else {
        clearGridRange.endRowIndex = googleStartRow + 1;
        clearGridRange.endColumnIndex = googleStartCol + 1;
    }

    // requests.push({
    //     updateCells: {
    //         range: clearGridRange,
    //         fields: "userEnteredValue"
    //     }
    // });

    // 2. 组装第二发子弹：精准定点平铺写入新细胞矩阵
    const updateGridRange = {
        sheetId: sheetID,
        startRowIndex: googleStartRow,
        endRowIndex: googleStartRow + values.length,
        startColumnIndex: googleStartCol,
        endColumnIndex: googleStartCol + values[0].length
    };

    // requests.push({
    //     updateCells: {
    //         range: updateGridRange,
    //         rows: googleRowData,
    //         fields: "userEnteredValue"  // 这样写入的数字前面会有个符号'吗
    //     }
    // });

    // return requests;

    return {
        updateCells: {
            range   : updateGridRange       ,
            rows    : googleRowData         ,
            fields  : "userEnteredValue"    }
    };
}

/**
 * 拼装器：生成 batchUpdate 结构轨道所需的指定区域大清洗并定点平铺覆盖写入原子请求数组
 * * 业务特性：支持全地形坐标。自动处理 0-based 索引与开区间对账，先后两发子弹顺序串行，微秒级原子交割。
 * * @param {Object} clearUpdateObj - 触发清洗并定点覆盖写入的任务配置对象
 * @param {number} clearUpdateObj.sheetID - 目标标签页的纯数字物理 ID
 * @param {string} clearUpdateObj.range - 目标 A1 区域坐标字符串
 * @param {Array<Array<string|number|boolean>>} clearUpdateObj.values - 准备平铺覆盖写入的纯净二维数组
 * @returns {Array<Object>} 包含一发大清洗和一发覆盖写入的顺序串行请求数组（外部需配合 .flat() 或展开运算符）
 * @throws {Error} 当传入字段缺失、类型错误或 A1 坐标正则解析失败时抛出错误
 */
export function makeRequestBodyArrayofBatchUpdate_clearUpdate(clearUpdateObj) {
    const { sheetID, range, values } = clearUpdateObj;

    // 入站刚性风控
    if (typeof sheetID !== 'number' || !range || !values) {
        throw new Error('clearUpdate 构造器配置内容残缺或类型错误');
    }

    // 📡 终极全地形坐标雷达（先隔离、后清洗）
    let a1Notation = range.includes('!') ? range.split('!')[1] : range;
    a1Notation = a1Notation.replace(/\$/g, '');

    const match = a1Notation.match(/^([A-Z]+)([0-9]+)(?::([A-Z]*)([0-9]*))?$/i);

    if (!match) {
        throw new Error(`A1坐标格式畸形，无法解析。收到: [${range}]`);
    }

    // 26进制字母转数字进制翻译官
    const colToNumber = (colStr) => {
        if (!colStr) return null;
        let num = 0;
        const str = colStr.toUpperCase();
        for (let i = 0; i < str.length; i++) {
            num = num * 26 + (str.charCodeAt(i) - 64);
        }
        return num;
    };

    // 基础变量提取分配
    const startColStr = match[1];
    const startRowStr = match[2];
    // 刚性安全网：先用 match.length 卡死物理边界，防止数组缩水时强行读取溢出
    const endColStr = (match.length > 3 && match[3] !== undefined) ? match[3] : null;
    const endRowStr = (match.length > 4 && match[4] !== undefined) ? match[4] : null;

    const startCol = colToNumber(startColStr);
    const startRow = parseInt(startRowStr, 10);

    const googleStartRow = startRow - 1; 
    const googleStartCol = startCol - 1; 

    // 复水工人无缝并网，将二维数组转换出谷歌需要的细胞基因骨架
    const googleRowData = ToGoogleRowData(values);

    const requests = [];

    // 1. 组装第一发子弹：物理大清洗 GridRange
    const clearGridRange = {
        sheetId: sheetID,
        startRowIndex: googleStartRow,
        startColumnIndex: googleStartCol
    };

    if (range.includes(':')) {
        if (endColStr) {
            clearGridRange.endColumnIndex = colToNumber(endColStr);
        }
        if (endRowStr) {
            clearGridRange.endRowIndex = parseInt(endRowStr, 10);
        }
    } else {
        clearGridRange.endRowIndex = googleStartRow + 1;
        clearGridRange.endColumnIndex = googleStartCol + 1;
    }

    requests.push({
        updateCells: {
            range: clearGridRange,
            fields: "userEnteredValue"
        }
    });

    // 2. 组装第二发子弹：精准定点平铺写入新细胞矩阵
    const updateGridRange = {
        sheetId: sheetID,
        startRowIndex: googleStartRow,
        endRowIndex: googleStartRow + values.length,
        startColumnIndex: googleStartCol,
        endColumnIndex: googleStartCol + values[0].length
    };

    requests.push({
        updateCells: {
            range: updateGridRange,
            rows: googleRowData,
            fields: "userEnteredValue"  // 这样写入的数字前面会有个符号'吗
        }
    });

    return requests;
}

/**
 * 拼装器：生成 batchUpdate 结构轨道所需的指定表格尾部追加数据单个原子请求
 * * 业务特性：针对固定追加到工作表底部的场景设计，自动锁死云端物理尾部，不会覆盖已有数据。
 * * 骨架转换：内部通过调用 ToGoogleRowData 细胞工人，将扁平的二维数组转化为谷歌官方标准行数据。
 * * @param {Object} appendObj - 触发尾部追加的任务配置对象
 * @param {number} appendObj.sheetID - 目标标签页的终身制纯数字物理 ID (如 0)
 * @param {Array<Array<string|number|boolean>>} appendObj.values - 准备追加的纯净二维数组（数据矩阵）
 * @returns {Object} 官方规范的 appendCells 单个原子请求对象（不带外层数组）
 * @throws {Error} 当传入的 sheetID 不是纯数字类型时抛出错误并强行熔断
 */
export function makeRequestBodyArrayofBatchUpdate_append(appendObj) {
    const {sheetID, values} = appendObj ;
    
    // 纯数字 ID 严格验证：防止误传人类习惯的字符串表名
    if (typeof sheetID !== 'number') {
        throw new Error('append 构造器硬性要求 sheetID 必须为纯数字类型（如 0 或 1482942）');
    }

    // 复水工人无缝并网，转换出谷歌需要的细胞基因骨架
    const googleRowData = ToGoogleRowData(values);
    
    // 此处已确认直接返回单个请求对象，与注释完全合流对账
    return {
        appendCells: {
            sheetId: sheetID,
            rows: googleRowData,       // 刚刚打包好的满血细胞矩阵行
            fields: "userEnteredValue" // 告诉谷歌直接修改用户输入值舱位，抹平格式干扰
        }
    };
}

/**
 * 拼装器：生成 batchUpdate 结构轨道所需的指定连续行批量物理切除单个原子请求
 * * 业务特性：用于删除表格中不再需要的流水行，后面的行会自动上移填补空缺。
 * * 坐标翻译：输入参数采用人类习惯的真实可见行号（1-based）。函数内部会自动将其转换为谷歌官方底层的 0-based 索引，并严格遵循其 endIndex 开区间规则。
 * * @example
 * // 场景：切除 test 标签页人类视觉可见的第 10 行和第 11 行（共 2 行）
 * const bullet = makeRequestBodyArrayofBatchUpdate_deleteLines({
 * sheetID: 0,
 * deleteLineStart: 10,
 * deleteLineQty: 2
 * });
 * * @param {Object} deleteObj - 触发物理删行的任务配置对象
 * @param {number} deleteObj.sheetID - 目标标签页的终身制纯数字物理 ID (如 0)
 * @param {number} deleteObj.deleteLineStart - 人类习惯的起始物理行号 (从 1 开始，如第一行传 1)
 * @param {number} deleteObj.deleteLineQty - 连续向下切除的物理行数数量 (必须为大于或等于 1 的整数)
 * @returns {Object} 官方规范的 deleteDimension 单个原子请求对象（不带外层数组）
 * @throws {Error} 当传入字段缺失、类型不匹配或数值越界（小于1）时抛出错误并强行熔断
 */
export function makeRequestBodyArrayofBatchUpdate_deleteLines(deleteObj) {
    const {sheetID, deleteLineStart, deleteLineQty} = deleteObj ;
    // 进站刚性风控：严格卡死类型
    if (typeof sheetID !== 'number') {
        throw new Error('deleteLines 构造器硬性要求 sheetID 必须为纯数字类型');
    }
    if (typeof deleteLineStart !== 'number' || deleteLineStart < 1) {
        throw new Error(`deleteLines 起始行号畸形，传入值: [${deleteLineStart}]。行号必须从 1 开始！`);
    }
    if (typeof deleteLineQty !== 'number' || deleteLineQty < 1) {
        throw new Error(`deleteLines 删除数量畸形，传入值: [${deleteLineQty}]。删除数量必须大于等于 1！`);
    }

    // 核心物理对账：将人类看得到的行号（1-based）完美翻译为谷歌底层的索引（0-based）
    // 举例：人类说删第 10 行，底层 startIndex 实际为 9
    const googleStartIndex = deleteLineStart - 1;
    
    // 谷歌 API 的 endIndex 是“开区间”（不包含 endIndex 本身）
    // 举例：从底层索引 9 开始删除 5 行，endIndex = 9 + 5 = 14。它会切掉索引 9,10,11,12,13，完美契合！
    const googleEndIndex = googleStartIndex + deleteLineQty;

    // 此处确认返回的是单个原子请求对象，与当前底座工具箱的单对象返回流完全合流对账
    return {
        deleteDimension: {
            range: {
                sheetId: sheetID,
                dimension: "ROWS",
                startIndex: googleStartIndex,
                endIndex: googleEndIndex
            }
        }
    };
}

/**
 * 顶级全原子执行官：一枪流闪击云端事务总大闸
 * * 将底座积木拼装好的所有 requests 动作队列（如清空、覆盖、尾部追加、删行等），
 * * 打包成单次 HTTPS 原子请求轰向谷歌服务器。云端强力保证 ACID 事务完整性。
 * * @example
 * const partA = makeRequestBodyArrayofBatchUpdate_clearUpdate(task);
 * const partB = makeRequestBodyArrayofBatchUpdate_append(0, [["BTC", 65000]]);
 * await BatchUpdateGS(spreadsheetID, [...partA, partB]);
 * * @param {string} spreadsheetID - 整个大表的身份证 ID (从浏览器 URL 中截取)
 * @param {Array<Object>} requests - 已经通过工具积木平铺好的 Google Sheets API 动作请求队列
 * @returns {Promise<Object>} 返回谷歌云端执行成功的元数据回执 (Data Response)
 */
export async function BatchUpdateGS(spreadsheetID, requests) {
    // 进站刚性风控：防止由于上层逻辑手抖传入空弹夹导致网络空转
    if (!spreadsheetID || typeof spreadsheetID !== 'string') {
        throw new Error('BatchUpdateGS 拒绝执行：spreadsheetID 缺失或类型错误');
    }
    if (!Array.isArray(requests)) {
        throw new Error('BatchUpdateGS 拒绝执行：requests 必须是包含原子动作的数组');
    }
    if (requests.length === 0) {
        console.warn('传入的 requests 弹夹为空，本次原子更新已自动跳过');
        return null;
    }

    // 扣动一枪流总扳机：利用底层套接字长连接闪击云端
    // 不用try catch 直接将报错传递给上层调用者
    const response = await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetID,
        requestBody: {
            requests: requests
        }
    });

    // 返回谷歌服务器的真实执行回执（内部包含每一发子弹的结构变动结果，供高阶对账使用）
    return response.data; // 实际上正常情况下不会用到这个返回值

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
 * @returns 出错会抛出异常
 */
export async function SendEmail(mail_subject, mail_content, mailReceiver = process.env.RECEIVER_EMAIL) {

    try { 
        const mailUser = process.env.GMAIL_USER;
        const mailPass = process.env.GMAIL_APP_PASS;

        const transporter = createTransport({ service: 'gmail', auth: { user: mailUser, pass: mailPass } });

        const mailOptions = {
            from: `"GCP Router" <${mailUser}>`,
            to: mailReceiver,
            subject: mail_subject,
            html: mail_content 
        };

        await transporter.sendMail(mailOptions) ;

    } catch {
        const transporter = createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
                user: 'resend', // 固定的
                pass: process.env.ResendKEY 
            }
        });
        const mailOptions = {
            from: 'GCP Router from Resend <onboarding@resend.dev>',
            to: mailReceiver.toLowerCase(), // 按照resend要求, 目前是固定的自己的注册邮箱yiriyican@foxmail.com
            subject: mail_subject,
            html: mail_content 
        };

        await transporter.sendMail(mailOptions) ;
    }
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
    constructor(timestamp) { this.timestamp = ToStrictNumber(timestamp, Date.now()) }
    GetTimestamp() {return this.timestamp}
    UpdateTime(newTimestamp) { this.timestamp = ToStrictNumber(newTimestamp, Date.now()); return this; }
    TimeStringWithOffset(offsetHours) { return GetTimeStringWithOffset(offsetHours, this.timestamp) }
    HowLongToNOW() { return Math.max(0, Date.now() - this.timestamp) }
}

export class LogsWithTime{
    /**
     * @param {string} logTitle 
     * @param {string} [toSendTG='NO'] 
     */
    constructor(logTitle = 'undefinedLogTitle', toSendTG = 'NO') {
        if (!isStrictString(logTitle)) { throw new Error('logTitle must be string') }
        if (toSendTG !== 'YES' && toSendTG !== 'NO' && toSendTG !== 'onlyErr') { throw new Error('toSendTG input err') }

        this.logTitle       =  logTitle         ; 
        this.startTime      =  Date.now()       ;
        this.logsA          =  []               ;
        this.toSendTG       =  toSendTG         ;
    }

    ChangeLogTitle(newLogTitle) {
        if (isStrictString(newLogTitle)) {
            this.logTitle = newLogTitle.trim();
        }
        if (this.ThereErrLog() && !this.logTitle.includes('Err')) {this.logTitle += ' Err'}
    }

    ThereErrLog() {return isStrictTrue(this.thereErr)}

    /**
     * @param {string} newLine 
     * @param {boolean} [thereErr=false] 
     */
    AddNewLogLine(newLine, thereErr = false) {
        if (!isStrictString(newLine)) {throw new Error('newLine must be string')}
        if (!isStrictBoolean(thereErr)) { throw new Error('thereErr must be boolean or undefined') }
        let joinStr = '✓' ;
        if (isStrictTrue(thereErr)) { this.thereErr = true; this.ChangeLogTitle(); joinStr = '✕'; }
        this.logsA.push({
            severity: thereErr ? 'ERROR' : 'INFO',
            message: `${GetTimeStringWithOffset(8)} ${joinStr} ${newLine.trim()}`
        });
    }

    AddNewErrLogLine(newErrLog) { this.AddNewLogLine(newErrLog, true) }

    consoleLogs(toSendTG) {
        if (isStrictString(toSendTG)) {
            if (toSendTG !== 'YES' && toSendTG !== 'NO' && toSendTG !== 'onlyErr') { throw new Error('toSendTG input err') }
            this.toSendTG = toSendTG ;
        }

        this.AddNewLogLine(`此任务共运行${Math.round((Date.now()-this.startTime)/1000)}秒`)

        for (const log of this.logsA) {
            log.message = `${this.logTitle}: ${log.message}` ;
            if (log.severity === 'INFO') { console.log(JSON.stringify(log)) }
            if (log.severity === 'ERROR') { console.error(JSON.stringify(log)) }
        }

        if (this.toSendTG !== 'NO') {
            const longLogsStr =
                this.logsA.reduce((acc, curr, index) => {
                    return index === 0 ? curr.message : acc + '\n' + curr.message;
                }, '');
            if (this.toSendTG === 'onlyErr' && this.ThereErrLog() || this.toSendTG === 'YES') {
                SendTG(this.logTitle, longLogsStr).catch(()=>{}) ;
            }
        }
    }
}

export function LogInBackground(logObj) {
    setImmediate(() => {
        // 这一步运行在 Check 阶段，绝对不卡当前的 HTTP/WebSocket 响应
        LogInBackground(JSON.stringify(logObj));
    });
}
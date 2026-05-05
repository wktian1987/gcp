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

    let html = '<table style="border-collapse: collapse; border: 1px solid; text-align: left; white-space: pre; font-family: monospace; font-size: 1em; padding: 0, 0.5em">';


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

export function GetSpreadsheetID(botNumber) {
    const sheet_00 = "1796Tns5Z5T8DODV9UkBhVMbPjXdP2WpUJrTPLX0V8dQ";
    const sheet_01 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_02 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_03 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_04 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_05 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_06 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_07 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_08 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    const sheet_09 = "13G-kKQi9AzjzGJUQYmUMGQfUKupkvNaB9irQ8XaCWKs";
    switch (botNumber) {
        case "TradingBot_00": return sheet_00;
        case "TradingBot_01": return sheet_01;
        case "TradingBot_02": return sheet_02;
        case "TradingBot_03": return sheet_03;
        case "TradingBot_04": return sheet_04;
        case "TradingBot_05": return sheet_05;
        case "TradingBot_06": return sheet_06;
        case "TradingBot_07": return sheet_07;
        case "TradingBot_08": return sheet_08;
        case "TradingBot_09": return sheet_09;
        default: return null;

    }
}

/**
 * 判断指定名称的工作表是否存在
 * @param {object} sheets - 已授权的 Google Sheets 实例
 * @param {string} spreadsheetId - 电子表格 ID
 * @param {string} sheetTitle - 你要查找的工作表名称
 * @param {boolean} ifNoThenNew
 * @returns {Promise<boolean>}  <-- 加上这一行 
 */
export async function CheckIfSheetExists(sheets, spreadsheetId, sheetTitle, ifNoThenNew = false) {
    try {
        // 使用 fields 参数只请求需要的字段，减少网络传输量
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties.title'
        });

        const sheetList = response.data.sheets;

        // 检查是否存在匹配的 title
        let exists = sheetList.some(sheet => sheet.properties.title === sheetTitle);

        if (exists) {
            console.log(`✔ 工作表"${sheetTitle}"存在。`);
        } else {
            console.log(`✘ 未找到名为"${sheetTitle}"的工作表。`);
        }

        if (!exists && ifNoThenNew) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: { title: sheetTitle }
                        }
                    }]
                }
            });
            exists = true;
            console.log(`✔ 已自动创建新表: "${sheetTitle}"`);
        }

        return exists;

    } catch (err) {
        console.error(`检查"${sheetTitle}"存在性时出错:` + err.message);
        throw new Error(`检查"${sheetTitle}"存在性时出错:` + err.message);
    }
}

/**
 * 
 * @param {*} sheets 
 * @param {string} spreadsheetId 
 * @param {*} fullRange 
 * @returns - 返回一个二维数组
 * 如果只有 "A!A1:B5" 这个区域内有数据的话，用"A!A:B" 会比"A!A1:B5" 效率不会差很多，可以不考虑
 */
export async function GetDataFromSheet(sheets, spreadsheetId, fullRange) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: fullRange,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            console.log('未找到相关数据。');
            return null;
        }

        return rows.filter(row => row.length >= 2 && row[0] !== ""); // 返回二维数组
    } catch (err) {
        console.error('GetDataFromSheet 报错: ', err.message);
        throw err;
    }
}

/**
 * 获取指定工作表中含有有效数字的表格范围 (A1 表示法)
 * @param {object} sheets - 已授权的 Google Sheets 实例
 * @param {string} spreadsheetId - 电子表格 ID
 * @param {string} sheetTitle - 工作表名称
 * @returns {Promise<string|null>} - 返回 A1 表示法的范围字符串 (例如 "Sheet1!A1:C5")，如果没有数字数据则返回 null
 */
export async function GetNumericDataRange(sheets, spreadsheetId, sheetTitle) {
    try {
        // 获取整个工作表的数据
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: sheetTitle, // 获取整个工作表的所有数据
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            console.log(`工作表"${sheetTitle}"中没有数据。`);
            return null;
        }

        let maxRowIndex = -1;
        let maxColIndex = -1;

        // 遍历数据，找到包含数字的最后一行和最后一列
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
                const cellValue = rows[r][c];
                // 检查是否是有效数字 (包括字符串形式的数字，但排除空字符串)
                // Number("") 会转换为 0，isNaN(0) 为 false，所以需要额外检查空字符串
                if (cellValue !== undefined && cellValue !== null && String(cellValue).trim() !== "" && !isNaN(Number(cellValue))) {
                    maxRowIndex = Math.max(maxRowIndex, r);
                    maxColIndex = Math.max(maxColIndex, c);
                }
            }
        }

        if (maxRowIndex === -1) {
            console.log(`工作表"${sheetTitle}"中没有找到有效数字。`);
            return null;
        }

        // 将列索引转换为 A1 字母表示
        const colIndexToLetter = (col) => {
            let letter = '';
            let tempCol = col;
            while (tempCol >= 0) {
                letter = String.fromCharCode(65 + (tempCol % 26)) + letter;
                tempCol = Math.floor(tempCol / 26) - 1;
            }
            return letter;
        };

        const startCell = `A1`;
        const endCell = `${colIndexToLetter(maxColIndex)}${maxRowIndex + 1}`;

        return `${sheetTitle}!${startCell}:${endCell}`;

    } catch (err) {
        console.error(`获取工作表"${sheetTitle}"的数字数据范围时出错: `, err.message);
        throw err;
    }
}

export async function SendSplitTGMessages(botToken, chatId, subject, text) {
    const CHUNK_SIZE = 3800;

    if (!botToken || !chatId) {
        console.error("✘ 发送tg消息错误: TG_TOKEN 或 TG_CHAT_ID 为空！");
        return;
    }

    // 先准备好原始的全文本（不转义）
    const fullRawText = subject + "\n" + "------------------" + "\n\n" + text;

    // 考虑到 HTML 标签 <pre> 的长度，实际内容的 MAX_LENGTH 应略小于 4096
    // 建议先分段，再转义，防止转义字符被切断导致 HTML 报错

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
            "chat_id": chatId,
            "text": formattedChunk,
            "parse_mode": "HTML"
        };

        try {
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json(); // 必须加上这一行，否则 result 是 undefined

            if (! response.ok) {
                throw new error(`TG消息发送失败: [${result.error_code}] , ${result.description}`);
            }
        } catch (err) {
            throw new Error(`✘ TG消息发送失败: ${err.message}`);
        }

        await new Promise(res => setTimeout(res, 1000));
    }
}


export async function SendEmail(mailUser, mailPass, receiver, mail_subject, mail_content) {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({
        service: 'gmail',
        auth: { user: mailUser, pass: mailPass }
    });

    // 构建邮件选项
    const mailOptions = {
        from: `"GCP Router" <${mailUser}>`,
        to: receiver,
        subject: mail_subject,
        html: mail_content // 传入你生成的 HTML Table 字符串
    };

    try {
        // 必须使用 await 确保发送完成，否则 GCP 容器可能会提前关闭
        const info = await transporter.sendMail(mailOptions);
        // console.log('✔ 邮件发送成功: %s', info.messageId);
        return info;
    } catch (error) {
        // 捕获认证失败或网络超时
        // console.error('✘ 邮件发送异常:', error.message);
        throw error; // 抛出错误供上层逻辑处理（比如重试）
    }

}
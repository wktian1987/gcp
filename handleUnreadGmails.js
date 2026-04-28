import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { google } from 'googleapis';

import {
    GetTimeStringWithOffset,
    GetSheetID,
    CheckIfSheetExists,
    SendSplitTGMessages
} from './utility.js';


const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const FolderName = "tradingview";

const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

const transporter = createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS
    }
});

// 同步 Pine Script 的 SwapChars
function swapChars(src, idx1, idx2) {
    if (idx1 === idx2) return src;
    let arr = Array.from(src);
    [arr[idx1], arr[idx2]] = [arr[idx2], arr[idx1]];
    return arr.join('');
}

// 核心：同步三次洗牌逻辑
function getFinalLists(sList, nList, headN) {
    let _s = sList;
    let _n = nList;
    let _sn = sList + nList;

    // 1. 洗牌 _s_list
    for (let i = 0; i < _s.length; i++) {
        let j = ((i + 1) * (headN + 1)) % _s.length;
        _s = swapChars(_s, i, j);
    }
    // 2. 洗牌 _n_list
    for (let i = 0; i < _n.length; i++) {
        let j = ((i + 1) * (headN + 1)) % _n.length;
        _n = swapChars(_n, i, j);
    }
    // 3. 洗牌 _sn_list
    for (let i = 0; i < _sn.length; i++) {
        let j = ((i + 1) * (headN + 1)) % _sn.length;
        _sn = swapChars(_sn, i, j);
    }

    return { _s, _n, _sn };
}

function decrypt(fullCipher) {
    const S_LIST = process.env.S_LIST;
    const N_LIST = process.env.N_LIST;
    const CHECK_WORD = process.env.CHECK_WORD;
    const PRIVATE_KEY = parseInt(process.env.PRIVATE_KEY || "0");

    // 先判断是否是加密邮件
    const match = fullCipher.match(/<tradingviewcode>([\s\S]*?)<\/tradingviewcode>/);
    // 判断是否匹配成功
    if (!match) {
        // 如果不是加密邮件，直接原文返回
        return fullCipher;
    }

    // 匹配成功，提取密文部分
    const raw = match[1].trim();

    const head = raw.substring(0, 1);
    const body = raw.substring(1);

    const sn_list_orig = S_LIST + N_LIST;
    const snLen = sn_list_orig.length;
    const p_shift = PRIVATE_KEY % snLen;
    const headN = sn_list_orig.indexOf(head);
    // 执行三次同步洗牌 (逻辑见前文 getFinalLists)
    const { _s, _n, _sn } = getFinalLists(S_LIST, N_LIST, headN);

    let current_t_shift = _sn.indexOf(head);

    let decodedText = "";
    let j = 0;      // 密文指针
    while (j < body.length) {
        let char = body[j];
        let pos = _sn.indexOf(char);

        if (pos >= 0) {
            let i_shift = j % snLen;
            let dynamic_shift = (i_shift + p_shift + current_t_shift) % snLen;

            // 解密当前字符
            let origPos = (pos - dynamic_shift + snLen) % snLen;
            decodedText += _sn[origPos];

            // 更新步进
            current_t_shift = origPos + 1;
        } else {
            decodedText += char;
            current_t_shift = 0;
        }
        j++;
        // i_orig++;
    }

    // --- 3. 后处理：还原占位符 & 剥离“明文期”干扰 ---

    // 步骤 A: 还原占位符 (要在清洗干扰符之前，防止干扰符里有 ⁞)
    let finalResult = decodedText
        .replace(/⁞⁞⁞KongGe⁞⁞⁞/g, " ")
        .replace(/⁞⁞⁞ZuoJian⁞⁞⁞/g, "<")
        .replace(/⁞⁞⁞YouJian⁞⁞⁞/g, ">")
        .replace(/⁞⁞⁞HuanHang⁞⁞⁞/g, "\n");



    // 步骤 B: 剥离明文期插入的 _n_list 字符 (使用正则表达式)
    // 1. 将洗牌后的 _n 列表中的字符进行转义，防止其中包含正则特殊字符（如 [, ], \, ^ 等）
    const escapedNList = _n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 2. 构建全局正则，匹配字符集中的任意字符
    const nRegex = new RegExp('[' + escapedNList + ']', 'g');
    // 3. 一次性替换为空
    finalResult = finalResult.replace(nRegex, '');
    // --- 4. 最终校验与返回 ---
    // 确保 CHECK_WORD 在这里是可访问的变量
    const checkWord = typeof CHECK_WORD !== 'undefined' ? CHECK_WORD : (process.env.CHECK_WORD || "");

    if (checkWord && finalResult.endsWith(checkWord)) {
        // 校验成功：剥离校验词并返回真正的明文
        return finalResult.substring(0, finalResult.length - checkWord.length);
    } else {
        // 校验失败：打印日志方便排查，并返回友好提示
        console.log("解密校验失败，前15位内容预览:", finalResult.substring(0, 15));
        return "未成功解密！！！(校验失败)， 前100位内容预览: " + "\n" + finalResult.substring(0, 100);
    }

}

function makePrettyTable(data) {
    const rows = data.split('\n').filter(r => r.trim() !== "");
    if (rows.length === 0) return "";
    let maxCols = 0;
    rows.forEach(r => {
        const c = r.split(',').length;
        if (c > maxCols) maxCols = c;
    });
    let html = `<table style="border-collapse: collapse; border: 1px solid; white-space: pre; font-family: monospace; font-size: 1em">`;
    rows.forEach((row, i) => {
        const cols = row.split(',');
        html += `<tr>`;
        cols.forEach(col => {
            if (cols.length == 1) {
                html += `<td colspan="${maxCols}" style="border: 1px solid; padding: 0 0.5em; font-family: monospace; font-size: 1em; white-space: pre">${col.trim()}</td>`;
            } else {
                html += `<td style="border: 1px solid; padding: 0 0.5em; font-family: monospace; font-size: 1em; white-space: pre">${col.trim()}</td>`;
            }
        });
        html += `</tr>`;
    });
    html += `</table>`;
    return html;
}

function convertToTextTable(rawContent) {
    // 假设 rawContent 是以逗号或 Tab 分隔的行
    const rows = rawContent.split('\n').map(line => line.split(','));
    if (rows.length === 0) return "";

    // 1. 计算每一列的最大宽度
    const colWidths = [];
    rows.forEach(row => {
        row.forEach((cell, i) => {
            const len = cell.trim().length;
            colWidths[i] = Math.max(colWidths[i] || 0, len);
        });
    });

    // 2. 构建文本表格
    let tableText = "";
    rows.forEach((row, rowIndex) => {
        let line = "";
        row.forEach((cell, i) => {
            // 将内容填充到固定长度，末尾加两个空格作为间隔
            line += cell.trim().padEnd(colWidths[i] + 2, ' ');
        });
        tableText += line + "\n";

        // 如果是表头，加一行分割线
        if (rowIndex === 0) {
            tableText += "-".repeat(colWidths.reduce((a, b) => a + b, 0) + row.length * 2) + "\n";
        }
    });

    return `<pre>${tableText}</pre>`; // 必须用 <pre> 标签包围
}

export async function HandleUnreadGmails(req, res) {
    if (!res.writableEnded) res.status(200).send('ACK'); // 立即返回响应防止超时

    const SPREADSHEET_ID = GetSheetID("TradingBot_00");
    const handledEmailsSheetTitle = "handledEmails";
    // await CheckIfSheetExists(sheets, SPREADSHEET_ID, handledEmailsSheetTitle, true);
    let lock = null;
    let client = null;

    try {
        const IMAP_CONFIG = {
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASS
            }
        };
        client = new ImapFlow(IMAP_CONFIG);
        await client.connect();

        // 必须先进入文件夹，search 才会生效
        await client.mailboxOpen(FolderName);
        lock = await client.getMailboxLock(FolderName);
        // 搜索未读邮件
        const messages = await client.search({ seen: false });
        // 如果没有未读邮件，则安全退出
        if (messages.length === 0) {
            console.log(`✔ [${FolderName}] 无未读邮件`);
            return;
        } else {
            console.log(`✔ [${FolderName}] 有未读邮件 ${messages.length} 封， 开始处理... `);
        }

        // 优化：一次性获取已处理 ID 列表，转为 Set 提高查询效率
        const handledEmails = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${handledEmailsSheetTitle}!A2:F`,
        }); // handledEmails得到的是一个标准的JS对象吗
        let handledEmailsData = handledEmails.data.values || [];

        const handledEmailsID = new Set(
            handledEmailsData
                .map(row => row[0])
                .filter(id => id && id.trim() !== "") // 过滤掉可能的空行或无效数据
        );

        for (const uid of messages) {
            const messageOrder = messages.indexOf(uid) + 1;
            console.log(`开始处理第 ${messageOrder} 封邮件...`);

            let successTG = "FAIL";
            let successEmail = "FAIL";

            // 下载并解析
            const emailStream = await client.download(uid);
            const parsed = await simpleParser(emailStream.content);
            const msgId = (parsed.messageId || "No msgID").replace(/[<>]/g, '').trim();
            const subject = parsed.subject || "No Subject";
            const mailGetTime = parsed.date ? GetTimeStringWithOffset(8, parsed.date.getTime()) : "No date info";
            const rawBody = parsed.text || ""; // 这里的 text 已经去掉了所有邮件头

            // 先检查此未读邮件是否已经被处理过 Google Sheet ---
            if (handledEmailsID.has(msgId)) {
                await client.messageFlagsAdd(uid, ['\\Seen']);
                console.log(`✘ 本邮件已被处理过，重新标记为已读: ${msgId}`);
                continue;
            }

            const thisEmailMark =
                "mailGetTime  : " + mailGetTime + "\n" +
                "subject      : " + subject + "\n" +
                "msgID        : " + msgId;

            console.log("开始处理新邮件:" + "\n" + thisEmailMark);

            let finalBody = rawBody.match(/<tradingviewcode>([\s\S]*?)<\/tradingviewcode>/) ? // 先判断是否是加密邮件
                decrypt(rawBody) :
                rawBody;

            if (!finalBody) finalBody = "邮件内容为空或解析失败";

            finalBody = finalBody.replace(/<SHEET[\s\S]*?<\/SHEET>/gi, "").trim();

            finalBody = finalBody + "\n\n" + thisEmailMark;

            // 准备 Telegram 专用内容（TG 不支持复杂的 CSS，且有长度限制）
            let tgText = finalBody.replace(/<TBL>([\s\S]*?)<\/TBL>/gi, (match, content) => {
                return convertToTextTable(content.trim()); // 使用方案一的函数
            });
            tgText = tgText
                .replace(/<br>/g, "\n")   // 换回换行符
                .replace(/<[^>]+>/g, ""); // 移除 HTML 标签（或保留基础的 <b> 等）

            // 1. 准备发送任务 (不带 IIFE，直接获取 Promise)
            const sendTGTask = SendSplitTGMessages(TG_TOKEN, TG_CHAT_ID, subject, tgText);

            let processedHtml = finalBody.replace(/<TBL>([\s\S]*?)<\/TBL>/gi, (match, content) => {
                return makePrettyTable(content.trim());
            });
            processedHtml = `<div style="font-family: monospace; white-space: pre-wrap; font-size: 1em;">${processedHtml.replace(/\n/g, '<br>')}</div>`;

            const sendMailTask = transporter.sendMail({
                from: `"GCP Router" <${process.env.GMAIL_USER}>`,
                to: process.env.RECEIVER_EMAIL,
                subject: `tv${subject}`,
                html: processedHtml
            });

            // 2. 执行并发任务
            const handleResults = await Promise.allSettled([sendTGTask, sendMailTask]);

            handleResults.forEach((result, index) => {
                const taskName = index === 0 ? "发送Telegram消息" : "转发邮件";
                if (result.status === "fulfilled") {
                    successTG = index === 0 ? "SUCCESS" : successTG;
                    successEmail = index === 1 ? "SUCCESS" : successEmail;
                    console.log(`✔ ${taskName}成功`);
                } else {
                    successTG = index === 0 ? "FAIL" : successTG;
                    successEmail = index === 1 ? "FAIL" : successEmail;
                    console.error(`✘ ${taskName}失败: `, result.reason?.message || result.reason);
                }
            });

            // --- 标记为已读 ---
            try {
                await client.messageFlagsAdd(uid, ['\\Seen']);
                console.log(`✔ 当前邮件${msgId}标记为已读成功`);
            } catch (err) {
                console.error(`✘ 当前邮件${msgId}标记为已读 失败: ` + err.message);
            }

            // 3. 修复 handledEmailsData 数组操作，直接 unshift，不要对 handledEmailsData 重新赋值
            handledEmailsData.unshift([
                msgId,
                subject,
                mailGetTime,
                GetTimeStringWithOffset(8),
                successTG,
                successEmail
            ]);
        }

        if (handledEmailsData.length > 99) {
            handledEmailsData.length = 99






            ;
        }
        // 邮件状态更改，防止反复操作
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${handledEmailsSheetTitle}!A2`, // 从 A2 开始写入，保护 A1 表头
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: handledEmailsData
                }
            });
            console.log(`✔ 当前处理邮件${messages.length} 封写入GoogleSheets "${handledEmailsSheetTitle}"成功`);
        }
        catch (sheetErr) {
            console.error(`✘ 当前处理邮件${messages.length} 封写入GoogleSheets "${handledEmailsSheetTitle}"失败: ` + sheetErr.message);
        }

    } catch (err) {
        console.error("✘ [后台任务失败] 未读tradingview邮件处理异常: " + err.message);
        // 注意：这里不能再调用 res.status()，因为响应已在开头发出
    } finally {
        if (lock) {
            await lock.release();
            console.log("✔ Gmail folder lock released");
        }
        if (client) {
            await client.logout();
            console.log("✔ 已安全退出 client");
        }
    }
}
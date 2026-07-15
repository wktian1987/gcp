import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import {
    GetTimeStringWithOffset,
    GetSpreadsheetID,
    CheckIfSheetExists,
    SendTG,
    SendEmail,
    GetGS,
    UpdateGS,
    AddMessage,
    try3times, 
    LogsWithTime
} from './utility.js';

// 1. 刚性配置锁死在全局// 1. 刚性配置锁死在全局
const IMAP_CONFIG = {
    host    : 'imap.gmail.com',
    port    : 993,
    secure  : true,
    auth    : { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
    logger  : { level: 'error'} // 关键设置：只输出错误级别的日志 // 可选值: 'debug', 'info', 'warn', 'error', 'silent'
};


// 2. 全局唯一的 client 座位（单例物理壳）
let globalImapClient = null;

/**
 * 核心大闸：获取满血可用的 IMAP 连接单例
 * 确保整个系统生命周期只有一条管道，断线自动重连
 */
async function getImapClient() {
    // 场景 A：如果从来没创建过，原位初始化
    if (!globalImapClient) {
        globalImapClient = new ImapFlow(IMAP_CONFIG);
    }

    // 场景 B：如果连接健在，直接秒回出港复用
    if (globalImapClient.usable) {
        return globalImapClient;
    }

    try {
        // 安全熔断：在连之前先强制 logout 清理残留脏数据，防止句柄溢出
        await globalImapClient.logout().catch(() => {}); 
        // 重新并网
        await globalImapClient.connect();
        return globalImapClient;
    } catch (err) {
        globalImapClient = null;        
        throw err; 
    }
}


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
        LogInBackground("解密校验失败，前15位内容预览:", finalResult.substring(0, 15));
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

const gmailFolderName = "tradingview";
let isImapMailboxOccupied = false ;
export async function HandleUnreadGmails(checkUnreadEmailsLogs, toChatID = process.env.TG_CHAT_ID, mailReceiver = process.env.RECEIVER_EMAIL) {
    if (isImapMailboxOccupied) {
        checkUnreadEmailsLogs.AddNewLogLine('已经有人在处理, 走退出流程') ;
        return  ;
    }
    else {isImapMailboxOccupied = true}

    let lock = null;
    let client = null;

    try {
        const client = await try3times(getImapClient) ;
        if (!client.authenticated) {
            const errMessage = 'IMAP Client 连接失败' ;
            throw new Error(errMessage) ;
        }
        checkUnreadEmailsLogs.AddNewLogLine('链接IMAP Client成功')

        // 必须先进入文件夹，search 才会生效
        await client.mailboxOpen(gmailFolderName);
        checkUnreadEmailsLogs.AddNewLogLine('打开邮箱文件夹成功') ;

        lock = await client.getMailboxLock(gmailFolderName);
        if (!lock) { 
            const errMessage = "Mail Folder lock 失败" ;
            throw new Error(errMessage) ;
        }
        checkUnreadEmailsLogs.AddNewLogLine('邮箱设锁成功') ;


        // 搜索未读邮件
        const messages = await client.search({ seen: false });
        checkUnreadEmailsLogs.AddNewLogLine('搜索未读邮件成功') ;

        // 如果没有未读邮件，则安全退出, 后面还有finally 不用担心 client 和 lock 锁定状态
        if (messages.length === 0) {
            checkUnreadEmailsLogs.AddNewLogLine('没有未读邮件, 直接走finally退出流程') ;
            return ;
        } else {
            checkUnreadEmailsLogs.AddNewLogLine(`共有未读邮件${messages.length}封, 开始挨个处理`) ;
        }

        let task_thereErr = false;
        let task_message = '';
        let task_name = '';
        let emailSerial = 0 ;

        task_message = AddMessage(task_message, `共有未读邮件${messages.length}封`);
        task_message = AddMessage(task_message, `---------------------------`);

        for (const uid of messages) {
            emailSerial += 1 ;
            // 下载并解析
            const emailStream = await client.download(uid);
            const parsed = await simpleParser(emailStream.content);
            const msgId = (parsed.messageId || "No msgID").replace(/[<>]/g, '').trim();
            const subject = parsed.subject || "No Subject";
            const mailGetTime = parsed.date ? GetTimeStringWithOffset(8, parsed.date.getTime()) : "No date info";
            const rawBody = parsed.text || ""; // 这里的 text 已经去掉了所有邮件头

            const thisEmailMark =
                "mailGetTime  : " + mailGetTime + "\n" +
                "subject      : " + subject + "\n" +
                "msgID        : " + msgId;

            let finalBody = rawBody.match(/<tradingviewcode>([\s\S]*?)<\/tradingviewcode>/)     ? // 先判断是否是加密邮件
                decrypt(rawBody)                                                                :
                rawBody                                                                         ;

            if (!finalBody) { 
                const errMessage = "邮件内容为空或解析失败, 走finally退出流程" ;
                throw new Error(errMessage) ;
            }

            checkUnreadEmailsLogs.AddNewLogLine(`下载并解析第${emailSerial}封邮件成功, 开始处理`)

            finalBody = finalBody.replace(/<SHEET[\s\S]*?<\/SHEET>/gi, "").trim();

            finalBody = finalBody + "\n\n" + thisEmailMark;

            // 准备 Telegram 专用内容（TG 不支持复杂的 CSS，且有长度限制）
            let tgText = finalBody.replace(/<TBL>([\s\S]*?)<\/TBL>/gi, (match, content) => { return convertToTextTable(content.trim()) });
            tgText = tgText
                .replace(/<br>/g, "\n")   // 换回换行符
                .replace(/<[^>]+>/g, ""); // 移除 HTML 标签（或保留基础的 <b> 等）

            // 将邮件标记为已读 任务
            const task_markEmailRead = client.messageFlagsAdd(uid, ['\\Seen']) ;

            // 准备发送任务
            const task_SendTG = SendTG(subject, tgText, toChatID);

            let processedHtml = finalBody.replace(/<TBL>([\s\S]*?)<\/TBL>/gi, (match, content) => { return makePrettyTable(content.trim()) });
            processedHtml = `<div style="font-family: monospace; white-space: pre-wrap; font-size: 1em;">${processedHtml.replace(/\n/g, '<br>')}</div>`;

            const task_SendEmail = SendEmail(`tv${subject}`, processedHtml, mailReceiver) ;

            // 执行并发任务
            const handleResults = await Promise.allSettled([task_markEmailRead, task_SendTG, task_SendEmail]);

            let thisRunningMessage = ''     ;
            let thisRunningErr     = false  ;
            thisRunningMessage = AddMessage(thisRunningMessage, `第${emailSerial}封邮件处理结果: `)
            handleResults.forEach((result, index) => {
                if (index === 0) {task_name = 'task_markEmailRead'   }
                if (index === 1) {task_name = 'task_SendTG'          }
                if (index === 2) {task_name = 'task_SendEmail'       }
                if (result.status === "fulfilled") { 
                    thisRunningMessage = AddMessage(thisRunningMessage, task_name + '执行成功') ;
                } else {
                    task_thereErr           =  true  ;
                    thisRunningErr          =  true  ;
                    thisRunningMessage      =  AddMessage(thisRunningMessage, task_name + '执行失败')  ;
                }
            });

            if (thisRunningErr) {checkUnreadEmailsLogs.AddNewErrLogLine(thisRunningMessage)} else {
                checkUnreadEmailsLogs.AddNewLogLine(thisRunningMessage) ;
            }

        }

        if (task_thereErr) { throw new Error(task_message) }
        
    } finally {
        isImapMailboxOccupied = false ;
        if (lock) { 
            await lock.release() ;
            checkUnreadEmailsLogs.AddNewLogLine('释放Gmail锁成功') ;
        }
        if (client) { 
            await client.logout() ;
            checkUnreadEmailsLogs.AddNewLogLine('关闭client链接成功') ; // 读取邮件成功的情况下，为什么这一行没有执行，整个程序也没有报错
        }
    }
}
import {
    SendSplitTGMessages,
    GetSheetID,
    FormatMatrixToString,
    GetDataFromSheet
} from "./utility.js";

import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });


const botToken = process.env.TG_TOKEN;
const myGroupAlertTgID = process.env.TG_CHAT_ID;
const myTgID = "6444592564";


// https://api.telegram.org/bot8509122671:AAGmfo4Cak8ptnLotdpiE-xgrcnBcJ6r7OA/setWebhook?url=https://trading-webhook-767754845117.asia-northeast1.run.app/tgBot

export async function HandleTgBot(req, res) {

    // 1. 获取 Telegram Webhook 的核心数据
    const body = req.body;
    const msg = body.message;

    // 2. 基础拦截：如果不是普通私聊或群聊消息，直接回复 200 并退出
    if (!msg) {
        return res.status(200).send("Ignore: Not a standard message");
    }

    // 3. 核心拦截：非文本处理逻辑
    if (!msg.text) {
        return res.status(200).send("Blocked: Non-text content");
    }

    const chat_id = String(msg.chat.id || "unknown").trim();
    const text = msg.text || "";

    try {
        const botNumber = (txt => {
            if (!txt) return null;
            const match = txt.match(/trd(\d{2})/); // 匹配 trd 加上两位数字
            return match ? `TradingBot_${match[1]}` : null;
        })(text);

        const sheetId = GetSheetID(botNumber);


        // 只处理我或者群内发来的消息
        if (chat_id !== myTgID && chat_id !== myGroupAlertTgID) {
            return res.status(200).send("ACK)");
        }

        if (!botNumber || !sheetId) {
            await SendSplitTGMessages(botToken, chat_id, "命令错误", "请输入正确命令");
            return res.status(200).send("ACK)");
        }

        const toGCPdata = await GetDataFromSheet(sheets, sheetId, "toGCP!A:B");
        const toGCP = Object.fromEntries(toGCPdata);
        const toTGData = await GetDataFromSheet(sheets, sheetId, toGCP.toTgBotRange);
        const toTGDataString = FormatMatrixToString(toTGData);

        const chatId = chat_id === myTgID ? myTgID : myGroupAlertTgID;
        await SendSplitTGMessages(botToken, chatId, botNumber, toTGDataString);
        res.status(200).send("ACK");
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
}
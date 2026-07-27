import { GoogleGenAI } from '@google/genai';
import { isStrictString } from './utility.js';

/** Gemini API 密钥，从环境变量中获取 */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ;

/** 初始化 GoogleGenAI 实例 */
export const GeminiAI = new GoogleGenAI({});

/**
 * 异步函数：向 Gemini AI 发送文本查询并获取回复
 * 
 * @async
 * @function AskGemini
 * @param {string} inputText - 需要发送给 AI 模型处理的输入文本内容
 * @throws {Error} 当输入参数不是有效的字符串时，抛出“必须输入字符串”的错误
 * @returns {Promise<string>} 返回由 AI 生成的响应文本（output_text）
 */
export async function AskGemini(inputText) {
    // 检查输入是否为严格定义的字符串类型
    if (!isStrictString(inputText)) { throw new Error('必须输入字符串') }

    // 调用 GeminiAI 接口创建一次交互请求
    const interaction = await GeminiAI.interactions.create({
        model: "gemini-3.6-flash", // 使用指定的模型版本
        input: inputText            // 发送用户的输入文本
    });

    // 返回交互结果中的输出文本部分
    return interaction.output_text;
}

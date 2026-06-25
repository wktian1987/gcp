import { SendTG, Sleep } from "./utility.js"

export async function test(chat_id) {
    await SendTG('TEST信号处理开始', '这里是test()正在处理...', chat_id) ;

    await SendTG('TEST信号处理结束', 'TEST信号处理结束', chat_id) ;
}
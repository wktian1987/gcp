// test

import { AddSetMessage, isStrictString } from "./utility";

const A = {
    s : 'sss' ,
    UpdateAttr(attName, attV) {this[attName] = attV} ,
    printS(str) {console.log(this.s + str)}
} ;
const a = Object.create(A) ;

//////////////////////////////////////////////////////

export async function HandleTradingBot(tvData) {

    // 清洗来自TV的数据
    Object.keys(tvData).forEach(key => {
        tvData[key] = ToStrictNumBoolStr(tvData[key], 'notAvailableValueFromTV') ;
        if ( isStrictString(tvData[key]) && tvData[key].includes(HuanHang) ) { tvData[key] = tvData[key].replaceAll(HuanHang, '\n').trim() }
    } ) ;

    const bot = Object.create(TradeBot) ;
    await bot.CreateBasicAttr(tvData) ;
    console.log(bot.cLogHead + 'CreateBasicAttr() success') ;
    await bot.Get_gsData()  ;
    console.log(bot.cLogHead + 'Get_gsData() success') ;
    await bot.ToCheckInitiate()  ;
    console.log(bot.cLogHead + 'ToCheckInitiate() success') ;
    // await bot.Get_gsData()  ;
    // console.log(bot.cLogHead + 'Get_gsData()_after_ToCheckInitiate() success') ;

}

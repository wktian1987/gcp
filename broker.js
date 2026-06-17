import {
    isStrictNumber,
    isStrictString,
    isStrictTrue,
    isStrictFalse,
    ToStrictNumber,
    ToStrictString,
    CleanObjToNumBoolStr,
    GetGS,
    GetTimeStringWithOffset,
    Sleep,
    ClearGS,
    BatchClearUpdateGS,
    ObjToA2dNumBoolStr,
    A2dToCleanObj,
    isPlainObject
} from "./utility.js";

import { CV } from "./handleTV.js";

import { maxHeaderSize } from "node:http"; // 这一行是干嘛的??? 为什么我的代码里莫名其妙出现这一行


//#region - Basic Broker interface

/**
 * 向交易所发送交易命令 
 * @param {object} S 
 * @returns 会抛出错误, 用是否跑错来判断是否执行成功
 * @returns 直接在传入的对象上进行数据修改, 不会另外返回数据
 */
export async function SendOrderToBroker(S) {
    if (!isStrictFalse(S.isReal) && S.TradingSymbol.startsWith("GATE:")) { await GATE_SendOrderToBroker(S); return; }

    const simRange_00 = 'simBroker!A30:B'   ;
    const simRange_01 = 'simBroker!A1:B29'  ;

    await BatchClearUpdateGS(S.spreadsheetID, [{range:simRange_00, values: ObjToA2dNumBoolStr(S)}]) ; // 发送交易
    await Sleep(100) ;
    
    const res = A2dToCleanObj(await GetGS(S.spreadsheetID, simRange_01)); //交易状态返回

    S.ing_orderID		    = res.orderID        ;
    S.ing_orderStatus		= res.orderStatus    ;
}

/**
 * 去检查ingOrder
 * @param {object} ingOrderData 
 * @returns 会抛出错误, 用是否抛错来判断是否执行成功
 * @returns 直接在传入的ingOrderData对象中修改属性, 不会另外返回
 */
export async function CheckOrderConfirm(ingOrderData) { 
    if (!isStrictFalse(ingOrderData.isReal) && ingOrderData.TradingSymbol.startsWith("GATE:")) { await GATE_CheckOrderConfirm(ingOrderData); return; }

    const simRange_00 = 'simBroker!A30:B'   ;
    const simRange_01 = 'simBroker!A1:B29'  ;

    // 无论是要取消交易, 都要首先查看现在的交易状态
    // 在模拟交易中, 没有 部分成交 这种情况 
    const res   = CleanObjToNumBoolStr(Object.fromEntries(await GetGS(ingOrderData.spreadsheetID, simRange_01 ))) ;
    if (res.orderStatus === "confirm")  {
        ingOrderData.ing_orderID		    = res.orderID                                           ;
        ingOrderData.ing_confirmTimestamp   = res.confirmTimestamp                                  ;
        ingOrderData.ing_confirmDate		= res.confirmDate                                       ;
        ingOrderData.ing_confirmPrice		= res.confirmPrice                                      ;
        ingOrderData.ing_getProfit		    = res.getProfit                                         ;
        ingOrderData.ing_avgBuyPrice		= res.avgBuyPrice                                       ;
        ingOrderData.ing_tradeFee		    = res.tradeFee                                          ;
        ingOrderData.ing_allFund		    = res.allFund + ingOrderData.ing_tradeFee               ;
        ingOrderData.ing_allCoin		    = ingOrderData.ing_allFund / res.BaseCoinPrice          ;
        ingOrderData.ing_orderStatus		= res.orderStatus                                       ;
        ingOrderData.ing_pXq                = ingOrderData.ing_confirmPrice * ingOrderData.ing_qty  ;

        await ClearGS(ingOrderData.spreadsheetID, simRange_00) ;
    } 

    // 在模拟交易中, 没有 部分成交 这种情况 
    if ( isStrictTrue(ingOrderData.ifWaitingThenCancel) && res.orderStatus !== "confirm") {
        await ClearGS(ingOrderData.spreadsheetID, simRange_00) ;
        ingOrderData.ing_orderStatus = CV.order_cancel;
    }
}

/**
 * 去检查fundFee 
 * @param {object} fund 
 * @returns 会抛出错误, 用是否抛错来判断是否执行成功
 * @returns 直接在传入的fund对象中修改属性, 不会另外返回
 */
export async function CheckFundFee(fund) {
    if (!isStrictFalse(fund.isReal) && fund.TradingSymbol.startsWith("GATE:")) { await GATE_CheckFundFee(fund); return; }

    const simRange_01 = 'simBroker!A1:B29';
    const resFund = CleanObjToNumBoolStr(Object.fromEntries(await GetGS(fund.spreadsheetID, simRange_01)));

    fund.fundFee           =  isStrictNumber(resFund.fundFee) ? resFund.fundFee : 0     ;
    fund.confirmDate       =  fund.orderDate                                            ;
    fund.confirmTimestamp  =  fund.orderTimestamp                                       ;
    fund.allFund           =  resFund.allFund + fund.fundFee                            ;
    fund.allCoin           =  fund.allFund / resFund.BaseCoinPrice                      ;
}

//#endregion


//#region - Gate
// 实盘交易: https://api.gateio.ws
// 模拟交易：https://api-testnet.gateapi.io
// 现在的版本为: /api/v4
// 是否是实盘交易, 只有isStrictTrue(isReal)是实盘交易, 其他全是模拟盘

/**
 * 将 TV 信号 Symbol 转换为交易所标准 Symbol 对象 ; 
 * 目前只考虑USDT本位合约情况, 非USDT本位合约报错
 * @param {string} tvSymbol 例: "GATE:BTCUSDT.P"
 * @returns {object|false}
 */
function tvSymbol_TO_GATE_Symbol(tvSymbol) {
    // 1. 一线风控：强类型校验（防御 Null 或 Undefined 穿透）
    if (!isStrictString(tvSymbol)) { throw new Error('tvSymbol_TO_GATE_Symbol()输入值非字符串形式') }
    // 2. 利用正则一步到位拦截加解构。
    // 这一行正则的意思是：匹配 “交易所:币种名称USDT.P”，且严格限制 USDT.P 必须死锁在字符串的末尾（$）
    const match = tvSymbol.match(/^([^:]+):(.+)USDT\.P$/);
    // 3. 如果格式不对，或者不是以 USDT.P 结尾的 U 本位永续合约，瞬间熔断
    if (!match) { throw new Error('非USDT本位合约, 必须是标准的 交易所:币种名称USDT.P 形式 ') }
    
    // 4. 完美提取。match[1] 是交易所名，match[2] 是绝对干净的 BaseCurrency
    const settle        = 'usdt'                        ;
    const currency      = 'USDT'                        ;
    const broker        = match[1]                      ;
    const basecurrency  = match[2]                      ; // 🟢 哪怕币名叫 AUSDT，由于正则锁死了末尾，这里依然能稳稳吐出 "AUSDT"
    const contract      = basecurrency + '_' + currency ;

    return {broker, basecurrency, currency, settle, contract} ; 
}

class GateFetchBody {
    constructor(isReal = false, method = 'GET', path = '', body = null, resOK = 200, dataCheck = {contract : 'BTC_USDT'}) {
        if (!isPlainObject(dataCheck)) {throw new Error('GateFetchBody输入的dataCheck不是标准的可验证对象')}
        // 每一个实例在诞生之初，就在自己的地盘上锁死了独立的变量空间
        this.isReal     = isReal    ;
        this.method     = method    ;
        this.path       = path      ;
        this.body       = body      ;
        this.resOK      = resOK     ;
        this.dataCheck  = dataCheck ;
        this.isOK       = false     ;
        this.resData    = undefined ;
        this.errMessage = undefined ;
    }
}

/**
 * 签名并网发送信息到交易所（GATE唯一请求入口）
 * @param {GateFetchBody} fetchBody 
 * @returns 因为try/catch, 不会抛出错误, 无论执行是否成功都会在传入的fetchBody上进行数据修改
 * @returns 修改后的数据已经是clean形式
 */
async function GATE_Fetch(fetchBody) {
    const isReal        =  fetchBody.isReal         ;
    const method        =  fetchBody.method         ;
    const path          =  fetchBody.path           ;
    const body          =  fetchBody.body           ;
    const resOK         =  fetchBody.resOK          ;
    const dataCheck     =  fetchBody.dataCheck      ;



    const GATE_PATH_version     = '/api/v4'                                     ;
    const GATE_simulate_Key     =  process.env.GATE_simulate_Key                ; 
    const GATE_simulate_Secret  =  process.env.GATE_simulate_Secret             ;
    const GATE_simulate_URL     =  'https://api-testnet.gateapi.io'             ;
    const GATE_real_Key         =  process.env.GATE_real_Key                    ;
    const GATE_real_Secret      =  process.env.GATE_real_Secret                 ;
    const GATE_real_URL         =  'https://api.gateio.ws'                      ;

    const GATE_Key     =  isStrictTrue(isReal) ? GATE_real_Key    : GATE_simulate_Key     ;
    const GATE_Secret  =  isStrictTrue(isReal) ? GATE_real_Secret : GATE_simulate_Secret  ;
    const GATE_URL     =  isStrictTrue(isReal) ? GATE_real_URL    : GATE_simulate_URL     ;

    const timestamp = Math.floor(Date.now() / 1000).toString(); // 秒级物理时空戳

    const fullPath  = GATE_PATH_version + path ;
    const url       = GATE_URL + fullPath ;


    try {
        // 签名处理（全项目唯一的一处加密逻辑）
        // APIv4 中签名字符串按照如下方式拼接生成：
        //      Request Method + "\n" + Request URL + "\n" + Query String + "\n" + HexEncode(SHA512(Request Payload)) + "\n" + Timestamp
        // Request Method
        //      请求方法，全大写, 如 POST, GET
        // Request URL
        //      请求 URL，不包括服务地址和端口，正确格式如: /api/v4/futures/orders
        // Query String
        //      没有使用 URL 编码的请求参数，请求参数在参与计算签名时的顺序一定要保证和实际请求里的顺序一致。 如 status=finished&limit=50 。 ; 如果没有请求参数，使用空字符串 ("")
        // HexEncode(SHA512(Request Payload))
        //      将请求体字符串使用 SHA512 哈希之后的结果。如果没有请求体，使用空字符串的哈希结果，即 cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e
        // Timestamp
        //      设置在请求头部 Timestamp 里的值
        // 下面是过程:

        // const { crypto } = await import('node:crypto');
        const crypto = (await import('node:crypto')).default || await import('node:crypto');

        // 刚性处理 Body 序列化
        const bodyString = body && method !== 'GET' ? JSON.stringify(body) : '' ;
        // 算出 Body 的 SHA512 哈希（GET 请求的 bodyString 为空，符合官方规范）
        const hashedBody = crypto.createHash('sha512').update(bodyString).digest('hex');
        // 刚性合拢 Gate 官方签名原文公式 (Method + "\n" + Path + "\n" + QueryString + "\n" + HashedBody + "\n" + Timestamp)
        const signString = `${method}\n${fullPath}\n\n${hashedBody}\n${timestamp}`;
        // 动用藏在 GCP 内存里的主权私钥进行 HMAC-SHA512 深度锻造
        const signature = crypto.createHmac('sha512', GATE_Secret).update(signString).digest('hex');
        // ==============================================================================

        // 2. 统一焊死最高级别的安全防护 Headers
        const options = {
            method: method                                  ,
            headers: {
                'Accept'        : 'application/json'    ,
                'Content-Type'  : 'application/json'    ,
                'KEY'           : GATE_Key              ,        // 明文公钥账号
                'SIGN'          : signature             ,        // 刚刚现场砸出来的铁血印章
                'Timestamp'     : timestamp             }   } ;  // 刚性防重放时空防线

        // 如果是 POST/PUT 动词，无缝注入 body 装弹
        if (method !== 'GET' && bodyString) { options.body = bodyString }

        const resp = await fetch(url, options);
        const data = CleanObjToNumBoolStr(await resp.json() )    ; //这里必须需要await

        if (resp.status === 400) { throw new Error(`GATE_Fetch Error: 无效请求`) }
        if (resp.status === 401) { throw new Error(`GATE_Fetch Error: 认证失败`) }
        if (resp.status === 404) { throw new Error(`GATE_Fetch Error: 未找到`) }
        if (resp.status === 429) { throw new Error(`GATE_Fetch Error: 请求过于频繁`) }
        if (resp.status >= 400 && resp.status < 500) { throw new Error(`GATE_Fetch Error: 未知错误`) }
        if (resp.status >= 500) { throw new Error(`GATE_Fetch Error: 服务器错误`) }
        if (resp.status !== resOK) {throw new Error(`GATE_Fetch Error: 未知错误`)}
        if (resp.status === resOK) {
            Object.keys(dataCheck).forEach( (k) => { if (data[k] !== dataCheck[k]) {throw new Error(`从交易所获取到的数据验证不通过: ${k} = ${data[k]}, != ${dataCheck[k]}`)} } ) ; 
            fetchBody.isOK     = true ;
            fetchBody.resData  = data ;
        }
    } catch (e) {
        fetchBody.isOK          =  false            ;
        fetchBody.errMessage    =  e.message.trim() ;
    }
}
// 当有了上面那个无缝签名的 gateProtectedFetch 大闸后，
// 你在外面的发单、对账、查统一账户资产的函数，瞬间变得像喝水一样简单利落：

/**
 * 
 * @param {object} S 
 * @returns 会抛出错误
 */
async function GATE_SendOrderToBroker(S) {
    const brokerSymbol  =  tvSymbol_TO_GATE_Symbol(S.TradingSymbol) ;

    // Get quanto_multiplier,  order_price_round
    const path_contract     = '/futures/' + brokerSymbol.settle + '/contracts/' + brokerSymbol.contract ;
    const fetchBody_contract = new GateFetchBody(S.isReal, 'GET', path_contract, null, 200, {name: brokerSymbol.contract}) ;
    await GATE_Fetch(fetchBody_contract) ;
    if (!fetchBody_contract.isOK) {throw new Error(fetchBody_contract.errMessage)}
    const data_contract = fetchBody_cancel.resData ;
    const quanto_multiplier   = ToStrictNumber(data_contract.quanto_multiplier) ;
    const order_price_round   = ToStrictNumber(data_contract.order_price_round) ;
    if (!isStrictNumber(quanto_multiplier) || quanto_multiplier <= 0) { throw new Error('did not get right quanto_multiplier')}
    if (!isStrictNumber(order_price_round) || order_price_round <= 0) { throw new Error('did not get right order_price_round')}

    ///////////////
    ////这里应该要检查当前保证金余额
    ///////////////

    const text  =  S.ing_buysell === CV.order_BUY ? 't-' + S.ing_orderID.replaceAll(':', '_') : S.ing_orderID ;
    const size  =  S.ing_buysell === CV.order_BUY ? Math.floor( S.ing_qty / quanto_multiplier) : -1 * Math.round( Math.abs(S.ing_qty) / quanto_multiplier) ;
    if ( Math.abs(size) < 1 ) {throw new Error('ing_qty is too small, cant trade')}
    S.ing_qty   =  S.ing_buysell === CV.order_BUY ? size * quanto_multiplier : S.ing_qty ;
    const price_mul =  S.ing_orderPrice / order_price_round ;
    S.ing_orderPrice = S.ing_buysell === CV.order_BUY ? order_price_round * Math.floor(price_mul) : order_price_round * Math.ceil(price_mul) ;
    const price = ToStrictString(S.ing_orderPrice) ;

    const orderBody = {} ;
    orderBody.text      =  text                         ;
    orderBody.contract  =  brokerSymbol.contract        ;
    orderBody.size      =  size                         ;
    orderBody.price     =  price                        ;
    if (S.ing_orderType === CV.order_T_MKT) {orderBody.price        = '0'   }
    if (S.ing_orderType === CV.order_T_MKT) {orderBody.tif          = 'ioc' }
    if (S.ing_buysell   === CV.order_SELL ) {orderBody.reduce_only  = true  }

    // 合约交易下单:
    // POST /futures/{settle}/orders
    const path_order  =  '/futures/' + brokerSymbol.settle + '/orders'  ;
    const fetchBody_order = new GateFetchBody(S.isReal, 'POST', path_order, orderBody, 201, {text}) ;
    await GATE_Fetch(fetchBody_order) ;
    if (!fetchBody_order.isOK) {throw new Error('下单失败: ' + fetchBody_order.errMessage)}
    const data_order = fetchBody_order.resData ;

    S.ing_orderID		    = data_order.text               ;
    S.ing_orderTimestamp    = Math.floor(data_order.create_time * 1000) ;
    S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp) ;    
    S.ing_orderStatus		= CV.order_waiting      ; // 按照现在的逻辑, 下单成功后, 暂时先不管交易所真实返回的订单状态, 一律按照waiting来记录
}

/**
 * 
 * @param {object} ingOrderData 
 * @returns 会抛出错误
 */
async function GATE_CheckOrderConfirm(ingOrderData) {
    const brokerSymbol  =  tvSymbol_TO_GATE_Symbol(ingOrderData.TradingSymbol) ;

    // 如果需要撤单的话, 先去撤单
    // DELETE /futures/{settle}/orders/{order_id}
    // 如果有成交的话, 标记confirm, 并修改下单量
    // 只有完全没有成交的情况才会返回order_cancel
    if ( isStrictTrue(ingOrderData.ifWaitingThenCancel) ) {
        const path_cancel   =  '/futures/' + brokerSymbol.settle + '/orders/' + ingOrderData.ing_orderID ;
        const fetchBody_cancel = new GateFetchBody(ingOrderData.isReal, 'DELETE', path_cancel, null, 200, {text: ingOrderData.ing_orderID}) ;
        await GATE_Fetch(fetchBody_cancel) ;
        if (!fetchBody_cancel.isOK) {throw new Error(fetchBody_cancel.errMessage)}
        const data_cancel = fetchBody_cancel.resData ;

        const abs_left = Math.abs(data_cancel.left) ;
        const abs_size = Math.abs(data_cancel.size) ;
        ingOrderData.ing_partial = data_cancel.status === 'finished' ? 1 : (abs_size - abs_left) / abs_size ;
        const toSet_confirm = ingOrderData.ing_partial < 0.001 ? false : true ; // 将计算成交量小于 千分之一 的情况设为没有成交, 其他情况均按照有成交计算, 避免浮点数对比计算出错
        
        if (toSet_confirm) {
            ingOrderData.ing_orderStatus        = CV.order_confirm                                                          ;
            ingOrderData.ing_qty                = ingOrderData.ing_qty * ingOrderData.ing_partial                           ;
            ingOrderData.ing_isPartial          = data_cancel.status === 'finished' ? undefined : ingOrderData.ing_partial  ;
            ingOrderData.ing_confirmTimestamp   = Math.floor( ( data_confirm?.finish_time??(Date.now()/1000) ) * 1000)      ;
            ingOrderData.ing_confirmDate		= GetTimeStringWithOffset(8, ingOrderData.ing_confirmTimestamp)             ;
            ingOrderData.ing_confirmPrice		= data_confirm.fill_price                                                   ;
            ingOrderData.ing_pXq                = ingOrderData.ing_confirmPrice * ingOrderData.ing_qty                      ; // 实际上只取买单成交的值, 对于卖单成交, 即使算出来也不关注
        } else {
            ingOrderData.ing_orderStatus        = CV.order_cancel                                                           ; // 对于撤单只有这个值是有意义的
            ingOrderData.ing_qty                = 0                                                                         ; // 这个值无意义
            ingOrderData.ing_confirmTimestamp   = Date.now()                                                                ; // 这个值无意义
            ingOrderData.ing_confirmDate		= GetTimeStringWithOffset(8, ingOrderData.ing_confirmTimestamp)             ; // 这个值无意义
            ingOrderData.ing_confirmPrice		= data_confirm.fill_price                                                   ; // 可能是0, 反正这个值也无意义
            ingOrderData.ing_pXq                = ingOrderData.ing_confirmPrice * ingOrderData.ing_qty                      ; // 这个值必然是0或undefined, 无意义
        }

    } else { 
        // 如果不撤单单的话, 去查看是否有新的成交记录
        // GET  '/futures/{settle}/orders/{order_id}'
        const path_confirm      =  '/futures/' + brokerSymbol.settle + '/orders/' + ingOrderData.ing_orderID ;
        const fetchBody_confirm =  new GateFetchBody(ingOrderData.isReal, 'GET', path_confirm, null, 200, {text: ingOrderData.ing_orderID}) ;
        await GATE_Fetch(fetchBody_confirm) ;
        if (!fetchBody_confirm.isOK) {throw new Error(fetchBody_confirm.errMessage)}
        const data_confirm = fetchBody_confirm.resData ;

        const abs_left = Math.abs(data_confirm.left) ;
        const abs_size = Math.abs(data_confirm.size) ;
        if ( data_confirm.status === 'open' && abs_left < abs_size )  {
            ingOrderData.ing_orderStatus =  CV.order_partial                    ;
            ingOrderData.lst_partial     =  ingOrderData.ing_partial            ;
            ingOrderData.ing_partial     =  (abs_size - abs_left) / abs_size    ;
        }
        if (data_confirm.status === 'finished') {
            ingOrderData.ing_orderStatus		= CV.order_confirm                                              ;
            ingOrderData.ing_confirmTimestamp   = Math.floor(data_confirm.finish_time * 1000)                   ;
            ingOrderData.ing_confirmDate		= GetTimeStringWithOffset(8, ingOrderData.ing_confirmTimestamp) ;
            ingOrderData.ing_confirmPrice		= data_confirm.fill_price                                       ;
            ingOrderData.ing_pXq                = ingOrderData.ing_confirmPrice * ingOrderData.ing_qty          ; // 实际上只取买单成交的值, 对于卖单成交, 即使算出来也不关注
        }

    }

    // 再去查看当前的仓位信息
    // 获取单个仓位信息:    GET  /futures/{settle}/positions/{contract}
    // » size	        string	头寸大小
    // » entry_price	string	开仓价格  // 猜测就是均价
    // » realised_pnl   string	已实现盈亏，该仓位产生的所有平仓结算、资金费结算、手续费支出的资金流水之和
    // » pnl_pnl	    string	已实现盈亏中的平仓结算盈亏
    // » pnl_fund	    string	已实现盈亏中的资金费结算盈亏
    // » pnl_fee	    string	已实现盈亏中的总手续费支出
    const path_position  =  '/futures/' + brokerSymbol.settle + '/positions/' + brokerSymbol.contract ;
    const fetchBody_position = new GateFetchBody(ingOrderData.isReal, 'GET', path_position, null, 200, {contract: brokerSymbol.contract}) ;
    await GATE_Fetch(fetchBody_position) ;
    if (!fetchBody_position.isOK) {throw new Error(fetchBody_position.errMessage)}
    const data_position = fetchBody_position.resData ;

    ingOrderData.ing_getProfit      =  data_position.pnl_pnl - ingOrderData.lst_allGotProfit                                                                    ;
    ingOrderData.ing_tradeFee       =  data_position.pnl_fee - ingOrderData.lst_allTradeFee                                                                     ;
    ingOrderData.ing_avgBuyPrice    =  data_position.entry_price                                                                                                ;
    ingOrderData.ing_allFund	    =  ingOrderData.inFund + ToStrictNumber(data_position.unrealised_pnl, 0) + ToStrictNumber(data_position.realised_pnl, 0) + ingOrderData.inCoin * ingOrderData.BaseCoinPrice  ;
    ingOrderData.ing_allCoin	    =  ingOrderData.ing_allFund / ingOrderData.BaseCoinPrice                                                                    ;
}

/**
 * 
 * @param {object} fund 
 * @returns 会抛出错误
 */
async function GATE_CheckFundFee(fund) {
    const brokerSymbol  =  tvSymbol_TO_GATE_Symbol(fund.TradingSymbol) ;

    // 再去查看当前的仓位信息
    // 获取单个仓位信息:    GET  /futures/{settle}/positions/{contract}
    // » size	        string	头寸大小
    // » entry_price	string	开仓价格  // 猜测就是均价
    // » realised_pnl   string	已实现盈亏，该仓位产生的所有平仓结算、资金费结算、手续费支出的资金流水之和
    // » pnl_pnl	    string	已实现盈亏中的平仓结算盈亏
    // » pnl_fund	    string	已实现盈亏中的资金费结算盈亏
    // » pnl_fee	    string	已实现盈亏中的总手续费支出
    const path_position  =  '/futures/' + brokerSymbol.settle + '/positions/' + brokerSymbol.contract ;

    const fetchBody = new GateFetchBody(fund.isReal, 'GET', path_position, null, 200, {contract: brokerSymbol.contract}) ;
    await GATE_Fetch(fetchBody) ;
    if (!fetchBody.isOK) {throw new Error(fetchBody.errMessage)}
    const data_position = fetchBody.resData ;

    fund.fundFee            =  ToStrictNumber(data_position.pnl_fund, 0) -  fund.lst_allFundFee                                                                                 ;
    fund.confirmTimestamp   =  Date.now()                                                                                                                                       ;
    fund.confirmDate        =  GetTimeStringWithOffset(8, fund.confirmTimestamp)                                                                                                ;
    fund.allFund	        =  fund.inFund + ToStrictNumber(data_position.unrealised_pnl, 0) + ToStrictNumber(data_position.realised_pnl, 0) + fund.inCoin * fund.BaseCoinPrice ;
    fund.allCoin	        =  fund.allFund / fund.BaseCoinPrice                                                                                                                ;
}

//#endregion


















///////////////////
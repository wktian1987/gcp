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
    A2dToCleanObj
} from "./utility.js";

const   noLOCK          =  "noLOCK"         ;
const   NA              =  "NA"             ;
const   toGCPRanges     =  "toGCP!A:B"      ;
const   HuanHang        =  "__HuangHang__"  ;
const   order_T_LMT     =  "LMT"            ;
const   order_T_MKT     =  "MKT"            ; 
const   order_BUY       =  "B"              ;
const   order_SELL      =  "S"              ;
const   order_FUND      =  "F"              ;
const   order_pending   =  "pending"        ;
const   order_waiting   =  "waiting"        ;
const   order_confirm   =  "confirm"        ;
const   order_partial   =  'partial'        ;
const   order_cancel    =  "cancel"         ;

/**
 * 将 TV 信号 Symbol 转换为交易所标准 Symbol 矩阵（高频提纯版）
 * @param {string} tvSymbol 例: "GATE:BTCUSDT.P"
 * @returns {object|false}
 */
function tvSymbol_TO_brokerSymbol(tvSymbol) {
    // 1. 一线风控：强类型校验（防御 Null 或 Undefined 穿透）
    if (!isStrictString(tvSymbol)) { return false; }
    // 2. 利用正则一步到位拦截加解构。
    // 这一行正则的意思是：匹配 “交易所:币种名称USDT.P”，且严格限制 USDT.P 必须死锁在字符串的末尾（$）
    const match = tvSymbol.match(/^([^:]+):(.+)USDT\.P$/);
    // 3. 如果格式不对，或者不是以 USDT.P 结尾的 U 本位永续合约，瞬间熔断
    if (!match) { return false; }
    
    // 4. 完美提取。match[1] 是交易所名，match[2] 是绝对干净的 BaseCurrency
    return {
        broker: match[1],
        basecurrency: match[2], // 🟢 哪怕币名叫 AUSDT，由于正则锁死了末尾，这里依然能稳稳吐出 "AUSDT"
        currency: 'USDT',
        settle: 'usdt'
    };
}

//#region - Basic Broker interface

export async function SendOrderToBroker(S, isReal, TradingSymbol, sheets, spreadsheetID) {
    if (!isStrictFalse(isReal) && TradingSymbol.startsWith("GATE:")) {return await GATE_SendOrderToBroker(isReal, S, TradingSymbol) }

    const simRange_00 = 'simBroker!A30:B'   ;
    const simRange_01 = 'simBroker!A1:B29'  ;

    await BatchClearUpdateGS(sheets, spreadsheetID, [{range:simRange_00, values: ObjToA2dNumBoolStr(S)}]) ; // 发送交易
    
    const res_broker    =  A2dToCleanObj(await GetGS(sheets, spreadsheetID, simRange_01 ) )  ; //交易状态返回

    S.ing_orderID		    = res_broker.orderID        ;
    S.ing_orderStatus		= res_broker.orderStatus    ;
    S.ing_partial           = 0                         ;

    return S ;
}

export async function CheckOrderConfirm(ingOrderData, isReal, TradingSymbol, sheets, spreadsheetID) { 
    if (!isStrictFalse(isReal) && TradingSymbol.startsWith("GATE:")) {return await GATE_CheckOrderConfirm(isReal, ingOrderData, TradingSymbol) ;}

    
    const simRange_00 = 'simBroker!A30:B'   ;
    const simRange_01 = 'simBroker!A1:B29'  ;

    // 无论是要取消交易, 都要首先查看现在的交易状态
    // 在模拟交易中, 没有 部分成交 这种情况 
    const res   = CleanObjToNumBoolStr(Object.fromEntries(await GetGS(sheets, spreadsheetID, simRange_01 ))) ;
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

        await ClearGS(sheets, spreadsheetID, simRange_00) ;

        return ingOrderData  ;
    } 

    // 在模拟交易中, 没有 部分成交 这种情况 
    if ( isStrictTrue(ingOrderData.ifWaitingThenCancel) ) {
        await ClearGS(sheets, spreadsheetID, simRange_00) ;

        return {ing_orderStatus: "cancel"} ;
    }

    return {}  ;
}

export async function CheckFundFee(S, isReal, TradingSymbol, sheets, spreadsheetID) {
    if (!isStrictFalse(isReal) && TradingSymbol.startsWith("GATE:")) {return await GATE_CheckFundFee(isReal, S, TradingSymbol) ;}

    const res                =  CleanObjToNumBoolStr(Object.fromEntries(await GetGS(sheets, spreadsheetID, 'simBroker!A1:B29'))) ;
    S.fund_fundFee           =  typeof res.fundFee === 'number'  ?  res.fundFee  :  0   ;
    S.fund_confirmDate       =  S.fund_orderDate        ;
    S.fund_confirmTimestamp  =  S.fund_orderTimestamp   ;
    S.fund_allFund           =  res.allFund + S.fund_fundFee  ;
    S.fund_allCoin           =  S.fund_allFund / res.BaseCoinPrice  ;

   
    return S  ;
}

//#endregion


//#region - Gate
// 实盘交易: https://api.gateio.ws
// 模拟交易：https://api-testnet.gateapi.io
// 现在的版本为: /api/v4
// 是否是实盘交易, 只有isStrictTrue(isReal)是实盘交易, 其他全是模拟盘


/**
 * 签名并网发送信息到交易所（GATE唯一请求入口）
 * @param {*} isReal - 是否是实盘交易, 只有isStrictTrue(isReal)是实盘交易, 其他全是模拟盘
 * @param {string} method - REST 铁血动词 ('GET', 'POST', 'DELETE')
 * @param {string} path - 交易所物理路径 (例如 '/api/v4/futures/usdt/orders')
 * @param {Object|null} body - 传给交易所的 JSON 参数对象 (GET 请求传 null)
 */
async function GATE_Fetch(isReal, method, path, body = null) {
    // const { crypto } = await import('node:crypto');
    const crypto = (await import('node:crypto')).default || await import('node:crypto');

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

    // 3. 原生大炮轰鸣出海
    const response = await fetch(url, options);
    
    if (response.status === 400) {throw new Error(`GATE_Fetch Error: 无效请求`      ) }
    if (response.status === 401) {throw new Error(`GATE_Fetch Error: 认证失败`      ) }
    if (response.status === 404) {throw new Error(`GATE_Fetch Error: 未找到`        ) }
    if (response.status === 429) {throw new Error(`GATE_Fetch Error: 请求过于频繁`  ) }
    if (response.status >=  400 && response.status < 500) {throw new Error(`GATE_Fetch Error: 未知错误`) }
    if (response.status >=  500) {throw new Error(`GATE_Fetch Error: 服务器错误`) }

    return response; // 将满血的回执抛给上游具体业务去解包
}
// 当有了上面那个无缝签名的 gateProtectedFetch 大闸后，
// 你在外面的发单、对账、查统一账户资产的函数，瞬间变得像喝水一样简单利落：

async function GATE_SendOrderToBroker(isReal, S, TradingSymbol) {
    const brokerSymbol  =  tvSymbol_TO_brokerSymbol(TradingSymbol) ;
    const contract      =  brokerSymbol.basecurrency + '_' + brokerSymbol.currency ;

    // Get quanto_multiplier = 0.01
    const path_contract     = '/futures/' + brokerSymbol.settle + '/contracts/' + contract ;
    const resp_contract     = await GATE_Fetch (isReal, 'GET', path_contract) ;
    const data_contract     = await resp_contract.json() ;
    const quanto_multiplier   = ToStrictNumber(data_contract.quanto_multiplier) ;
    const order_price_round   = ToStrictNumber(data_contract.order_price_round) ;
    if (!isStrictNumber(quanto_multiplier) || quanto_multiplier <= 0) { throw new Error('did not get right quanto_multiplier')}
    const sizeNumber = Math.floor(S.ing_qty / quanto_multiplier) ;
    S.ing_qty   =  sizeNumber * quanto_multiplier ;
    if (sizeNumber <= 0) {throw new Error('ing_qty is too small, cant trade')}
    const size = ToStrictString(Math.floor(S.ing_qty / quanto_multiplier)) ;
    ///////////////
    ////这里应该要检查当前保证金余额
    //

    const orderID   =  't-' + S.ing_orderID.replaceAll(':', '_') ;
    const price_mul = S.ing_orderPrice/order_price_round ;
    const price     =  ToStrictString( S.ing_buysell === order_BUY ? order_price_round * Math.floor(price_mul) : order_price_round * Math.ceil(price_mul)) ;

    const orderBody = {} ;
    orderBody.contract  =  contract     ;
    orderBody.size      =  size         ;
    orderBody.price     =  price        ;
    if (S.ing_orderType === order_T_MKT) {orderBody.price = '0'}
    if (S.ing_buysell.includes('S')) {orderBody.reduce_only = true}
    if (S.ing_orderType === order_T_MKT) {orderBody.tif = 'ioc'}
    orderBody.text      =  orderID      ;

    // 合约交易下单:
    // POST /futures/{settle}/orders
    const path_order  =  '/futures/' + brokerSymbol.settle + '/orders'  ;
    const resp_order  =  await GATE_Fetch(isReal, 'POST', path_order, orderBody)  ;
    const data_order  =  CleanObjToNumBoolStr(await resp_order.json() )    ; //这里必须需要await
    if (resp_order.status !== 201)   {throw new Error(`order ${orderID} 下单失败 1`)}
    if (data_order.text !== orderID) {throw new Error(`order ${orderID} 下单失败 2`)}

    S.ing_orderID		    = data_order.text               ;
    S.ing_orderTimestamp    = Math.floor(data_order.create_time * 1000) ;
    S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp) ;    
    S.ing_orderStatus		= data_order.order_waiting      ; // 按照现在的逻辑, 下单成功后, 暂时先不管交易所真实返回的订单状态, 一律按照waiting来记录
    S.ing_partial           = 0  ;

    return S ;
}

async function GATE_CheckOrderConfirm(isReal, ingOrderData, TradingSymbol) {
    const brokerSymbol  =  tvSymbol_TO_brokerSymbol(TradingSymbol) ;
    const contract      =  brokerSymbol.basecurrency + '_' + brokerSymbol.currency ;

    // 如果需要撤单的话, 先去撤单
    // DELETE /futures/{settle}/orders/{order_id}
    if ( isStrictTrue(ingOrderData.ifWaitingThenCancel) ) {
        const path_cancel   =  '/futures/' + brokerSymbol.settle + '/orders/' + ingOrderData.ing_orderID ;
        const resp_cancel   =  await GATE_Fetch(isReal, 'DELETE', path_cancel)    ;
        const data_cancel   =  CleanObjToNumBoolStr( await resp_cancel.json() ) ;
        if (resp_cancel.status !== 200) {throw new Error(`order ${ingOrderData.ing_orderID} 撤单失败 1`) }
        if (data_cancel.text !== ingOrderData.ing_orderID) {throw new Error(`order ${ingOrderData.ing_orderID} 撤单失败 2` ) }

        ingOrderData.ing_orderStatus        = data_cancel.status === 'finished' && data_cancel.left === 0 ? order_confirm : order_cancel    ;
        ingOrderData.ing_confirmTimestamp   = Math.floor( ( data_confirm.finish_time || (Date.now()/1000) ) * 1000)                         ;
        ingOrderData.ing_confirmDate		= GetTimeStringWithOffset(8, ingOrderData.ing_confirmTimestamp)                                 ;
        ingOrderData.ing_confirmPrice		= data_confirm.fill_price                                                                       ;
        ingOrderData.ing_pXq                = ingOrderData.ing_confirmPrice * ingOrderData.ing_qty                                          ; // 实际上只取买单成交的值, 对于卖单成交, 即使算出来也不关注

    } else { // 如果不撤单单的话, 去查看是否有新的成交记录
        // GET  '/futures/{settle}/orders/{order_id}'
        const path_confirm      =  '/futures/' + brokerSymbol.settle + '/orders/' + ingOrderData.ing_orderID ;
        const resp_confirm      =  await GATE_Fetch(isReal, 'GET', path_confirm)    ;
        const data_confirm      =  CleanObjToNumBoolStr( await resp_confirm.json() ) ;
        if (resp_confirm.status !== 200) {throw new Error(`order ${ingOrderData.ing_orderID} 查询失败 1`) }
        if (data_confirm.text !== ingOrderData.ing_orderID) {throw new Error(`order ${ingOrderData.ing_orderID} 查询失败 2` ) }

        if ( data_confirm.status === 'open' && Math.abs(data_confirm.left) < Math.abs(data_confirm.size) ) {
            ingOrderData.ing_orderStatus =  order_partial ;
            ingOrderData.ing_partial     =  (Math.abs(data_confirm.size) - Math.abs(data_confirm.left)) / Math.abs(data_confirm.size) ;
            return ingOrderData ;
        }

        if (data_confirm.status === 'finished') {
            ingOrderData.ing_orderStatus		= order_confirm                                                 ;
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
    const path_position  =  '/futures/' + brokerSymbol.settle + '/positions/' + contract ;
    const resp_position  =  await GATE_Fetch(isReal, 'GET', path_position) ;
    const data_position  =  CleanObjToNumBoolStr( await resp_position.json() ) ;
    if (resp_position.status !== 200) {throw new Error(`position ${contract} 查询失败 1`) }
    if (data_position.contract !== contract) {throw new Error(`position ${contract} 查询失败 2`) }

    ingOrderData.ing_getProfit      =  data_position.pnl_pnl - ingOrderData.lst_allGotProfit                                                                    ;
    ingOrderData.ing_tradeFee       =  data_position.pnl_fee - ingOrderData.lst_allTradeFee                                                                     ;
    ingOrderData.ing_avgBuyPrice    =  data_position.entry_price                                                                                                ;
    ingOrderData.ing_allFund	    =  ingOrderData.inFund + ToStrictNumber(data_position.unrealised_pnl, 0) + ToStrictNumber(data_position.realised_pnl, 0) + ingOrderData.inCoin * ingOrderData.BaseCoinPrice  ;
    ingOrderData.ing_allCoin	    =  ingOrderData.ing_allFund / ingOrderData.BaseCoinPrice                                                                    ;

    return ingOrderData ;
}

async function GATE_CheckFundFee(isReal, S, TradingSymbol) {
    const brokerSymbol  =  tvSymbol_TO_brokerSymbol(TradingSymbol) ;
    const contract      =  brokerSymbol.basecurrency + '_' + brokerSymbol.currency ;

    // 再去查看当前的仓位信息
    // 获取单个仓位信息:    GET  /futures/{settle}/positions/{contract}
    // » size	        string	头寸大小
    // » entry_price	string	开仓价格  // 猜测就是均价
    // » realised_pnl   string	已实现盈亏，该仓位产生的所有平仓结算、资金费结算、手续费支出的资金流水之和
    // » pnl_pnl	    string	已实现盈亏中的平仓结算盈亏
    // » pnl_fund	    string	已实现盈亏中的资金费结算盈亏
    // » pnl_fee	    string	已实现盈亏中的总手续费支出
    const path_position  =  '/futures/' + brokerSymbol.settle + '/positions/' + contract ;
    const resp_position  =  await GATE_Fetch(isReal, 'GET', path_position) ;
    const data_position  =  CleanObjToNumBoolStr( await resp_position.json() ) ;
    if (resp_position.status !== 200) {throw new Error(`position ${contract} 查询失败 1`) }
    if (data_position.contract !== contract) {throw new Error(`position ${contract} 查询失败 2`) }

    S.fund_fundFee           =  ToStrictNumber(data_position.pnl_fund, 0) -  S.fund_lst_allFundFee  ;
    S.fund_confirmTimestamp  =  Date.now()                                                          ;
    S.fund_confirmDate       =  GetTimeStringWithOffset(8, S.fund_confirmTimestamp)                 ;
    S.fund_allFund	         =  S.fund_inFund + ToStrictNumber(data_position.unrealised_pnl, 0) + ToStrictNumber(data_position.realised_pnl, 0) + S.fund_inCoin * S.fund_BaseCoinPrice ;
    S.fund_allCoin	         =  S.fund_allFund / S.fund_BaseCoinPrice                               ;

    return S  ;
}




//#endregion


















///////////////////
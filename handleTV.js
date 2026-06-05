import {    isStrictNumber                  ,
            isStrictBoolean                 ,
            isStrictTrue                    ,
            isStrictFalse                   , 
            isStrictString                  ,
            isStrictSet                     ,
            isPlainObject                   ,
            ToStrictNumber                  ,
            ToStrictString                  ,
            ToStrictNumBoolStr              , 
            CleanObjToNumBoolStr            ,
            CleanArrayToNumStrBool          ,
            A2dToObj                        ,
            A2LinesToObj                    ,
            ObjToA2dNumBoolStr              ,
            AddMessage                      ,
            GetTimeStringWithOffset         , 
            SendSplitTGMessages             ,
            FormatMatrixToString            ,            
            GetSpreadsheetID                ,
            GetGS                           ,         
            UpdateGS                        ,
            AppendGS                        ,
            BatchClearGS                    ,
            BatchClearUpdateGS              ,
            BatchGetGS                      ,
            ClearGS                         ,
            ConvertRowsToHtmlTable          ,
            SendEmail,                       
            Sleep} from "./utility.js";

import {    SendOrderToBroker               ,
            CheckOrderConfirm               ,               
            CheckFundFee                    } from "./broker.js";    

import { google } from 'googleapis';
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });


const   accStatus_liquidated                =  "liquidated"     ;
const   accStatus_stopC                     =  "stopC"          ;
const   accStatus_stopF                     =  "stopF"          ;
const   accStatus_stopCF                    =  "stopCF"         ;

const   BuyReason_belowTarget               =  "below targetLow"                            ;

const   SellReason_aboveTarget              =  "above targetHigh"                           ;
const   SellReason_enoughProfit             =  "get enough profit"                          ;
const   SellReason_stop4C                   =  "stop loss below highestCoin too much"       ;
const   SellReason_stop4F                   =  "stop loss below highestFund too much"       ;
const   SellReason_liquidate                =  "liquidation sell"                           ;
const   SellReason_cutBfLiquid              =  "cut before liquidation"                     ;
const   SellReason_cutHighBuyOrder          =  "cut order with too high buyPrice"           ;

const   NotBuySellReason_notInCanTrdTime    =  "not in can trading time"                    ;
const   NotBuySellReason_waitLast           =  "wait for last trading end"                  ;
const   NotBuySellReason_justTrade          =  "just a trade executed and need wait"        ;
const   NotBuySellReason_liquidate          =  "already liquidated"                         ;

const   NotBuyReason_notBuySell             =  "cant buy sell "                             ;
const   NotBuyReason_aboveLastUnclose       =  "above lastUncloseOrder.buyPrice"            ;
const   NotBuyReason_sellthisTime           =  "this time has sell/liquid order"            ;
const   NotBuyReason_difctyLimit            =  "cant buy due to gridDifficulty"             ;
const   NotBuyReason_aboveHighToBuy         =  "above highestToBuyPrice"                    ;
const   NotBuyReason_belowLowToBuy          =  "below lowestToBuyPrice"                     ;
const   NotBuyReason_closeToRndHigh         =  "close to roundHigh"                         ;
const   NotBuyReason_closeToRndLow          =  "close to roundLow"                          ;
const   NotBuyReason_noAdqtFund             =  "no adequate fund to buy"                    ;
const   NotBuyReason_maxEnExTooSmall        =  "after calculate maxEnExPosition too small"  ;
const   NotBuyReason_overMaxGridN           =  "account.gridNum over maxGridNumber"         ;
const   NotBuyReason_stopTriggered          =  "stop loss triggered"                        ;
const   NotBuyReason_closeToliquidWarn      =  "close to liquidation warning"               ;
const   NotBuyReason_closeToStop            =  "close to stopF or stopC"                    ;

const   NotSellReason_notBuySell            =  "cant buy sell "                             ;
const   NotSellReason_noPosition            =  "no positions"                               ;
const   NotSellReason_belowLowToSell        =  "below lowestToSellPrice"                    ;
const   NotSellReason_cantProfit            =  "cant get enough Profit"                     ;

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


export async function HandleTV(raw_tvData) {

    const D = {
        sheets                  : sheets        ,
        toUpdateRangeList       : []            ,
        toClearRangeSet         : new Set()     ,
        alertMessageSet         : new Set()     ,
        runningWellSet          : new Set()     , // 每次有运行中的错误都写入这个Set, 所以可以根据isRunningWell()来判断是否有错误发生

        /**
         * 依据runningWellSet中是否有元素来判断是否有运行错误
         * @returns true: 运行中无错误
         * @returns false: 运行中有错误
         */
        isRunningWell() {
            return this.runningWellSet.size === 0 ;
        } ,

        /**
        * 添加新的报警行; 
        * 如果发现新进来的警报在历史缓存里有重名的, 先无情抹杀掉旧的占位; 
        * 刷新到整个集合的最底部（最新时间线）; 
        * 如果确认输入的两个参数值都是正确的格式(Set, String)的话, 可以不验证使用
        * @param {Set} messageSet 
        * @param {string} newMessageLine 
        * @returns Set: 表示成功并返回添加新元素后Set的本身
        * @returns string: 表示错误信息
        */
        AddAlertMessage(messageSet, newMessageLine) {
            if (!isStrictSet(messageSet)) { return 'AddAlertMessage Error: oldMessageSet is not strictSet' } 
            if (!isStrictString(newMessageLine)) { return 'AddAlertMessage Error: newMessage is not strictString' }
            const cleanMsg = newMessageLine.trim();
            // 核心防线：如果发现新进来的警报在历史缓存里有重名的, 先无情抹杀掉旧的占位！
            if (messageSet.has(cleanMsg)) { messageSet.delete(cleanMsg) }
            // 重新 add。因为 Set 严格按插入顺序排列，这一步会强行把这条重复的最新警报，刷新到整个集合的最底部（最新时间线）！
            return messageSet.add(cleanMsg) ;
        } ,

        /**
         * 对来自TV的原始数据对象rawTVData进行校验,并进行CleanObjToNumBoolString ; 
         * 注意：得到一个新的对象, 并不是在原对象rawTVData进行修改, 原始对象除thisAlertMessage外原封不动 ; 
         * 之所以修改原始对象rawTVData的thisAlertMessage是因为这个属性, 本来就是为了传输做了修改, 这里是改为它本应的样子 ; 
         * @param {Object} raw_tvData 来自TV的原始数据
         * @returns 1个新对象
         * @returns String表示运行中的错误
         */
        Get_tvData(raw_tvData) {
            const errPrefix = 'clean_tvData Error: ' ;

            if (!isPlainObject(raw_tvData)) {
                return errPrefix + "rawTVData is not plain Object" ;
            }
            if (isStrictString(raw_tvData.thisAlertMessage)) {
                raw_tvData.thisAlertMessage = raw_tvData.thisAlertMessage.replaceAll(HuanHang, '\n').trim() ;
                this.AddAlertMessage(this.alertMessageSet, raw_tvData.thisAlertMessage) ;
                delete raw_tvData.thisAlertMessage ;
            } else {
                return errPrefix + "rawTVData thisAlertMessage no content" ;
            }

            return CleanObjToNumBoolStr(raw_tvData)  ;
        } ,

        /**
         * 获取spreadsheetID 并写入到this大对象中 
         * @async
         * @param {String} botNumber 
         * @returns 无返回值, 若有返回值则说明运行错误
         * @returns String 说明运行错误, 但这只是一种错误类型 
         * @returns 另一种错误类型说明调用GetSpreadsheetID()出错, 需要上层调用者用catch捕获
         */
        async Set_spreadsheetID(botNumber) {
            if (!isStrictString(botNumber)) {return 'Set_spreadsheetID Error: @param botNumber not available string'}
            this.spreadsheetID = await GetSpreadsheetID(botNumber, this.sheets) 
        } ,

        /**
         * 设置this.lockName, 依据TV数据的时间戳
         * @param {Number} tv_timestamp 
         * @returns 无返回值, 默认不会出错, 因为这个函数运行的前提是调用它的函数前面不会出错. 
         */
        Set_lockName(tv_timestamp) { 
            this.lockName = 'T' + String(tv_timestamp) ;
        } ,

        /**
         * 获取当前toGCPData
         * @returns {Promise<Object>}
         */
        async Get_toGCPData() {
            return A2dToObj(await GetGS(this.sheets, this.spreadsheetID, toGCPRanges)) ;
        } ,

        /**
         * 检测当前GS中分布式锁的真实归属,
         * @returns {Promise<String>} String: 当前的lockName
         */
        async CheckLockFromGS() {
            const toGCPData = await this.Get_toGCPData() ;
            return toGCPData.LOCK ;
        } ,

        /**
         * 分布式碰撞抢锁：抢占排他性写锁，带高频自旋重试机制
         * @async
         * @param {number} tv_timestamp 当前的信号时间戳
         * @param {number} [cantSetAfter=30000] 当前时间超过多少时便不能再获得锁权限
         * @returns {boolean} true : 抢锁成功返回
         * @returns {String} String: 失败或超时熔断返回原因
         */
        async SetLockToGS(tv_timestamp, cantSetAfter = 30000) {
            if (!isStrictString(this.lockName) || !this.lockName.startsWith('T')) {return 'SetLockToGS Error: this.lockName 未设置或设置错误'}
            if (!isStrictNumber(tv_timestamp)  || !isStrictNumber(cantSetAfter) ) {return 'SetLockToGS Error: input @param 错误'}

            while (Date.now() < tv_timestamp + cantSetAfter) {
                const toGCPData     = await this.Get_toGCPData() ;
                const currentLock   = toGCPData.LOCK ;
                if (currentLock === noLOCK) {
                    await UpdateGS(this.sheets, this.spreadsheetID, toGCPData.lockRange, [[this.lockName]]) ;
                    await Sleep(2000) ; // 等两秒后再确认是否成功, 防止同时有两个信号抢锁
                    const checkWon = await this.CheckLockFromGS() === this.lockName ;
                    if (isStrictTrue(checkWon)) {return true}
                    if (isStrictFalse(checkWon)) {return 'SetLockToGS Error: 锁被其他几乎同时到达的信号抢去'}
                }
                if (tv_timestamp < toGCPData.lstLockSignalTime) {return 'SetLockToGS Error: 更新更近的信号已被处理, 忽略本次信号'}
                if (currentLock !== noLOCK && isStrictString(currentLock) && currentLock.startsWith('T')) {
                    const currentLockTime = ToStrictNumber(currentLock.split('T')[1]) ;
                    if (isStrictNumber(currentLockTime) && currentLockTime > tv_timestamp) {
                        return  'SetLockToGS Error: 无法为当前信号设锁, 因为现有锁时间在当前信号之后';
                    }

                }
                await Sleep(1000) ;
            } 

            return 'SetLockToGS Error: 已过抢锁时间' ;
        } ,

        /**
         * 释放分布式排他锁
         * @returns {Promise<boolean>} true:   解锁成功返回
         * @returns                    String: 明确的出错信息
         */
        async ReleaseLockOfGS() {
            // 确权拦截：先看自己现在还有没有解锁的权力（防止自己超时被别人强刷后，误把别人的锁给解了）
            // 这种情况一旦发生, 说明运行有了问题, 需要处理
            const toGCPData     =  await this.Get_toGCPData() ;
            const currentLock   =  toGCPData.LOCK ;
            const hasRight      =  currentLock === this.lockName ;
            if (isStrictFalse(hasRight)) { return 'ReleaseLockOfGS Error: 当前锁状态出错，并不是正在处理轮的锁，出现系统错误' }

            const MAX_Attempts  = 5 ;
            let   attempt       = 1  ;
            while (attempt <= MAX_Attempts) {
                try {
                    await UpdateGS(this.sheets, this.spreadsheetID, toGCPData.lockRange, [[noLOCK]]);
                    await Sleep(300) ;
                    // 验证是否真正安全归还
                    const lockNameAfterAttempt = await this.CheckLockFromGS() ;
                    if (lockNameAfterAttempt === noLOCK) {return true}
                    // 如果锁被别人抢走也是对的
                    if (lockNameAfterAttempt !== this.lockName) {return true}


                } catch(e) {
                    // do nothing, continue to try release
                }
                attempt += 1 ;
                await Sleep(1000) ;
            }

            return 'ReleaseLockOfGS Error: 解锁出错，出现系统错误' ;
        } ,

        /**
         * 获取GS数据
         * @returns  正确的返回结果: [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA]
         * @returns  String: 返回已知的错误类型
         */
        async Get_gsData() {
            if( !isStrictString(this.spreadsheetID)     || 
                !isStrictString(toGCPRanges)            || 
                !toGCPRanges.includes(":")              || 
                !toGCPRanges.includes("!")              )   {
                    return "Get_gsData Error: GetGS() @param error"  ;
                }
            const toGCPData = CleanObjToNumBoolStr(A2dToObj(await GetGS(this.sheets, this.spreadsheetID, toGCPRanges )))  ;
            if(!Object.hasOwn(toGCPData, "LOCK") ) {return "Get_gsData Error: get toGCPData error" }

            const rangesList = [    toGCPData.mainRange                ,       // 0 
                                    toGCPData.uncloseOrdersRange       ,       // 1
                                    toGCPData.ingOrderLine             ,       // 2
                                    toGCPData.tradeHistoryTitleLine    ,       // 3
                                    toGCPData.uncloseOrdersTitleLine   ,       // 4
                                    toGCPData.ingOrderTitleLine        ] ;     // 5
            const valuesArray   = await BatchGetGS(this.sheets, this.spreadsheetID, rangesList);
            const raw_mainData  = valuesArray[0];
            if (!Array.isArray(raw_mainData) || !Array.isArray(raw_mainData[0]) ) {return 'Get_gsData Error: didnt get available data, 1'}
            const mainData  = CleanObjToNumBoolStr(A2dToObj(raw_mainData), 'notAvailableValue') ;
            if (    !Object.hasOwn(mainData, 'LOCK')    ||
                    !isStrictString(mainData.LOCK)      ||
                    mainData.LOCK !== this.lockName     )   { 
                return 'Get_gsData Error: didnt get available data, 2' ;
            }

            const uncloseOrdersA2d      = isStrictTrue(mainData.therePosition) ? (valuesArray[1]).map(lines => CleanArrayToNumStrBool(lines)) : [] ;

            const ingOrderLineA         = mainData.ing_orderStatus === order_waiting ? CleanArrayToNumStrBool(valuesArray[2][0]) : [] ;
            const ingOrderTitleA        = CleanArrayToNumStrBool(valuesArray[5][0]) ;
            const ingOrderData          = mainData.ing_orderStatus === order_waiting ? A2LinesToObj([ingOrderTitleA, ingOrderLineA]) : null ;

            const uncloseOrdersTitleA   = CleanArrayToNumStrBool(valuesArray[4][0]) ;

            const tradeHistoryTitleA    = CleanArrayToNumStrBool(valuesArray[3][0])  ;

            return [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA] ;
        } ,

        /**
         * initiate 仅仅是系统首次初始化 ; 
         * 每次信号进来的时候的初始化 用 start() ;
         * @returns true: 表示初始化成功
         * @returns false: 表示不需要初始化
         * @returns String: 表示初始化中遇到的明确错误
         */
        async ToCheckInitiate(mainData, tvData, toGCPData) {
            if (isStrictTrue(mainData.initiated)) {return false}

            // 初始化时间不能在GS中预设的交易开始时间之后
            if (tvData.timestamp > mainData.realTradeTime) { return 'Inititate Error: 初始化时间不能在GS中预设的交易开始时间之后' }

            // 下面是初始化过程
            // 系统处于未初始化状态
            const iD = {} ;

            iD.initiated        =   true                                                        ;
            iD.initiateTime     =   tvData.timestamp                                            ;
            iD.initialFund      =   mainData.inFund + mainData.inCoin * tvData.BaseCoinPrice    ;
            iD.hghestFund       =   iD.initialFund                                              ;
            iD.lowestFund       =   iD.initialFund                                              ;
            iD.initialCoin      =   iD.initialFund / tvData.BaseCoinPrice                       ;
            iD.hghestCoin       =   iD.initialCoin                                              ;
            iD.lowestCoin       =   iD.initialCoin                                              ;

            const i_toClearRangeSet     =  new Set()    ;
            const i_toUpdateRangeList   =  []           ;

            i_toClearRangeSet.add( toGCPData.uncloseOrdersRange )  ;
            i_toClearRangeSet.add( toGCPData.tradeHistoryRange  )  ;
            i_toClearRangeSet.add( toGCPData.HghLowRange        )  ;
            i_toClearRangeSet.add( toGCPData.simBrokerRange     )  ;
            i_toClearRangeSet.add( toGCPData.BrokerRange        )  ;
            i_toClearRangeSet.add( toGCPData.toWriteMainRange   )  ;

            const newHghLowV    = [ [iD.initiated   ]    ,
                                    [iD.initiateTime]    ,
                                    [iD.initialFund ]    ,
                                    [iD.hghestFund  ]    ,
                                    [iD.lowestFund  ]    ,
                                    [iD.initialCoin ]    ,
                                    [iD.hghestCoin  ]    ,
                                    [iD.lowestCoin  ]    ]   ;

            i_toUpdateRangeList.push(    {
                range   : toGCPData.HghLowRange     ,
                values  : newHghLowV                } ) ;


            await BatchClearGS(this.sheets, this.spreadsheetID, Array.from(i_toClearRangeSet));

            await BatchClearUpdateGS(this.sheets, this.spreadsheetID, i_toUpdateRangeList);

            this.AddAlertMessage(this.alertMessageSet, 'just initiated')  ;

            return true ;
        } ,

        /**
         * 检查fundfee
         * @param {Object} mainData
         * @param {Object} tvData 
         * @param {Array<String>} tradeHistoryTitleA 
         * @param {String} tradeHistoryRange 
         * @returns true: 表示收取fundFee并写入成功
         * @returns false: 表示不需要检查fund fee
         * @returns String: 表示运行错误
         */
        async ToCheckFundFee(mainData, tvData, tradeHistoryTitleA, tradeHistoryRange) {
            if (!isPlainObject(mainData) || !Array.isArray(tradeHistoryTitleA) || !isStrictString(tradeHistoryRange)) {
                return "ToCheckFundFee Error: input @param error"  ;
            }

            let toCheckFundFee = false;
            if ( isStrictNumber(mainData.lstFundTime) ) {
                const lstRound  = Math.floor(mainData.lstFundTime / 28800000); // 8 * 60 * 60 * 1000
                const thisRound = Math.floor(mainData.timestamp   / 28800000);
                toCheckFundFee  = lstRound === thisRound ? false : true;
            } else {toCheckFundFee = true}

            if (isStrictFalse(toCheckFundFee)) {return false} 

            let S = {}  ;
            S.fund_orderID          = 'F-' + GetTimeStringWithOffset(8, 28800000 * Math.floor(tvData.timestamp / 28800000)) ;
            S.fund_orderTimestamp   = Date.now()                                                                            ;
            S.fund_orderDate        = GetTimeStringWithOffset(8, S.fund_orderTimestamp)                                     ;
            S.fund_buysell          = order_FUND                                                                            ;
            S.fund_avgBuyPrice      = mainData.avgBuyPrice                                                                  ;
            S.fund_reason           = "FundFee"                                                                             ;
            S.fund_orderStatus      = order_pending                                                                         ;

            const returnS = await CheckFundFee(S, this.isReal, this.TradingSymbol, this.sheets, this.spreadsheetID) ;

            const newFundHistoryA = tradeHistoryTitleA.map(v => {returnS['fund_'+v] || NA})

            await AppendGS(this.sheets, this.spreadsheetID, tradeHistoryRange, [newFundHistoryA]) ;

            this.AddAlertMessage(this.alertMessageSet, "New fund fee: " + String(returnS.fund_fundFee)) ;

            return true ;

        } ,

        /**
         * 判断waiting 订单状态
         * @param {Object} ingOrderData 
         * @param {Array<Array>} uncloseOrdersA2d 
         * @param {Array<String>} uncloseOrdersTitleA 
         * @param {Array<String>} tradeHistoryTitleA 
         * @param {Object} mainData 
         * @param {Object} tvData 
         * @param {Object} toGCPData 
         * @returns false: 没有状态更改
         * @returns true:  有状态更改
         */
        async ToCheckWaitingOrder(ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA, mainData, tvData, toGCPData) {
            if (!isStrictTrue(mainData.ifOrderWaiting)) {return false}

            let ifWaitingThenCancel = true ;
            if (ingOrderData.ing_buysell === order_BUY  && tvData.TradingSymbolPrice < ingOrderData.ing_orderPrice * (1 + tvData.waveUpChg)) { ifWaitingThenCancel = false }
            if (ingOrderData.ing_buysell === order_SELL && tvData.TradingSymbolPrice > ingOrderData.ing_orderPrice * (1 + tvData.waveDnChg)) { ifWaitingThenCancel = false }

            // 去交易所查看成交情况
            // 此时获得的数据已经是clean
            const res_broker = await CheckOrderConfirm(ingOrderData.ing_orderID, ifWaitingThenCancel, this.isReal, tvData.TradingSymbol, this.sheets, this.spreadsheetID);

            const w_toUpdateRangeList       = []        ;
            const w_toClearRangeSet         = new Set() ;
            const w_toAppendTradeHistory    = []        ;

            let ingOrderStatusChange = false ;

            // 对于部分成交的情况,
            // 如果ifWaitingThenCancel = false,  只修改ing_orderStatus一个变量
            // 如果ifWaitingThenCancel = true ,  当做confirm来判断
            if  (res_broker.ing_orderStatus === order_confirm                                   || 
                (res_broker.ing_orderStatus === order_cancel  && res_broker.ing_partial > 0 )   )   {

                if (ingOrderData.ing_buysell === order_BUY) {
                    const newUncloseOrderLine = uncloseOrdersTitleA.map(v => {res_broker['ing_'+v] || NA}) ;
                    uncloseOrdersA2d.push(newUncloseOrderLine) ;
                }
                if (ingOrderData.ing_buysell === order_SELL) {
                    const indexOfSerial = uncloseOrdersTitleA.indexOf('serial') ;
                    if (indexOfSerial > -1) {uncloseOrdersA2d = uncloseOrdersA2d.filter(row => String(row[indexOfSerial]) !== String(Math.abs(res_broker.ing_serial))) }
                }

                w_toClearRangeSet.add(toGCPData.ingOrderLine) ;
                w_toClearRangeSet.add(toGCPData.uncloseOrdersRange) ;

                const newTradeHistoryA = tradeHistoryTitleA.map(v => {res_broker['ing_'+v] || NA}) ;
                w_toAppendTradeHistory.toAppend = true                          ;
                w_toAppendTradeHistory.range    = toGCPData.tradeHistoryRange   ;
                w_toAppendTradeHistory.values   = [newTradeHistoryA]            ;

                if (uncloseOrdersA2d.length > 0) {
                    w_toUpdateRangeList.push( {
                        range   : toGCPData.uncloseOrdersRange  ,
                        values  : uncloseOrdersA2d                 } ) ;
                }

                const thisMessage = res_broker.ing_orderStatus === order_confirm                                ?
                    (ingOrderData.ing_buysell === order_BUY ? "buy" : "sell") + "Order confirmed"               :
                    (ingOrderData.ing_buysell === order_BUY ? "buy" : "sell") + "Order partially confirmed"           ;

                this.AddAlertMessage(this.alertMessageSet, thisMessage) ;

                ingOrderStatusChange = true ;
            }

            if (res_broker.ing_orderStatus === order_waiting && res_broker.ing_partial > 0 && res_broker.ing_partial > ingOrderData.ing_partial) {
                ingOrderData.ing_partial = res_broker.ing_partial ;
                const new_ingOrderLineA = ingOrderTitleA.map(v => {ingOrderData[v] || NA}) ;
                w_toUpdateRangeList.push({
                    range   : toGCPData.ingOrderLine    , 
                    values  : [new_ingOrderLineA]       } ) ;
                this.AddAlertMessage(this.alertMessageSet, (ingOrderData.ing_buysell === order_BUY ? "buy" : "sell") + "Order more partial confirmed") ;

                ingOrderStatusChange = true ;
            }

            if (res_broker.ing_orderStatus === order_cancel) {
                w_toClearRangeSet.add(toGCPData.ingOrderLine) ;
                this.AddAlertMessage(this.alertMessageSet, (ingOrderData.ing_buysell === order_BUY ? "buy" : "sell") + "Order canceled") ;

                ingOrderStatusChange = true ;
            }

            if (isStrictFalse(ingOrderStatusChange)) {return false}

            await BatchClearGS(this.sheets, this.spreadsheetID, Array.from(w_toClearRangeSet) ) ;

            await BatchClearUpdateGS(this.sheets, this.spreadsheetID, w_toUpdateRangeList)  ;

            if (isStrictTrue(w_toAppendTradeHistory.toAppend)) { await AppendGS(this.sheets, this.spreadsheetID, w_toAppendTradeHistory.range, w_toAppendTradeHistory.values) }

            return true ;

        } ,

        /**
         * 判断可写入的新数据key
         * @param {String} key 
         * @returns 
         */
        isCanWriteAtt(key) {
            // 原型链毒素刚性黑名单（掐死原型污染攻击）
            const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'] ;
            if (FORBIDDEN_KEYS.includes(key)) {return false}
            if (isStrictNumber (this[key])) {return true}
            if (isStrictBoolean(this[key])) {return true}
            if (isStrictString (this[key])) {return true}
            if (!Object.hasOwn (this, key)) {return true}
            return false ;
        } ,

        /**
         * 将新数据写入this大对象中 ; 
         * @param {Object} newData 需要写入的新数据, 需保证newData是clean状态
         * @returns {string} 失败返回具体熔断错误字符串
         */
        UpdateDataToThis(newData) {
            // 前置安全门禁与类型确权
            if (!isPlainObject(newData)) {
                return 'UpdateData Error: incoming newData must be a valid plain object';
            }
            Object.keys(newData).forEach(key => {
                if (this.isCanWriteAtt(key)) {this[key] = newData[key]}
            }) ;
        } ,

        /**
         * 计算 [liquidatePrice, stopPriceC, stopPriceF] ; 
         * 直接从this大对象中获取必要参数, 不需要额外输入 
         * @returns 计算后的 [liquidatePrice, stopPriceC, stopPriceF]
         */
        GetLiquidateStopPrice() {
            // 基础变量提取 (命名对齐你的 GetAccountStatusByPrice)
            let C  = this.crtCoin                   ;
            let S  = this.BaseCoinPrice             ;
            let P  = this.TradingSymbolPrice        ;
            let L  = this.allPosition               ;
            let K  = this.inFund + this.netProfit   ;
            let A  = this.avgBuyPrice               ;
            let H  = this.BaseCoinHairCut           ;
            let R  = this.waveUpChg                 ;
            let D  = this.Adn2B                     ;
            let SF = this.stopRate4F                ;
            let SC = this.stopRate4C                ;
            let NF = this.notStop4F                 ;
            let NC = this.notStop4C                 ;
            let HF = this.hghestFund                ;
            let HC = this.hghestCoin                ;

            let liquidatePrice  = null  ;
            let stopPriceC      = null  ;
            let stopPriceF      = null  ;

            // ==========================================
            // 1. 求 _liquidatePrice (爆仓价)
            // 条件: V_f(P, Haircut) = R * L * P
            // ==========================================
            let slope_f_h = (C * S * D * H / P) + L                     ;
            let intercept_f_h = K - (L * A) + (C * S * H * (1 - D))     ;

            // 方程: slope_f_h * P + intercept_f_h = R * L * P
            // 移项: P * (slope_f_h - R * L) = -intercept_f_h
            liquidatePrice = -intercept_f_h / (slope_f_h - R * L)  ;

            // ==========================================
            // 2. 求 _stopPriceF (金本位止损价)
            // 需要计算两个条件：stopRate4F (止损) 和 notStop4C (交叉限制)
            // 最终取两者中较高的价格 (即下跌时先碰到的那个)
            // ==========================================
            let slope_f     = (C * S * D / P) + L               ;
            let intercept_f = K - (L * A) + (C * S * (1 - D))   ;

            let targetF_1 = HF * (1 + SF / 100)     ;
            let targetF_2 = HF * (1 + NF / 100)     ;

            let resF1 = (targetF_1 - intercept_f) / slope_f ;
            let resF2 = (targetF_2 - intercept_f) / slope_f ;

            // 根据你的逻辑，最终结果由交叉条件限制，此处取 math.min 对应下跌时更高的价格
            stopPriceF = Math.min(resF1, resF2) ;

            // ==========================================
            // 3. 求 _stopPriceC (币本位止损价)
            // 条件: V_f(P, H=1) / P_b(P) = TargetCoin
            // ==========================================
            let targetC_1 = HC * (1 + SC / 100)  ;
            let targetC_2 = HC * (1 + NC / 100)  ;

            // 币本位方程推导: (slope_f * P + intercept_f) / (S0 * (1 + (P-P0)/P0 * Adn2B)) = Target
            // 令 m_slope = S0 * Adn2B / P0, m_intercept = S0 * (1 - Adn2B)
            let m_slope     = S * D / P     ;
            let m_intercept = S * (1 - D)   ;

            // 方程化简为一次方程: P * (slope_f - Target * m_slope) = Target * m_intercept - intercept_f
            let resC1 = (targetC_1 * m_intercept - intercept_f) / (slope_f - targetC_1 * m_slope)   ;
            let resC2 = (targetC_2 * m_intercept - intercept_f) / (slope_f - targetC_2 * m_slope)   ;

            stopPriceC = Math.min(resC1, resC2) ;

            return [liquidatePrice, stopPriceC, stopPriceF]  ;

        } ,

        /**
         * 对当前账户状态进行更新 ; 
         * 直接从this大对象中获取数据, 不需要额外输入 ; 
         * this大对象中的数据, 来源于GS, TV, 以及Initiate() ;
         * 除了修改的数据之外, 认为这些数据是绝对正确的
         */
        ReNew() {
            this.openProfit =  isStrictTrue(this.therePosition) ?  this.allPosition * (this.TradingSymbolPrice - this.avgBuyPrice)  :  NA    ;
            this.usedMargin =  isStrictTrue(this.therePosition) ?  this.allPosition * this.TradingSymbolPrice / this.leverage       :  NA    ;
            this.crtFund    =  this.inFund + ToStrictNumber(this.netProfit, 0) + ToStrictNumber(this.openProfit, 0)                          ;
            this.crtCoin    =  this.inCoin                                                                                                   ;
            this.freeMargin =  this.crtFund + this.crtCoin * this.BaseCoinPrice * this.BaseCoinHairCut - ToStrictNumber(this.usedMargin, 0)  ;
            this.allFund    =  this.crtFund + this.crtCoin * this.BaseCoinPrice                                                              ;
            this.allCoin    =  this.crtFund / this.BaseCoinPrice + this.crtCoin                                                              ;

            this.rcd_fund   =  ToStrictNumber(this.rcd_fund, this.allFund)  ;
            this.rcd_coin   =  ToStrictNumber(this.rcd_coin, this.allCoin)  ;

            if (isStrictString(this.lstRcdTouchHghTime)) {
                this.markTouchTargetHgh = false                 ;
                this.lstRcdTouchHghTime = this.lstTouchHghTime  ;
                this.lstRcdTargetHgh    = this.lstTargetHgh     ;
            }
            if (isStrictNumber(this.lstRcdTouchHghTime) && this.lstRcdTouchHghTime < this.lstTouchHghTime) {
                this.markTouchTargetHgh = true                                      ;
                this.lstRcdTouchHghTime = this.lstTouchHghTime                      ;
                this.lstRcdTargetHgh    = this.lstTargetHgh                         ;
                this.AddAlertMessage(this.alertMessageSet, "↑ markTouchTargetHgh")  ; 
            }
            if (isStrictString(this.lstRcdTouchLowTime)) {
                this.markTouchTargetLow = false                 ;
                this.lstRcdTouchLowTime = this.lstTouchLowTime  ;
                this.lstRcdTargetLow    = this.lstTargetLow     ;
            }
            if (isStrictNumber(this.lstRcdTouchLowTime) && this.lstRcdTouchLowTime < this.lstTouchLowTime) {
                this.markTouchTargetLow = true                                      ;
                this.lstRcdTouchLowTime = this.lstTouchLowTime                      ;
                this.lstRcdTargetLow    = this.lstTargetLow                         ;
                this.AddAlertMessage(this.alertMessageSet, "↓ markTouchTargetLow")  ; 
            }


            [this.liquidatePrice, this.stopPriceC, this.stopPriceF] = this.GetLiquidateStopPrice();
            this.liquidatePrice    =  isStrictTrue(this.therePosition)  ?  this.liquidatePrice  :  NA  ;
            this.stopPriceC        =  isStrictTrue(this.therePosition)  ?  this.stopPriceC      :  NA  ;
            this.stopPriceF        =  isStrictTrue(this.therePosition)  ?  this.stopPriceF      :  NA  ;

            this.ifOrderWaiting  =  this.ing_orderStatus === order_waiting  ;

            // 账户状态判断
            this.accStatus =  'Normal' ; 
            if (this.TradingSymbolPrice < this.liquidatePrice) {
                this.accStatus         =  accStatus_liquidated                                                  ;
                this.thisAlertMessage  =  this.AddAlertMessage(this.alertMessageSet, accStatus_liquidated)      ;
            }
            if (this.TradingSymbolPrice < this.stopPriceC    ) {
                this.accStatus         =  accStatus_stopC                                                       ;
                this.thisAlertMessage  =  this.AddAlertMessage(this.alertMessageSet, accStatus_stopC)           ;
            } 
            if (this.TradingSymbolPrice < this.stopPriceF    ) {
                this.accStatus         =  accStatus_stopF                                                       ;
                this.thisAlertMessage  =  this.AddAlertMessage(this.alertMessageSet, accStatus_stopF)           ;
            }
            if (this.TradingSymbolPrice < this.stopPriceC  &&  this.TradingSymbolPrice < this.stopPriceF ) {
                this.accStatus         =  accStatus_stopCF                                                      ;
                this.thisAlertMessage  =  this.AddAlertMessage(this.alertMessageSet, accStatus_stopCF)          ;
            }

            if (this.allFund > this.rcd_fund*(1+this.barChgA) ) {this.rcd_fund = this.allFund ; this.AddAlertMessage(this.alertMessageSet, '↑ new rcd_fund') ; }
            if (this.allFund < this.rcd_fund*(1-this.barChgA) ) {this.rcd_fund = this.allFund ; this.AddAlertMessage(this.alertMessageSet, '↓ new rcd_fund') ; }
            if (this.allCoin > this.rcd_coin*(1+this.barChgB) ) {this.rcd_coin = this.allCoin ; this.AddAlertMessage(this.alertMessageSet, '↑ new rcd_coin') ; }
            if (this.allCoin < this.rcd_coin*(1-this.barChgB) ) {this.rcd_coin = this.allCoin ; this.AddAlertMessage(this.alertMessageSet, '↓ new rcd_coin') ; }

            if (this.allFund > this.hghestFund) {this.toWriteHghLow = true; this.hghestFund = this.allFund; this.AddAlertMessage(this.alertMessageSet, "↑ new hghestFund" ) ; }
            if (this.allFund < this.lowestFund) {this.toWriteHghLow = true; this.lowestFund = this.allFund; this.AddAlertMessage(this.alertMessageSet, "↓ new lowestFund" ) ; }
            if (this.allCoin > this.hghestCoin) {this.toWriteHghLow = true; this.hghestCoin = this.allCoin; this.AddAlertMessage(this.alertMessageSet, "↑ new hghestCoin" ) ; }
            if (this.allCoin < this.lowestCoin) {this.toWriteHghLow = true; this.lowestCoin = this.allCoin; this.AddAlertMessage(this.alertMessageSet, "↓ new lowestCoin" ) ; }

            this.closeToRndHgh     =  this.roundHgh / Math.pow((1+this.waveUpChg), this.notBuyCloseToRndHghStep)  ;
            this.closeToRndLow     =  this.roundLow / Math.pow((1+this.waveDnChg), this.notBuyCloseToRndLowStep)  ;

            this.hghToBuy   =  Math.min(this.basicHghToBuy                                          ,
                                        this.closeToRndHgh                                          ,
                                        ToStrictNumber(this.lowBuyPriceUnclose, this.basicHghToBuy) )   ;

            this.lowToBuy   =  Math.max(this.basicLowToBuy, this.closeToRndLow )   ;
            this.lowToSell  =  Math.max(this.basicLowToSell                    )   ;

            this.inTradingTime     =  this.timestamp > this.realTradeTime && this.timestamp < this.realTradeTimeTo ;

            this.canBuy            =  true     ;
            this.cantBuyReason     =  ""       ;
            this.canSell           =  true     ;
            this.cantSellReason    =  ""       ;

            if (!this.inTradingTime) {
                this.canBuy            =  false  ;
                this.canSell           =  false  ;
                this.cantBuyReason     =  AddMessage(this.cantBuyReason , 'cant buy: '  + 'not in trading time' )  ;
                this.cantSellReason    =  AddMessage(this.cantSellReason, 'cant sell: ' + 'not in trading time' )  ;
            }

            if (this.timestamp - this.lstTradeTime < this.ordersInterval * 60000) {
                this.canBuy            =  false  ;
                this.canSell           =  false  ;
                this.cantBuyReason     =  AddMessage(this.cantBuyReason , 'cant buy: '  + 'there order just done, wait some time' )  ;
                this.cantSellReason    =  AddMessage(this.cantSellReason, 'cant sell: ' + 'there order just done, wait some time' )  ;
            }

            if (this.ifOrderWaiting) {
                this.canBuy            =  false  ;
                this.canSell           =  false  ;
                this.cantBuyReason     =  AddMessage(this.cantBuyReason , 'cant buy: '  + 'there order waiting' )  ;
                this.cantSellReason    =  AddMessage(this.cantSellReason, 'cant sell: ' + 'there order waiting' )  ;
            }

            if (Number(this.gridNum) >= Number(this.MaxGrid) ) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: ' + "gridNum >= MaxGrid")         ;
            }

            if (this.TradingSymbolPrice > this.basicHghToBuy) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: ' + 'price > basicHghToBuy'  )     ;
            }
            if (this.TradingSymbolPrice > this.closeToRndHgh) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: '  + 'price closeToRndHgh'    )    ;
            }
            if(this.TradingSymbolPrice > this.lowBuyPriceUnclose) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: '  + 'price > lowBuyPriceUnclose') ;
            }
            if (this.TradingSymbolPrice < this.basicLowToBuy) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: '  + 'price < basicLowToBuy'  )    ;
            } 
            if (this.TradingSymbolPrice < this.closeToRndLow) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason, 'cant buy: '  + 'price closeToRndLow'    )    ;
            }
            if (this.freeMargin / (this.MaxGrid - this.gridNum) < 1.1 * this.minEnExPosition * this.TradingSymbolPrice / this.leverage) {
                this.canBuy            =   false ;
                this.cantBuyReason     =   AddMessage(this.cantBuyReason,  'cant buy: '  + 'Not enough freeMargin' )    ;
            }

            if (this.TradingSymbolPrice < this.basicLowToSell) {
                this.canSell           =   false                           ;
                this.cantSellReason    =   AddMessage(this.cantSellReason, 'cant sell: ' + 'price < basicLowToSell' ) ;
            }

            if (!isStrictTrue(this.therePosition)) {
                this.canSell           =   false                           ;
                this.cantSellReason    =   AddMessage(this.cantSellReason, 'cant sell: ' + 'No position to sell'    ) ;
            }

            this.AddAlertMessage(this.alertMessageSet, this.cantBuyReason ) ;
            this.AddAlertMessage(this.alertMessageSet, this.cantSellReason) ;

            delete this.cantBuyReason   ;
            delete this.cantSellReason  ;
        } ,

        /**
         * 判断是否要发出卖单, 并实际下单
         * 只有当实际卖出信号发出时，才会返回true
         * @param {Array<Array>} uncloseOrdersA2d 
         * @param {Array<String>} uncloseOrdersTitleA
         * @param {Array<String>} ingOrderTitleA 
         * @param {String} ingOrderLine 
         * @returns true: 表示卖出信号发出, 且收到了交易所的回复
         * @returns false: 经判断不能卖出, 没有信号发生
        */
        async ToSell(uncloseOrdersA2d, uncloseOrdersTitleA, ingOrderTitleA, ingOrderLine) {
            if (!isStrictTrue(this.canSell)) { return false }

            let toSell = false;
            let toSellOrderA;
            const S = {};

            // orderID	confirmDate	serial	triggerPrice	confirmPrice	qty	P×Q	reason
            // 0        1           2       3               4               5   6   7
            const idx_orderID       = uncloseOrdersTitleA.indexOf('orderID'         ) ;
            const idx_serial        = uncloseOrdersTitleA.indexOf('serial'          ) ;
            const idx_confirmPrice  = uncloseOrdersTitleA.indexOf('confirmPrice'    ) ;
            const idx_qty           = uncloseOrdersTitleA.indexOf('qty'             ) ;

            // touch targetHgh
            if ( (this.TradingSymbolPrice > (1+this.waveUpChg) * this.lowBuyPriceUnclose)  &&  this.markTouchTargetHgh ) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.lowBuySerialUnclose));
                S.ing_orderPrice = this.lstRcdTargetHgh ;
                S.ing_reason = 'touchTargetHgh';
            }
            // mustSellProfitStep
            if ( (this.TradingSymbolPrice > Math.pow((1+this.waveUpChg), this.mustSellProfitStep) * Math.max( this.lowBuyPriceUnclose , this.avgBuyPriceUnclose) ) ) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.lowBuySerialUnclose));
                S.ing_reason = 'must sell Profit';
            }
            // cut too high buy order
            if ( (this.hghBuyPriceUnclose/this.TradingSymbolPrice > this.roundHgh/this.roundLow) && (this.hghBuyPriceUnclose > (1+this.waveUpChg) * this.TradingSymbolPrice) ) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_reason = 'cut too hgh buy order';
            }
            // cut due to stopC
            if ( this.TradingSymbolPrice < this.stopPriceC ) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_reason = 'cut due to stopC';
            }
            // cut due to stopF
            if ( this.TradingSymbolPrice < this.stopPriceF ) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_reason = 'cut due to stopF';
            }
            // cut to prevent liquidate
            if ( this.TradingSymbolPrice < (1+this.mustSellToPreventLiq/100)*this.liquidatePrice) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_reason = 'cut to prevent liquidate';
            }

            if (isStrictFalse(toSell)) {return false}

            if (isStrictTrue(toSell)) {
                S.ing_orderID           =  toSellOrderA[idx_orderID].trim().replace('B', 'S')       ;
                S.ing_orderTimestamp    =  Date.now()                                               ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8, S.ing_orderTimestamp)         ;
                S.ing_serial            =  -1 * toSellOrderA[idx_serial]                            ;
                S.ing_buysell           =  order_SELL                                               ;
                S.ing_triggerPrice      =  this.TradingSymbolPrice                                  ;
                S.ing_orderType         =  order_T_LMT                                              ;
                S.ing_orderPrice        =  S.ing_orderPrice || S.ing_triggerPrice                   ;
                S.ing_boughtPrice       =  toSellOrderA[idx_confirmPrice]                           ;
                S.ing_qty               =  -1 * toSellOrderA[idx_qty]                               ;
                S.ing_orderStatus       =  order_pending                                            ;

                const returnS = await SendOrderToBroker(S, this.isReal, this.TradingSymbol, this.sheets, this.spreadsheetID) ;
                // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

                const new_ingOrderLineA = ingOrderTitleA.map(v => {returnS[v] || NA}) ;

                this.toUpdateRangeList.push({
                    range   : ingOrderLine          ,
                    values  : [new_ingOrderLineA]   } ) ;

                this.AddAlertMessage(this.alertMessageSet, "New sell order, waiting confirmed")  ;
                
                this.canBuy            =   false ;
                this.AddAlertMessage(this.alertMessageSet, 'cant buy: just a new sellOrder sent') ;

                return true ;
            }

        } ,

        /**
         * 判断是否要发出买单, 并实际下单
         * 只有当实际买入信号发出时，才会返回true
         * @param {Array<String>} ingOrderTitleA 
         * @param {String} ingOrderLine 
         * @returns true: 表示买入信号发出, 且收到了交易所的回复
         * @returns false: 经判断不能买入, 没有信号发生
         */
        async ToBuy(ingOrderTitleA, ingOrderLine) {
            if (!isStrictTrue(this.canBuy)) {return false}

            let toBuy = false ;
            const S = {};

            if (isStrictTrue(this.markTouchTargetLow)) {
                toBuy = true ;
                S.ing_orderPrice = this.lstRcdTargetLow ;
                S.ing_reason = 'touchTargetLow' ;
            }

            // 目前对于买入信号的判断, 只有一个判断: touchTargetLow

            if ( isStrictFalse(toBuy) ) {return false}

            if ( isStrictTrue(toBuy) ) {
                S.ing_orderID           =  'B-' + GetTimeStringWithOffset(8, this.timestamp)                                                                                                            ;
                S.ing_orderTimestamp    =  Date.now()                                                                                                                                                   ;
                S.ing_orderDate         =  GetTimeStringWithOffset(8, S.ing_orderTimestamp)                                                                                                             ;
                S.ing_serial            =  ToStrictNumber(this.lstBuySerial, 0) + 1                                                                                                                     ;
                S.ing_buysell           =  order_BUY                                                                                                                                                    ;
                S.ing_triggerPrice      =  this.TradingSymbolPrice                                                                                                                                      ;
                S.ing_orderType         =  order_T_LMT                                                                                                                                                  ;
                S.ing_orderPrice        =  S.ing_orderPrice || S.ing_triggerPrice                                                                                                                       ;
                S.ing_qty               =  this.minEnExPosition * Math.max(1, Math.floor(this.freeMargin*this.leverage/this.ing_orderPrice/this.minEnExPosition/(this.MaxGrid - this.gridNum)) )        ;
                S.ing_orderStatus       =  order_pending                                                                                                                                                ;

                const returnS = await SendOrderToBroker(S, this.isReal, this.TradingSymbol, this.sheets, this.spreadsheetID) ;
                // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

                const new_ingOrderLineA = ingOrderTitleA.map(v => {returnS[v] || NA}) ;

                this.toUpdateRangeList.push({
                    range   : ingOrderLine          ,
                    values  : [new_ingOrderLineA]   } ) ;

                this.AddAlertMessage(this.alertMessageSet, "New buy order: waiting confirmed") ;

                return true ;
            }
        } ,

        /**
         * 将this大对象中的数据写入GS
         * @returns true表示写入成功，false表示写入失败
         */
        async WriteToGS(toWriteMainRange, mainRange) {
            await BatchClearGS(this.sheets, this.spreadsheetID, Array.from(this.toClearRangeSet));

            if (this.runningWellSet .size === 0 ) { this.runningWell  = true } 
            if (this.runningWellSet .size >   0 ) { this.runningWell  = [...this.runningWellSet ].join('\n') }
            if (this.alertMessageSet.size >   0 ) { this.alertMessage = [...this.alertMessageSet].join('\n') }

            this.gcpWriteTime = Date.now();

            this.toUpdateRangeList.push(    {
                range   : toWriteMainRange          ,
                values  : ObjToA2dNumBoolStr(this)  }  )  ;
            await BatchClearUpdateGS(this.sheets, this.spreadsheetID, this.toUpdateRangeList);

            return true ;

        } ,

        /**
         * 
         * @param {String} toReadRange 
         */
        async SendToTG(toReadRange) {
            const rawMessagesA2d = (await GetGS(this.sheets, this.spreadsheetID, toReadRange, 'read')).map(v => CleanArrayToNumStrBool(v)) ;
            const messageString  = FormatMatrixToString(rawMessagesA2d) ;

            const TG_TOKEN = process.env.TG_TOKEN;
            const TG_CHAT_ID = process.env.TG_CHAT_ID;

            const subject = this.botNumber + '_' + + GetTimeStringWithOffset(8, this.timestamp) + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime) ;

            await SendSplitTGMessages(TG_TOKEN, TG_CHAT_ID, subject, messageString) ;
        } ,

        /**
         * @param {String} toEmailRange 
         */
        async SendToEmail(toEmailRange) {
            const rawMessagesA2d = (await GetGS(this.sheets, this.spreadsheetID, toEmailRange, 'read')).map(v => CleanArrayToNumStrBool(v)) ;
            const messageHTML    =  ConvertRowsToHtmlTable(rawMessagesA2d) ;
            const mail_subject   = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime) ;
            await SendEmail(mail_subject, messageHTML) ;
        } ,

        async Start(raw_tvData) {
            let gcpGetTime = Date.now() ; 

            const tvData = this.Get_tvData(raw_tvData) ;
            if (isStrictString(tvData)) {throw new Error(tvData)}
            console.log('tvBot: ' + 'Get_tvData() end') ;

            const r_Set_spreadsheetID = await this.Set_spreadsheetID(tvData.botNumber)  ;
            if (isStrictString(r_Set_spreadsheetID)) {throw new Error(r_Set_spreadsheetID)}
            console.log('tvBot: ' + 'Set_spreadsheetID() end') ;

            this.Set_lockName(tvData.timestamp)  ;
            console.log('tvBot: ' + 'Set_lockName() end') ;

            const r_SetLockToGS = await this.SetLockToGS(tvData.timestamp, 30000) ;
            if (isStrictTrue(r_SetLockToGS)) {this.getLOCK = true}
            if (isStrictString(r_SetLockToGS)) {throw new Error(r_SetLockToGS.trim())}
            console.log('tvBot: ' + 'SetLockToGS() end') ;
            // 当获得lock后就可以不主动抛出错误了
            // 因为拿到了lock就可以往GS写入数据了
            // 可以将错误信息 写入 runningWellSet


            let toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA ;
            const r_Get_gsData = await this.Get_gsData()  ;
            if (Array.isArray(r_Get_gsData)) {
                [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA] = r_Get_gsData ;
            } else {throw new Error(r_Get_gsData)}
            if (!isStrictTrue(mainData.runningWell)) {this.AddAlertMessage(this.runningWellSet, "Passed runningWell error: " + mainData.runningWell) }
            console.log('tvBot: ' + 'Get_gsData() end') 

            if (mainData.timestamp > tvData.timestamp) { throw new Error('tvBot Error: after Get_gsData(), time passed tvData.timestamp') }
            if (mainData.TradingSymbol !== tvData.TradingSymbol) {throw new Error('tvBot Error: after Get_gsData(), mainData.TradingSymbol !== tvData.TradingSymbol')}

            // 检查是否已经初始化，如果没有初始化的话则去初始化
            if (this.isRunningWell() ) {
                const r_ToCheckInitiate = await this.ToCheckInitiate(mainData, tvData, toGCPData) ;
                if (isStrictString(r_ToCheckInitiate)) { this.AddAlertMessage(this.runningWellSet, r_ToCheckInitiate.trim()) }
                if (isStrictTrue(r_ToCheckInitiate)) {
                    // 因为GS中数据已更新所以需要重新获取
                    const r_Get_gsData = await this.Get_gsData();
                    if (Array.isArray(r_Get_gsData)) {
                        [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA] = r_Get_gsData;
                    } else { this.AddAlertMessage(this.runningWellSet, "after ToCheckInitiate() error: " + r_Get_gsData) }
                }
            }
            console.log('tvBot: ' + 'ToCheckInitiate() end') ;

            // 检查是否需要fund fee 查看
            if (this.isRunningWell()) {
                const r_ToCheckFundFee = await this.ToCheckFundFee(mainData, tvData, tradeHistoryTitleA, toGCPData.newTradeHistoryLine) ;
                if (isStrictString(r_ToCheckFundFee)) {this.AddAlertMessage(this.runningWellSet, r_ToCheckFundFee.trim())}
                if (isStrictTrue(r_ToCheckFundFee)) {
                    // 因为GS中数据已更新所以需要重新获取
                    const r_Get_gsData = await this.Get_gsData();
                    if (Array.isArray(r_Get_gsData)) {
                        [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA] = r_Get_gsData;
                    } else { this.AddAlertMessage(this.runningWellSet, "after ToCheckFundFee() error: " + r_Get_gsData) }
                }
            }
            console.log('tvBot: ' + 'ToCheckFundFee() end') ;

            // 检查当前waiting order 状态
            if (this.isRunningWell()) {
                const r_ToCheckWaitingOrder = await this.ToCheckWaitingOrder(   ingOrderData            ,
                                                                                ingOrderTitleA          ,
                                                                                uncloseOrdersA2d        ,
                                                                                uncloseOrdersTitleA     ,
                                                                                tradeHistoryTitleA      ,
                                                                                mainData                ,
                                                                                tvData                  ,
                                                                                toGCPData               ) ;
                if (isStrictString(r_ToCheckWaitingOrder)) {this.AddAlertMessage(this.runningWellSet, r_ToCheckWaitingOrder.trim())}
                if (isStrictTrue(r_ToCheckWaitingOrder)) {
                    // 因为GS中数据已更新所以需要重新获取
                    const r_Get_gsData = await this.Get_gsData();
                    if (Array.isArray(r_Get_gsData)) {
                        [toGCPData, mainData, ingOrderData, ingOrderTitleA, uncloseOrdersA2d, uncloseOrdersTitleA, tradeHistoryTitleA] = r_Get_gsData;
                    } else { this.AddAlertMessage(this.runningWellSet, "after ToCheckWaitingOrder() error: " + r_Get_gsData) }
                }

            }
            console.log('tvBot: ' + 'ToCheckWaitingOrder() end') ;

            // 至此，不再需要更新mainData中的状态
            // 可以进行挂单

            // 将 mainData 和 tvData 写入到this大对象中
            // 必须先写入mainData, 再写入tvData
            // 因为mainData包含旧数据
            const r_Update_mainData    =  this.UpdateDataToThis(mainData)  ;
            if (isStrictString(r_Update_mainData)) {this.AddAlertMessage(this.runningWellSet, r_Update_mainData.trim())}
            const r_Update_tvData      = this.UpdateDataToThis(tvData) ;
            if (isStrictString(r_Update_tvData)) {this.AddAlertMessage(this.runningWellSet, r_Update_tvData.trim())}

            console.log('tvBot: ' + 'UpdateDataToThis() end') ;

            this.ReNew() ;

            // 按照如下顺序, 确认是否可以挂单 并挂单
            // 先 检查是否可以挂卖单
            // 再 检查是否可以挂买单
            if (this.isRunningWell()) { await this.ToSell(uncloseOrdersA2d, uncloseOrdersTitleA, ingOrderTitleA, toGCPData.ingOrderLine) }
            console.log('tvBot: ' + 'ToSell() end') ;
            if (this.isRunningWell()) { await this.ToBuy(ingOrderTitleA, toGCPData.ingOrderLine) }
            console.log('tvBot: ' + 'ToBuy() end') ;

            this.gcpGetTime = gcpGetTime ;
            await this.WriteToGS(toGCPData.toWriteMainRange, toGCPData.mainRange) ;
            console.log('tvBot: ' + 'WriteToGS() end') ;

            const task_SendToTG     = this.SendToTG(toGCPData.toReadRange) ;
            const task_SendtoEmail  = this.SendToEmail(toGCPData.toEmailRange) ;
            await Promise.allSettled([task_SendToTG, task_SendtoEmail]);
            console.log('tvBot: ' + 'SendToTG() and SendToEmail() end') ;

            const r_ReleaseLockOfGS = await this.ReleaseLockOfGS() ;
            if (isStrictTrue(r_ReleaseLockOfGS)) {
                console.log('tvBot: ' + 'ReleaseLockOfGS() success') ;
            } else {
                // 锁释放失败, 尝试将失败信息写入GS
                this.runningWell =  isStrictString(r_ReleaseLockOfGS)                                       ?
                                    AddMessage(this.runningWell, r_ReleaseLockOfGS.trim())                  :
                                    AddMessage(this.runningWell, 'ReleaseLockOfGS Error: Unknown reason')       ;
                await ClearGS(this.sheets, this.spreadsheetID, toGCPData.toWriteMainRange) ;
                await Sleep(300) ;
                await UpdateGS(this.sheets, this.spreadsheetID, toGCPData.toWriteMainRange, ObjToA2dNumBoolStr(this)) ;

            }


        }
    }   ;

    await D.Start(raw_tvData) ;

}




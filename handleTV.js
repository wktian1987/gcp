import {
    isStrictNumber,
    isStrictBoolean,
    isStrictTrue,
    isStrictFalse,
    isStrictString,
    isStrictSet,
    isPlainObject,
    isObjectOfKeyValue,
    ToStrictNumber,
    MinABSnumber,
    ToStrictString,
    ToStrictNumBoolStr,
    AddSetMessage,
    StrFromSetMessage,
    CleanObjToNumBoolStr,
    CleanArrayToNumStrBool,
    A2dToCleanObj,
    A2LinesToCleanObj,
    ObjToA2dNumBoolStr,
    AddMessage,
    GetTimeStringWithOffset,
    SendTG,
    FormatMatrixToString,
    GetSpreadsheetID,
    GetGS,
    UpdateGS,
    AppendGS,
    BatchClearGS,
    BatchClearUpdateGS,
    BatchGetGS,
    ClearGS,
    ConvertRowsToHtmlTable,
    SendEmail,
    Sleep
} from "./utility.js";

import { SendOrderToBroker, CheckOrderConfirm, CheckFundFee } from "./broker.js";


export const CV = {
    noLOCK          : "noLOCK"          ,
    NA              : "NA"              ,
    toGCPRanges     : "toGCP!A:B"       ,
    HuanHang        : "__HuangHang__"   ,
    order_T_LMT     : "LMT"             ,
    order_T_MKT     : "MKT"             ,
    order_BUY       : "B"               ,
    order_SELL      : "S"               ,
    order_FUND      : "F"               ,
    order_pending   : "pending"         ,
    order_waiting   : "waiting"         ,
    order_confirm   : "confirm"         ,
    order_partial   : 'partial'         ,
    order_cancel    : "cancel"          } ;


export async function HandleAllPrice(tvData) {
    const RangeAllPrices = "fromTV!A2:B" ;

    // 清洗来自TV的数据
    Object.keys(tvData).forEach(key => {
        tvData[key] = ToStrictNumBoolStr(tvData[key], 'notAvailableValueFromTV') ;
        if ( isStrictString(tvData[key]) && tvData[key].includes(CV.HuanHang) ) { tvData[key] = tvData[key].replaceAll(CV.HuanHang, '\n').trim() }
    } ) ;

    const spreadsheetID = process.env.SHEET_ID              ;
    const toWriteArray  = ObjToA2dNumBoolStr(tvData)        ;
    await UpdateGS(spreadsheetID, RangeAllPrices, toWriteArray) ;
}


export const TradeBot = {
    /**
     * 为大对象和子对象创建基本的运行参数 ;
     * 每次子对象创建后, 必须运行这个函数 ;
     * @param {object} tvData 清理后的tvData
     * @returns 因为有try/catch, 不会抛错
     * @returns {boolean}   true: 成功
     * @returns {string}    string:出错信息
     */
    async CreateBasicAttr(tvData) {
        this.tvData             =  tvData                       ;
        this.cLogHead           =  tvData.botNumber + ": "      ;
        this.LockTime           =  tvData.timestamp             ;
        this.lockName           =  'T' + String(this.LockTime)  ;
        this.toUpdateRangeList  =  []                           ;
        this.toClearRangeSet    =  new Set()                    ;
        this.alertMessageSet    =  new Set()                    ;
        this.promiseArray       =  []                           ;
        AddSetMessage(this.alertMessageSet, tvData.thisAlertMessage) ;

        this.tgResetIDName      =  tvData.botNumber + '_tgID'           ; // 全局中保存的发送命令的ID
        this.tgResetName        =  tvData.botNumber + '_tgReset'        ; // 全局中的归零信号名
        this.LockTimeName       =  tvData.botNumber + '_lockTime'       ; // 全局中的锁名
        this.RunningWellName    =  tvData.botNumber + '_runningWell'    ; // 全局中的出错名
        this.SpreadsheetIDName  =  tvData.botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID, 避免每次重新读取
        if (!Object.hasOwn(TradeBot, this.tgResetName       )) { TradeBot[this.tgResetName      ] = false       } // 在全局中设置归零信号
        if (!Object.hasOwn(TradeBot, this.LockTimeName      )) { TradeBot[this.LockTimeName     ] = null        } // 在全局中设锁
        if (!Object.hasOwn(TradeBot, this.RunningWellName   )) { TradeBot[this.RunningWellName  ] = new Set()   } // 在全局中设runningWell
        if (!Object.hasOwn(TradeBot, this.SpreadsheetIDName )) { TradeBot[this.SpreadsheetIDName] = null        } // 在全局中设置spreadsheetID

        // 可以通过TG-RESET信号来重置全局锁 和 报错信息
        if (isStrictTrue(TradeBot[this.tgResetName])) { 
            TradeBot[this.tgResetName      ] = false       ;
            TradeBot[this.LockTimeName     ] = null        ;
            TradeBot[this.RunningWellName  ] = new Set()   ;
            TradeBot[this.SpreadsheetIDName] = null        ;

            const task_toReplyResetSignal = SendTG('RESET命令已收到', 'RESET已设置', TradeBot[this.tgResetIDName]);
            promiseArray.push({ taskName: '回复RESET信号', task: task_toReplyResetSignal });
        }

        // 在全局中有报错的话, 直接退出
        if (!this.isRunningWell()) {return '发现之前的运行中有错误, 本次信号没必要再处理, 提前退出, 以前的错误为: \n' + StrFromSetMessage(TradeBot[this.RunningWellName]) }

        if (TradeBot[this.LockTimeName] > this.LockTime) {return '当前正在处理更新的信号, 本信号丢弃' }
        // 正常情况下一个信号运行绝对不会超过5分钟; 一旦发生这种情况, 肯定是发生了不可挽回的错误, 直接抛错退出当前信号处理就可以了
        if (isStrictNumber(TradeBot[this.LockTimeName]) && Date.now() - TradeBot[this.LockTimeName] > 5 * 60 * 1000) {return '上一个信号长时间未解锁, 肯定遇到了无法挽回的错误, 但错误未被记录, 本信号不再处理, 需手动检查' }
        // 如果现在有锁的话, 等待当前正在处理的信号完成, 当信号已经过去60s后, 不再处理
        while (TradeBot[this.LockTimeName] !== null && Date.now() - this.LockTime < 60 * 1000) { await Sleep(1000) }
        // 已经超过60s, 或者大锁被释放
        if (TradeBot[this.LockTimeName] !== null) {return '仍在处理上一个信号, 但是本信号已经超时, 直接退出' }
        // 大锁被清空后, 马上抢大锁
        if (TradeBot[this.LockTimeName] === null) {TradeBot[this.LockTimeName] = this.LockTime } 
        // 至此, 已经在大TradeBot对象中, 给当前botNumber上锁, 其他botNumber几乎不可能再抢占到 大TradeBot锁
        // 在GS中上锁前, 会再次检查 大TradeBot 中的锁, 确保万无一失

        if (TradeBot[this.SpreadsheetIDName] === null) {
            try {
                TradeBot[this.SpreadsheetIDName] = await GetSpreadsheetID(tvData.botNumber);
            } catch (e) {
                let errMessage = e.message + '\n' ;
                const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
                errMessage += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : '大锁已释放' + '\n' ;
                return '获取spreadsheetID失败: \n' + errMessage.trim() ;
            }
        }
        if (isStrictString(TradeBot[this.SpreadsheetIDName])) {this.spreadsheetID = TradeBot[this.SpreadsheetIDName] }

        // 开始设GS锁
        // 只要进入这一步,说明抢到了 大TradeBot 锁
        // 只要拿到了 大TradeBot 锁 , GS 锁必然在上锁前是noLOCK状态, 会去验证
        try {
            let toGCPData   = await this.Get_toGCPData() ;
            let currentLock = toGCPData.LOCK ;
            if (TradeBot[this.LockTimeName] !== this.LockTime) {return '临上GS锁前, 再次检查大锁, 发现大锁已被别的信号抢去' }
            if (currentLock !== CV.noLOCK) {
                const errMessage = '大TradeBot锁被释放的情况下, GS锁未被释放' ;
                this.AddRunningWellMessage(errMessage) ;
                return errMessage ;
            }
            if (currentLock === CV.noLOCK) {
                await UpdateGS(this.spreadsheetID, toGCPData.lockRange, [[this.lockName]]);
                await Sleep(100); // 等0.1后再确认是否成功,防止GS频繁写入读取限制
                toGCPData   = await this.Get_toGCPData() ;
                currentLock = toGCPData.LOCK ;
                if (isStrictTrue(currentLock !== this.lockName)) {
                    await Sleep(2000) ; // 第一次校验失败的话, 等2s再次校验
                    toGCPData   = await this.Get_toGCPData() ;
                    currentLock = toGCPData.LOCK ;
                    if (currentLock !== this.lockName) {
                        // 再次尝试给GS解锁, 万一有锁
                        // 不必关心返回值了, 因为下次信号进来设锁的时候, 会首先检查GS锁状态
                        await this.ReleaseLockOfGS();
                        return '往GS写入LOCK失败' ;
                    }
                }
            }
        } catch (e) { 
            let errMessage = '';
            errMessage += e.message + '\n';
            // 设GS锁出错了, 这是一个非核心错误
            // 需要释放已获得的 大TradeBot锁
            // 并抛出错误给上层调用者
            const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
            errMessage += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : '大锁已释放' + '\n';

            return '抢GS锁失败: \n' + errMessage.trim() ;
        }

        return true ; 

    } , // 执行完此后, 已获得 大TradeBot锁 和 GS锁 , 谨记最后释放

    /**
     * 释放大锁
     * @returns true: 解锁成功
     * @returns string: 解锁校验出错
     */
    ReleaseTradeBotLOCK() {
        if (TradeBot[this.LockTimeName] !== this.LockTime) {
            return '释放大锁失败, 此信号无权解锁' ;
        } else {
            TradeBot[this.LockTimeName] = null ;
            return true ;
        }
    },

    /**
     * 将新的出错信息写入 大TradeBot对象 中
     * @param {string} errMessage 
     */
    AddRunningWellMessage(errMessage) { AddSetMessage(TradeBot[this.RunningWellName], errMessage) } ,

    /**
     * 依据runningWellSet中是否有元素来判断是否有运行错误
     * @returns true: 运行中无错误
     * @returns false: 运行中有错误
     */
    isRunningWell() { return TradeBot[this.RunningWellName].size === 0 },

    /**
     * 获取当前toGCPData
     * @returns {Promise<Object>}
     */
    async Get_toGCPData() { return A2dToCleanObj(await GetGS(this.spreadsheetID, CV.toGCPRanges)) },

    /**
     * 检测当前GS中分布式锁的真实归属,
     * @returns {Promise<String>} String: 当前的lockName
     */
    async CheckLockFromGS(NotGotLockValueTo = 'NotGotLockValue') {return (await this.Get_toGCPData() )?.LOCK ?? NotGotLockValueTo } ,

    /**
     * 释放分布式排他锁
     * @param {number} [MAX_Attempts=99] 最多尝试解锁次数
     * @param {string} [NotGotLockValueTo='NotGotLockValue'] 未从GS中获取到锁状态时的默认值, 保持默认即可
     * @returns 因为try/catch, 不会抛错
     * @returns {Promise<boolean>} true:   解锁成功返回
     * @returns {Promise<string>}  string: 解锁失败原因
     */
    async ReleaseLockOfGS(MAX_Attempts = 99, NotGotLockValueTo = 'NotGotLockValue') {
        try {
            // 再次确权, 验证要加的锁, 是否与TradeBot中的锁相同
            if (TradeBot[this.LockTimeName] !== this.LockTime) { throw new Error('TradeBot存放的LockTime与当前写入的不符') }

            // 确权拦截：先看自己现在还有没有解锁的权力（防止自己超时被别人强刷后，误把别人的锁给解了）
            // 这种情况一旦发生, 说明运行有了问题, 需要处理
            const toGCPData = await this.Get_toGCPData();
            const currentLock = toGCPData?.LOCK ?? NotGotLockValueTo;
            if (currentLock === CV.noLOCK) { return true } // 因为会多次尝试解锁, 所以可以先判断是否锁已被解

            const hasRight = currentLock === this.lockName;
            if (isStrictFalse(hasRight)) { throw new Error ('当前锁状态出错, 并不是正在处理轮的锁, 出现系统错误') }

            let attempt = 1;
            while (attempt <= MAX_Attempts) {
                // 之所以用try是为了最大可能尝试解锁, 而不是仅仅报错
                try {
                    await UpdateGS(this.spreadsheetID, toGCPData.lockRange, [[CV.noLOCK]]);
                    await Sleep(100);
                    const lockNameAfterAttempt = await this.CheckLockFromGS();
                    if (lockNameAfterAttempt === CV.noLOCK) {return true}
                } catch {
                    await Sleep(1000);
                    attempt += 1;
                }
            }
            throw new Error(`经过${MAX_Attempts}次尝试, 仍无法解锁`) ;
        } catch (e) {
            // 这是核心错误, 需要写入TradeBot runningwell
            this.AddRunningWellMessage(e.message);
            return e.message ;
        }
    } ,

    /**
     * 获取GS数据, 并写入子对象中
     * 无返回值, 直接在对象上修改
     * @returns 因为有try/catch, 不会抛错
     * @returns true: 获取数据并写入对象成功
     * @returns string: 具体的出错信息
     */
    async Get_gsData() {
        try {
            const toGCPData = await this.Get_toGCPData() ;
            if(!Object.hasOwn(toGCPData, "LOCK") ) {throw new Error("get toGCPData error") }

            const rangesList = [    toGCPData.mainRange                ,       // 0 
                                    toGCPData.uncloseOrdersRange       ,       // 1
                                    toGCPData.ingOrderLine             ,       // 2
                                    toGCPData.tradeHistoryTitleLine    ,       // 3
                                    toGCPData.uncloseOrdersTitleLine   ,       // 4
                                    toGCPData.ingOrderTitleLine        ] ;     // 5
            const valuesArray   = await BatchGetGS(this.spreadsheetID, rangesList);

            const raw_mainData  = valuesArray[0];
            if (!Array.isArray(raw_mainData) || !Array.isArray(raw_mainData[0]) ) {throw new Error('didnt get available data, 1') }
            const mainData  = A2dToCleanObj(raw_mainData) ;
            if (    !Object.hasOwn(mainData, 'LOCK')    ||
                    !isStrictString(mainData.LOCK)      ||
                    mainData.LOCK !== this.lockName     )   {throw new Error('didnt get available data, 2') }

            const uncloseOrdersA2d      = isStrictTrue(mainData.therePosition) ? (valuesArray[1]).map(lines => CleanArrayToNumStrBool(lines)) : [] ;

            const ingOrderLineA         = mainData.ing_orderStatus === CV.order_waiting ? CleanArrayToNumStrBool(valuesArray[2][0]) : [] ;
            const ingOrderTitleA        = CleanArrayToNumStrBool(valuesArray[5][0]) ;
            const ingOrderData          = mainData.ing_orderStatus === CV.order_waiting ? A2LinesToCleanObj([ingOrderTitleA, ingOrderLineA]) : null ;

            const uncloseOrdersTitleA   = CleanArrayToNumStrBool(valuesArray[4][0]) ;

            const tradeHistoryTitleA    = CleanArrayToNumStrBool(valuesArray[3][0])  ;

            this.toGCPData              =  toGCPData            ;
            this.mainData               =  mainData             ;
            this.ingOrderData           =  ingOrderData         ;
            this.ingOrderTitleA         =  ingOrderTitleA       ;
            this.uncloseOrdersA2d       =  uncloseOrdersA2d     ;
            this.uncloseOrdersTitleA    =  uncloseOrdersTitleA  ;
            this.tradeHistoryTitleA     =  tradeHistoryTitleA   ;
            
            return true ;

        } catch(e) { 
        // 这里的错误是非核心错误, 可以在释放两个锁后, 抛出错误退出
            let errMessage = e.message + '\n' ;

            const r_ReleaseLockOfGS     =  await this.ReleaseLockOfGS() ; // 尝试给GS解锁
            const r_ReleaseTradeBotLOCK =  isStrictTrue(r_ReleaseLockOfGS) ? this.ReleaseTradeBotLOCK() : 'ReleaseLockOfGS() fail, no need to release TradeBot Lock' ;
            errMessage  += isStrictString(r_ReleaseLockOfGS)     ? r_ReleaseLockOfGS     + '\n' : 'GS LOCK释放成功'       + '\n';
            errMessage  += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : 'TradeBot LOCK释放成功' + '\n';
            return errMessage.trim() ;
        }
    } ,

    /**
     * initiate 仅仅是系统首次初始化 ; 
     * @returns 因为有try/catch, 不会抛错
     * @returns true: 初始化成功, 或者已经初始化过, 不必再次初始化
     * @returns string: 具体的出错信息
     */
    async ToCheckInitiate() {
        try {
            if (this.mainData.TradingSymbol !== this.tvData.TradingSymbol ) { throw new Error ('GS和TV中的TradingSymbol不符')}
                
            if (isStrictTrue(this.mainData.initiated)) {return true}

            // 初始化时间不能在GS中预设的交易开始时间之后
            if (this.tvData.timestamp > this.mainData.realTradeTime) {throw new Error('初始化时间不能在GS中预设的交易开始时间之后') }

            // 下面是初始化过程
            // 系统处于未初始化状态
            const iD = {} ;
            iD.initiated            =   true                                                                        ;
            iD.initiateTime         =   this.tvData.timestamp                                                       ;
            iD.inTradingSymbolPrice =   this.tvData.TradingSymbolPrice                                              ;
            iD.inBaseCoinPrice      =   this.tvData.BaseCoinPrice                                                   ;
            iD.initialFund          =   this.mainData.inFund + this.mainData.inCoin * this.tvData.BaseCoinPrice     ;
            iD.hghestFund           =   iD.initialFund                                                              ;
            iD.lowestFund           =   iD.initialFund                                                              ;
            iD.initialCoin          =   iD.initialFund / this.tvData.BaseCoinPrice                                  ;
            iD.hghestCoin           =   iD.initialCoin                                                              ;
            iD.lowestCoin           =   iD.initialCoin                                                              ;

            const i_toClearRangeSet     =  new Set()    ;
            const i_toUpdateRangeList   =  []           ;

            i_toClearRangeSet.add( this.toGCPData.ingOrderLine       )  ;
            i_toClearRangeSet.add( this.toGCPData.uncloseOrdersRange )  ;
            i_toClearRangeSet.add( this.toGCPData.tradeHistoryRange  )  ;
            i_toClearRangeSet.add( this.toGCPData.HghLowRange        )  ;
            i_toClearRangeSet.add( this.toGCPData.simBrokerRange     )  ;
            i_toClearRangeSet.add( this.toGCPData.BrokerRange        )  ;
            i_toClearRangeSet.add( this.toGCPData.toWriteMainRange   )  ;

            const newHghLowV    = [ [iD.initiated           ]    ,
                                    [iD.initiateTime        ]    ,
                                    [iD.inTradingSymbolPrice]    ,
                                    [iD.inBaseCoinPrice     ]    ,
                                    [iD.initialFund         ]    ,
                                    [iD.hghestFund          ]    ,
                                    [iD.lowestFund          ]    ,
                                    [iD.initialCoin         ]    ,
                                    [iD.hghestCoin          ]    ,
                                    [iD.lowestCoin          ]    ]   ;

            i_toUpdateRangeList.push(    {
                range   : this.toGCPData.HghLowRange     ,
                values  : newHghLowV                } ) ;

            await BatchClearGS(this.spreadsheetID, Array.from(i_toClearRangeSet));
            await Sleep(100) ;
            await BatchClearUpdateGS(this.spreadsheetID, i_toUpdateRangeList);
            await Sleep(100) ;

            const r_Get_gsData = await this.Get_gsData() ;
            if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
            if (!isStrictTrue(this.mainData.initiated)) {
                await Sleep(2000) ; // 第一次校验不成功的话, 等2s再校验一次
                const r_Get_gsData = await this.Get_gsData() ;
                if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
                if (!isStrictTrue(this.mainData.initiated)) {throw new Error('初始化后经校验初始化结果未更新') }
            }

            AddSetMessage(this.alertMessageSet, 'just initiated')  ;
            
            return true ;

        } catch(e) {
            // 这属于严重核心错误, 不必解锁了, 让它一直锁着, 等手动调试
            this.AddRunningWellMessage(e.message) ;
            return e.message ;
        }
    } ,

    /**
     * 检查fundfee
     * @param 调用前必须保证已更新过 Get_gsData()
     * @returns 因为有try/catch 不会抛错
     * @returns true: 表示收取fundFee并写入成功, 或者不需要检查fundfee并成功退出
     * @returns String: 具体的出错信息
     */
    async ToCheckFundFee() {
        try {
            const mainData              = this.mainData                     ;
            const tvData                = this.tvData                       ;
            const tradeHistoryTitleA    = this.tradeHistoryTitleA           ; // array
            const tradeHistoryRange     = this.toGCPData.tradeHistoryRange  ; // string

            let toCheckFundFee = false;
            if (isStrictNumber(mainData.lstFundTime)) {
                const lstRound = Math.floor(mainData.lstFundTime / 28800000); // 8 * 60 * 60 * 1000
                const thisRound = Math.floor(tvData.timestamp / 28800000);
                toCheckFundFee = lstRound === thisRound ? false : true;
            } else { toCheckFundFee = true }

            if (isStrictFalse(toCheckFundFee)) { return true } 

            const fund = {}  ;
            fund.orderID          = 'F-' + GetTimeStringWithOffset(8, 28800000 * Math.floor(tvData.timestamp / 28800000))  ;
            fund.orderTimestamp   = Date.now()                                                                             ;
            fund.orderDate        = GetTimeStringWithOffset(8, fund.orderTimestamp)                                        ;
            fund.buysell          = CV.order_FUND                                                                          ;
            fund.avgBuyPrice      = mainData.avgBuyPrice                                                                   ;
            fund.reason           = "FundFee"                                                                              ;
            fund.orderStatus      = CV.order_pending                                                                       ;
            fund.lst_allFundFee   = ToStrictNumber(mainData.allFundFee     , 0                       )                     ;
            fund.inCoin           = ToStrictNumber(mainData.inCoin         , 0                       )                     ;
            fund.inFund           = ToStrictNumber(mainData.inFund         , 0                       )                     ;
            fund.BaseCoinPrice    = ToStrictNumber(tvData.BaseCoinPrice    , mainData.BaseCoinPrice  )                     ;
            fund.isReal           = mainData.isReal                                                                        ;
            fund.TradingSymbol    = tvData.TradingSymbol                                                                   ;
            fund.spreadsheetID    = this.spreadsheetID                                                                     ;

            await CheckFundFee(fund);
            if (!fund.respOK) {throw new Error('交易所返回数据不正确')}

            const newFundHistoryA = tradeHistoryTitleA.map(v => isStrictNumber(fund[v]) ? fund[v] : (fund[v] || CV.NA));

            await AppendGS(this.spreadsheetID, tradeHistoryRange, [newFundHistoryA]);

            const r_Get_gsData = await this.Get_gsData() ;
            if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
            // 校验写入的最后fund时间是否与本次写入一致
            if (this.mainData.lstFundTime !== fund.confirmTimestamp) {
                await Sleep(2000) ; // 第一次校验不成功的话, 等2s再校验一次
                const r_Get_gsData = await this.Get_gsData() ;
                if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
                if (this.mainData.lstFundTime !== fund.confirmTimestamp) {throw new Error('检查fundFee后经校验GS数据未更新') }
            }

            AddSetMessage(this.alertMessageSet, `New fund fee: ${fund.fundFee}`)  ;

            return true;
        } catch (e) { 
            // 这里的错误是非核心错误, 可以在释放两个锁后, 抛出错误退出
            let errMessage = e.message + '\n' ;

            const r_ReleaseLockOfGS     =  await this.ReleaseLockOfGS() ; // 尝试给GS解锁
            const r_ReleaseTradeBotLOCK =  isStrictTrue(r_ReleaseLockOfGS) ? this.ReleaseTradeBotLOCK() : 'ReleaseLockOfGS() fail, no need to release TradeBot Lock' ;
            errMessage  += isStrictString(r_ReleaseLockOfGS)     ? r_ReleaseLockOfGS     + '\n' : 'GS LOCK释放成功'       + '\n';
            errMessage  += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : 'TradeBot LOCK释放成功' + '\n';
            return errMessage.trim() ;
        }

    },

    /**
     * 判断waiting 订单状态
     * @returns 因为有try/catch, 不会抛错
     * @returns true: 检查成功, 只表示检查过程无误, 可能没有需要检查的订单, 也可能是有订单但没有成交, 也可能是有成交并成功写入
     * @returns string: 具体的出错信息
     */
    async ToCheckWaitingOrder() {
        try {
            const tvData                =  this.tvData                  ;
            const mainData              =  this.mainData                ;
            const toGCPData             =  this.toGCPData               ;
            const ingOrderData          =  this.ingOrderData            ;
            const ingOrderTitleA        =  this.ingOrderTitleA          ;
            const uncloseOrdersA2d      =  this.uncloseOrdersA2d        ;
            const uncloseOrdersTitleA   =  this.uncloseOrdersTitleA     ;
            const tradeHistoryTitleA    =  this.tradeHistoryTitleA      ;

            if (!isStrictTrue(mainData.ifOrderWaiting)) { return true }

            ingOrderData.isReal             = mainData.isReal                                                       ;
            ingOrderData.TradingSymbol      = tvData.TradingSymbol                                                  ;
            ingOrderData.spreadsheetID      = this.spreadsheetID                                                    ;
            ingOrderData.lst_allGotProfit   = ToStrictNumber(mainData.allGotProfit  , 0                      )      ;
            ingOrderData.lst_allTradeFee    = ToStrictNumber(mainData.allTradeFee   , 0                      )      ;
            ingOrderData.inCoin             = ToStrictNumber(mainData.inCoin        , 0                      )      ;
            ingOrderData.inFund             = ToStrictNumber(mainData.inFund        , 0                      )      ;
            ingOrderData.BaseCoinPrice      = ToStrictNumber(tvData.BaseCoinPrice   , mainData.BaseCoinPrice )      ;

            ingOrderData.ifWaitingThenCancel = true;
            if (ingOrderData.ing_buysell === CV.order_BUY  && tvData.TradingSymbolPrice < ingOrderData.ing_orderPrice * (1 + tvData.waveUpChg)) { ingOrderData.ifWaitingThenCancel = false }
            if (ingOrderData.ing_buysell === CV.order_SELL && tvData.TradingSymbolPrice > ingOrderData.ing_orderPrice * (1 + tvData.waveDnChg)) { ingOrderData.ifWaitingThenCancel = false }

            // 去交易所查看成交情况
            await CheckOrderConfirm(ingOrderData);
            if (!ingOrderData.respOK) {throw new Error('交易所返回数据有错')}

            const w_toUpdateRangeList       = []            ;
            const w_toClearRangeSet         = new Set()     ;
            const w_toAppendTradeHistory    = {}            ;

            // 对于部分成交的情况,
            // 按照成交逻辑, 如果返回order_cancel的话, 表示订单没有任何成交
            // 如果传入了撤单命令, 但是订单有成交的话, 返回的订单状态为order_confirm, 但是ing_qty参数做了修改
            // 如果ifWaitingThenCancel = false,  只修改ing_orderStatus一个变量
            // 如果ifWaitingThenCancel = true ,  当做confirm来判断
            // 需要注意的是卖单, 如果部分成交的话, 不能简单地将uncloseOrders中的那个订单删掉, 需要修改那一行, 而不是删掉那一行

            if (ingOrderData.ing_orderStatus === CV.order_confirm ) {

                if (ingOrderData.ing_buysell === CV.order_BUY) {
                    const newUncloseOrderLine = uncloseOrdersTitleA.map(v => isStrictNumber(ingOrderData['ing_' + v]) ? ingOrderData['ing_' + v] : (ingOrderData['ing_' + v] || CV.NA));
                    uncloseOrdersA2d.push(newUncloseOrderLine);
                }
                if (ingOrderData.ing_buysell === CV.order_SELL) {
                    const index_orderID         =  uncloseOrdersTitleA.indexOf('orderID')       ;
                    const index_serial          =  uncloseOrdersTitleA.indexOf('serial')        ;
                    const index_confirmPrice    =  uncloseOrdersTitleA.indexOf('confirmPrice')  ;
                    const index_qty             =  uncloseOrdersTitleA.indexOf('qty')           ;
                    const index_pXq             =  uncloseOrdersTitleA.indexOf('pXq')           ;

                    const thisSellSerial = -1 * ingOrderData.ing_serial;
                    const indexOfBoughtOrder = uncloseOrdersA2d.findIndex(orderA => Math.abs(orderA[index_serial] - thisSellSerial) < 0.1);
                    if (indexOfBoughtOrder < 0) {throw new Error('无法在未成交买单中找到对应的现在的卖单')}
                    if (isStrictNumber(ingOrderData.ing_isPartial) && ingOrderData.ing_isPartial < 1) {
                        // 卖单部分成交的情况, 相对比较复杂
                        const theBoughtOrder = uncloseOrdersA2d[indexOfBoughtOrder] ; // 直接拿到的就是对应的订单的地址, 对他的修改相当于直接修改原始订单
                        theBoughtOrder[index_orderID]   =  'PB-' + GetTimeStringWithOffset(8, this.timestamp)               ;
                        theBoughtOrder[index_qty]       =  (1-ingOrderData.ing_isPartial) * theBoughtOrder[index_qty]       ;
                        theBoughtOrder[index_pXq]       =  theBoughtOrder[index_confirmPrice] * theBoughtOrder[index_qty]   ;
                        // uncloseOrdersA2d[indexOfBoughtOrder] = theBoughtOrder ; // 这一行可以去掉, 因为引用的直接是地址
                    } else {uncloseOrdersA2d.splice(indexOfBoughtOrder, 1)}
                }

                w_toClearRangeSet.add(toGCPData.ingOrderLine);
                w_toClearRangeSet.add(toGCPData.uncloseOrdersRange);

                const newTradeHistoryA = tradeHistoryTitleA.map(v => isStrictNumber(ingOrderData['ing_' + v]) ? ingOrderData['ing_' + v] : (ingOrderData['ing_' + v] || CV.NA));
                w_toAppendTradeHistory.toAppend     = true;
                w_toAppendTradeHistory.range        = toGCPData.tradeHistoryRange;
                w_toAppendTradeHistory.values       = [newTradeHistoryA];

                if (uncloseOrdersA2d.length > 0) { w_toUpdateRangeList.push({ range: toGCPData.uncloseOrdersRange, values: uncloseOrdersA2d }) }

                const thisMessage = isStrictNumber(ingOrderData.ing_isPartial) ?
                    (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + `Order partially ${Math.round(1000*ingOrderData.ing_isPartial)/10}% confirmed, but order canceled` :
                    (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + `Order fully confirmed`;

                AddSetMessage(this.alertMessageSet, thisMessage) ;
            }

            if (ingOrderData.ing_orderStatus === CV.order_partial && ingOrderData.ing_partial - ingOrderData.lst_partial> 0.1 ) {
                const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(ingOrderData[v]) ? ingOrderData[v] : ingOrderData[v] || CV.NA);
                w_toUpdateRangeList.push({ range: toGCPData.ingOrderLine, values: [new_ingOrderLineA] });
                AddSetMessage(this.alertMessageSet, (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + "Order more partial confirmed");
            }

            if (ingOrderData.ing_orderStatus === CV.order_cancel) {
                w_toClearRangeSet.add(toGCPData.ingOrderLine);
                AddSetMessage(this.alertMessageSet, (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + "Order canceled");
            }

            await BatchClearGS(this.spreadsheetID, Array.from(w_toClearRangeSet));
            await BatchClearUpdateGS(this.spreadsheetID, w_toUpdateRangeList);
            if (isStrictTrue(w_toAppendTradeHistory.toAppend)) { await AppendGS(this.spreadsheetID, w_toAppendTradeHistory.range, w_toAppendTradeHistory.values) }

            // 交易记录更新后, 需要重新获取GS数据
            const r_Get_gsData = await this.Get_gsData() ;
            if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
            
            return true;
        } catch(e) {
            // 这里的错误是非核心错误, 可以在释放两个锁后, 抛出错误退出
            let errMessage = e.message + '\n' ;

            const r_ReleaseLockOfGS     =  await this.ReleaseLockOfGS() ; // 尝试给GS解锁
            const r_ReleaseTradeBotLOCK =  isStrictTrue(r_ReleaseLockOfGS) ? this.ReleaseTradeBotLOCK() : 'ReleaseLockOfGS() fail, no need to release TradeBot Lock' ;
            errMessage  += isStrictString(r_ReleaseLockOfGS)     ? r_ReleaseLockOfGS     + '\n' : 'GS LOCK释放成功'       + '\n';
            errMessage  += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : 'TradeBot LOCK释放成功' + '\n';
            return errMessage.trim() ;

        }
    },

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
     * 将新数据写入bot对象中 ; 
     * @param {Object} newData 需要写入的新数据, 需保证newData是clean状态
     * @returns string: 失败返回具体熔断错误字符串
     */
    UpdateDataToBot(newData) {
        // 前置安全门禁与类型确权
        if (!isObjectOfKeyValue(newData)) {
            return 'incoming newData must be a valid plain object';
        }
        Object.keys(newData).forEach(key => {
            if (this.isCanWriteAtt(key)) {this[key] = newData[key]}
        }) ;
        return true ;
    } ,

    /**
     * 计算 [liquidatePrice, stopPriceC, stopPriceF] ; 
     * 直接从this大对象中获取必要参数, 不需要额外输入 
     * @returns 计算后的 [liquidatePrice, stopPriceC, stopPriceF]
     */
    GetLiquidateStopPrice() {
        // 基础变量提取 (命名对齐你的 GetAccountStatusByPrice)
        let C = this.crtCoin;
        let S = this.BaseCoinPrice;
        let P = this.TradingSymbolPrice;
        let L = this.allPosition;
        let K = this.inFund + this.netProfit;
        let A = this.avgBuyPrice;
        let H = this.BaseCoinHairCut;
        let R = this.waveUpChg;
        let D = this.Adn2B;
        let SF = this.stopRate4F;
        let SC = this.stopRate4C;
        let NF = this.notStop4F;
        let NC = this.notStop4C;
        let HF = this.hghestFund;
        let HC = this.hghestCoin;

        let liquidatePrice = null;
        let stopPriceC = null;
        let stopPriceF = null;

        // ==========================================
        // 1. 求 _liquidatePrice (爆仓价)
        // 条件: V_f(P, Haircut) = R * L * P
        // ==========================================
        let slope_f_h = (C * S * D * H / P) + L;
        let intercept_f_h = K - (L * A) + (C * S * H * (1 - D));

        // 方程: slope_f_h * P + intercept_f_h = R * L * P
        // 移项: P * (slope_f_h - R * L) = -intercept_f_h
        liquidatePrice = -intercept_f_h / (slope_f_h - R * L);

        // ==========================================
        // 2. 求 _stopPriceF (金本位止损价)
        // 需要计算两个条件：stopRate4F (止损) 和 notStop4C (交叉限制)
        // 最终取两者中较高的价格 (即下跌时先碰到的那个)
        // ==========================================
        let slope_f = (C * S * D / P) + L;
        let intercept_f = K - (L * A) + (C * S * (1 - D));

        let targetF_1 = HF * (1 + SF / 100);
        let targetF_2 = HF * (1 + NF / 100);

        let resF1 = (targetF_1 - intercept_f) / slope_f;
        let resF2 = (targetF_2 - intercept_f) / slope_f;

        // 根据你的逻辑，最终结果由交叉条件限制，此处取 math.min 对应下跌时更高的价格
        stopPriceF = Math.min(resF1, resF2);

        // ==========================================
        // 3. 求 _stopPriceC (币本位止损价)
        // 条件: V_f(P, H=1) / P_b(P) = TargetCoin
        // ==========================================
        let targetC_1 = HC * (1 + SC / 100);
        let targetC_2 = HC * (1 + NC / 100);

        // 币本位方程推导: (slope_f * P + intercept_f) / (S0 * (1 + (P-P0)/P0 * Adn2B)) = Target
        // 令 m_slope = S0 * Adn2B / P0, m_intercept = S0 * (1 - Adn2B)
        let m_slope = S * D / P;
        let m_intercept = S * (1 - D);

        // 方程化简为一次方程: P * (slope_f - Target * m_slope) = Target * m_intercept - intercept_f
        let resC1 = (targetC_1 * m_intercept - intercept_f) / (slope_f - targetC_1 * m_slope);
        let resC2 = (targetC_2 * m_intercept - intercept_f) / (slope_f - targetC_2 * m_slope);

        stopPriceC = Math.min(resC1, resC2);

        return [liquidatePrice, stopPriceC, stopPriceF];

    },

    valueIfChg(chgPct) {
        const then_Price        =  this.TradingSymbolPrice * (1+chgPct) ;
        const then_openProfit   =  this.therePosition ? this.allPosition * (then_Price - this.avgBuyPrice) : 0 ;
        const then_b_chgPct     =  (chgPct > 0 ? this.Aup2B : this.Adn2B) * chgPct ;
        const then_b_Price      =  this.BaseCoinPrice * (1+then_b_chgPct) ;
        const then_allFUnd      =  this.inCoin * then_b_Price + this.inFund + this.netProfit + then_openProfit ;
        const then_allCoin      =  then_allFUnd / then_b_Price ;
        return {then_allFUnd, then_allCoin} ;
    } ,

    /**
     * 计算在当前仓位下, 如果allFund变化多少的时候, 标的价格应当变化多少, 才会导致allFund变化这个多
     * @param {number} valueFchgpct  例如, -0.2
     * @param {number} findUPchgpctLimit 例如 0.1
     * @param {number} findDNchgpctLimit 例如 -1.1
     * @returns 会抛出错误
     * @returns number 计算出来的数值
     */
    chgPctIfVALUEFchg(valueFchgpct = -0.2, findUPchgpctLimit = 0.1, findDNchgpctLimit = -1.1) {
        if (!isStrictNumber(valueFchgpct) || !isStrictNumber(findUPchgpctLimit) || !isStrictNumber(findDNchgpctLimit)) {
            throw new Error('valueFchgpct, findUPchgpctLimit, findDNchgpctLimit 输入错误') ;
        } ;
        const minchgpct       = MinABSnumber(c1, c2) ;
        const then_allFund    = this.allFund * (1+valueFchgpct)    ;
        const upLimit_allFund = this.valueIfChg(findUPchgpctLimit) ;
        const dnLimit_allFund = this.valueIfChg(findDNchgpctLimit) ;


        if (then_allFund > this.allFund && upLimit_allFund < then_allFund && dnLimit_allFund < then_allFund) {return false} 
        if (then_allFund > this.allFund && upLimit_allFund > then_allFund && dnLimit_allFund > then_allFund) {return false} 

        if (then_allFund < this.allFund && upLimit_allFund < then_allFund && dnLimit_allFund < then_allFund) {return false} 

        let found       =   false                       ;
        let findUp      =   then_allFund > this.allFund ;
        let fi          =   0                           ;
        let fchgpctStep =   0.1                         ;
        let fchgpct     =    findUPchgpctLimit           ;
        while(!found && fchgpct > findDNchgpctLimit) {
            fchg = findUPchgpctLimit - fchgstep * fi ;
            const i_allFund = this.valueIfChg(fchg).then_allFUnd ;
            // if 

        }

    } ,

    chgpctIfVALUECchg(valueCChg) {

    } ,











    /**
     * 对当前账户状态进行更新 ; 
     * 直接从bot对象中获取数据, 不需要额外输入 ; 
     * bot对象中的数据, 来源于GS, TV ;
     * 除了修改的数据之外, 认为这些数据是绝对正确的
     */
    ReNew() {
        this.openProfit     = isStrictTrue(this.therePosition) ? this.allPosition * (this.TradingSymbolPrice - this.avgBuyPrice) : CV.NA       ;
        this.allProfit      = ToStrictNumber(this.netProfit, 0) + ToStrictNumber(this.openProfit, 0)                                        ;
        this.usedMargin     = isStrictTrue(this.therePosition) ? this.allPosition * this.TradingSymbolPrice / this.leverage : CV.NA            ;
        this.crtFund        = this.inFund + ToStrictNumber(this.netProfit, 0) + ToStrictNumber(this.openProfit, 0)                          ;
        this.crtCoin        = this.inCoin                                                                                                   ;
        this.freeMargin     = this.crtFund + this.crtCoin * this.BaseCoinPrice * this.BaseCoinHairCut - ToStrictNumber(this.usedMargin, 0)  ;
        this.allFund        = this.crtFund + this.crtCoin * this.BaseCoinPrice                                                              ;
        this.allCoin        = this.crtFund / this.BaseCoinPrice + this.crtCoin                                                              ;

        this.rcd_fund = ToStrictNumber(this.rcd_fund, this.allFund);
        this.rcd_coin = ToStrictNumber(this.rcd_coin, this.allCoin);

        if (isStrictString(this.lstRcdTouchHghTime)) {
            this.markTouchTargetHgh     = false                     ;
            this.lstRcdTouchHghTime     = this.lstTouchHghTime      ;
            this.lstRcdTargetHgh        = this.lstTargetHgh         ;
        }
        if (isStrictNumber(this.lstRcdTouchHghTime) && this.lstRcdTouchHghTime < this.lstTouchHghTime) {
            this.markTouchTargetHgh     = true                          ;
            this.lstRcdTouchHghTime     = this.lstTouchHghTime          ;
            this.lstRcdTargetHgh        = this.lstTargetHgh             ;
            AddSetMessage(this.alertMessageSet, "↑ markTouchTargetHgh") ;
        }
        if (isStrictString(this.lstRcdTouchLowTime)) {
            this.markTouchTargetLow     = false                     ;
            this.lstRcdTouchLowTime     = this.lstTouchLowTime      ;
            this.lstRcdTargetLow        = this.lstTargetLow         ;
        }
        if (isStrictNumber(this.lstRcdTouchLowTime) && this.lstRcdTouchLowTime < this.lstTouchLowTime) {
            this.markTouchTargetLow     = true                          ;
            this.lstRcdTouchLowTime     = this.lstTouchLowTime          ;
            this.lstRcdTargetLow        = this.lstTargetLow             ;
            AddSetMessage(this.alertMessageSet, "↓ markTouchTargetLow") ;
        }


        [this.liquidatePrice, this.stopPriceC, this.stopPriceF] = this.GetLiquidateStopPrice();
        this.liquidatePrice = isStrictTrue(this.therePosition) ? this.liquidatePrice : CV.NA ;
        this.stopPriceC     = isStrictTrue(this.therePosition) ? this.stopPriceC     : CV.NA ;
        this.stopPriceF     = isStrictTrue(this.therePosition) ? this.stopPriceF     : CV.NA ;

        this.ifOrderWaiting = this.ing_orderStatus === CV.order_waiting;


        // 账户状态判断
        this.accStatus = 'Normal';

        if (this.TradingSymbolPrice < this.liquidatePrice) {
            const accStatus_liquidated = "liquidated";
            this.accStatus = accStatus_liquidated;
            AddSetMessage(this.alertMessageSet, accStatus_liquidated);
        }
        if (this.TradingSymbolPrice < this.stopPriceC) {
            const accStatus_stopC = "stopC";
            this.accStatus = accStatus_stopC;
            AddSetMessage(this.alertMessageSet, accStatus_stopC);
        }
        if (this.TradingSymbolPrice < this.stopPriceF) {
            const accStatus_stopF = "stopF";
            this.accStatus = accStatus_stopF;
            AddSetMessage(this.alertMessageSet, accStatus_stopF);
        }
        if (this.TradingSymbolPrice < this.stopPriceC && this.TradingSymbolPrice < this.stopPriceF) {
            const accStatus_stopCF = "stopCF";
            this.accStatus = accStatus_stopCF;
            AddSetMessage(this.alertMessageSet, accStatus_stopCF);
        }

        if (this.allFund > this.rcd_fund * (1 + this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↑ new rcd_fund'); }
        if (this.allFund < this.rcd_fund * (1 - this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↓ new rcd_fund'); }
        if (this.allCoin > this.rcd_coin * (1 + this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↑ new rcd_coin'); }
        if (this.allCoin < this.rcd_coin * (1 - this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↓ new rcd_coin'); }

        if (this.allFund > this.hghestFund) { this.toWriteHghLow = true; this.hghestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↑ new hghestFund"); }
        if (this.allFund < this.lowestFund) { this.toWriteHghLow = true; this.lowestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↓ new lowestFund"); }
        if (this.allCoin > this.hghestCoin) { this.toWriteHghLow = true; this.hghestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↑ new hghestCoin"); }
        if (this.allCoin < this.lowestCoin) { this.toWriteHghLow = true; this.lowestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↓ new lowestCoin"); }

        this.closeToRndHgh = this.roundHgh / Math.pow((1 + this.waveUpChg), this.notBuyCloseToRndHghStep);
        this.closeToRndLow = this.roundLow / Math.pow((1 + this.waveDnChg), this.notBuyCloseToRndLowStep);

        this.hghToBuy = Math.min(this.basicHghToBuy,
            this.closeToRndHgh,
            ToStrictNumber(this.lowBuyPriceUnclose, this.basicHghToBuy));

        this.lowToBuy = Math.max(this.basicLowToBuy, this.closeToRndLow);
        this.lowToSell = Math.max(this.basicLowToSell);

        this.inTradingTime = this.timestamp > this.realTradeTime && this.timestamp < this.realTradeTimeTo;

        this.canBuy = true;
        this.cantBuyReason = "";
        this.canSell = true;
        this.cantSellReason = "";

        if (!this.inTradingTime) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'not in trading time');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'not in trading time');
        }

        if (this.timestamp - this.lstTradeTime < this.ordersInterval * 60000) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'there order just done, wait some time');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'there order just done, wait some time');
        }

        if (this.ifOrderWaiting) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'there order waiting');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'there order waiting');
        }

        if (Number(this.gridNum) >= Number(this.MaxGrid)) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + "gridNum >= MaxGrid");
        }

        if (this.TradingSymbolPrice > this.basicHghToBuy) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'price > basicHghToBuy');
        }
        if (this.TradingSymbolPrice > this.closeToRndHgh) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'price closeToRndHgh');
        }
        if (this.TradingSymbolPrice > this.lowBuyPriceUnclose) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'price > lowBuyPriceUnclose');
        }
        if (this.TradingSymbolPrice < this.basicLowToBuy) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'price < basicLowToBuy');
        }
        if (this.TradingSymbolPrice < this.closeToRndLow) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'price closeToRndLow');
        }
        if (this.freeMargin / (this.MaxGrid - this.gridNum) < 1.1 * this.minEnExPosition * this.TradingSymbolPrice / this.leverage) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'Not enough freeMargin');
        }

        if (this.TradingSymbolPrice < this.basicLowToSell) {
            this.canSell = false;
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'price < basicLowToSell');
        }

        if (!isStrictTrue(this.therePosition)) {
            this.canSell = false;
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'No position to sell');
        }

        AddSetMessage(this.alertMessageSet, this.cantBuyReason);
        AddSetMessage(this.alertMessageSet, this.cantSellReason);

        delete this.cantBuyReason;
        delete this.cantSellReason;
    },

    /**
     * 判断是否要发出卖单, 并实际下单
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true: 执行完毕, 可能卖出, 也可能不卖出, 只是整个流程没有遇到问题
     * @returns string: 执行错误信息
    */
    async ToSell() {
        if (!isStrictTrue(this.canSell)) { return true }

        try {
            
            const uncloseOrdersA2d      =  this.uncloseOrdersA2d         ;
            const uncloseOrdersTitleA   =  this.uncloseOrdersTitleA      ;
            const ingOrderTitleA        =  this.ingOrderTitleA           ;
            const ingOrderLine          =  this.toGCPData.ingOrderLine   ;

            let toSell = false;
            let toSellOrderA;
            const S = {};

            const idx_orderID       = uncloseOrdersTitleA.indexOf('orderID')        ;
            const idx_serial        = uncloseOrdersTitleA.indexOf('serial')         ;
            const idx_confirmPrice  = uncloseOrdersTitleA.indexOf('confirmPrice')   ;
            const idx_qty           = uncloseOrdersTitleA.indexOf('qty')            ;

            // touch targetHgh
            if ((this.TradingSymbolPrice > (1 + this.waveUpChg) * this.lowBuyPriceUnclose) && this.markTouchTargetHgh) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.lowBuySerialUnclose));
                S.ing_orderPrice = this.lstRcdTargetHgh;
                S.ing_orderType  = CV.order_T_LMT ;
                S.ing_reason = 'touchTargetHgh';
            }
            // mustSellProfitStep
            if ((this.TradingSymbolPrice > Math.pow((1 + this.waveUpChg), this.mustSellProfitStep) * Math.max(this.lowBuyPriceUnclose, this.avgBuyPriceUnclose))) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.lowBuySerialUnclose));
                S.ing_orderPrice = this.TradingSymbolPrice ;
                S.ing_orderType  = CV.order_T_LMT ;
                S.ing_reason = 'must sell Profit';
            }
            // cut too high buy order
            if ((this.hghBuyPriceUnclose / this.TradingSymbolPrice > this.roundHgh / this.roundLow) && (this.hghBuyPriceUnclose > (1 + this.waveUpChg) * this.TradingSymbolPrice)) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = 0;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut too hgh buy order';
            }
            // cut due to stopC
            if (this.TradingSymbolPrice < this.stopPriceC) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = 0;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut due to stopC';
            }
            // cut due to stopF
            if (this.TradingSymbolPrice < this.stopPriceF) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = 0;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut due to stopF';
            }
            // cut to prevent liquidate
            if (this.TradingSymbolPrice < (1 + this.mustSellToPreventLiq / 100) * this.liquidatePrice) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = 0;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut to prevent liquidate';
            }

            if (isStrictFalse(toSell)) { return true }

            S.ing_orderID           = toSellOrderA[idx_orderID].trim().replace('B', 'S')                        ;
            S.ing_orderTimestamp    = Date.now()                                                                ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)                          ;
            S.ing_serial            = -1 * toSellOrderA[idx_serial]                                             ;
            S.ing_buysell           = CV.order_SELL                                                             ;
            S.ing_triggerPrice      = this.TradingSymbolPrice                                                   ;
            S.ing_orderType         = S.ing_orderType  || CV.order_T_LMT                                        ;
            S.ing_orderPrice        = isStrictNumber(S.ing_orderPrice) ? S.ing_orderPrice : S.ing_triggerPrice  ;
            S.ing_boughtPrice       = toSellOrderA[idx_confirmPrice]                                            ;
            S.ing_qty               = -1 * toSellOrderA[idx_qty]                                                ;
            S.ing_orderStatus       = CV.order_pending                                                          ;
            S.isReal                = this.isReal                                                               ;
            S.TradingSymbol         = this.TradingSymbol                                                        ;
            S.spreadsheetID         = this.spreadsheetID                                                        ;

            await SendOrderToBroker(S);
            if (!S.respOK) {throw new Error('交易所返回数据不正确')}
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.toUpdateRangeList.push({ range: ingOrderLine, values: [new_ingOrderLineA] });

            AddSetMessage(this.alertMessageSet, "New sell order, waiting confirmed");

            this.canBuy = false;
            AddSetMessage(this.alertMessageSet, 'cant buy: just a new sellOrder sent');

            return true;
        } catch(e) {
            // 这是核心错误, 不能解锁, 需要手动查看
            const errMessage = `核心错误: ${e.message}`.trim() ;
            this.AddRunningWellMessage(errMessage) ;
            return errMessage ;
        }

    },

    /**
     * 判断是否要发出买单, 并实际下单
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true: 执行完毕, 可能执行买入, 也可能不执行, 只是整个流程没有遇到问题
     * @returns string: 执行错误信息
    */
    async ToBuy() {
        if (!isStrictTrue(this.canBuy)) { return true }

        try {
            const ingOrderTitleA = this.ingOrderTitleA          ;
            const ingOrderLine   = this.toGCPData.ingOrderLine  ;

            let toBuy = false;
            const S = {};

            if (isStrictTrue(this.markTouchTargetLow)) {
                toBuy = true;
                S.ing_orderPrice = this.lstRcdTargetLow;
                S.ing_orderType = CV.order_T_LMT;
                S.ing_reason = 'touchTargetLow';
            }

            if (isStrictFalse(toBuy)) { return true }

            S.ing_orderID           = 'B-' + GetTimeStringWithOffset(8, this.timestamp)                                                                                                             ;
            S.ing_orderTimestamp    = Date.now()                                                                                                                                                    ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)                                                                                                              ;
            S.ing_serial            = ToStrictNumber(this.lstBuySerial, 0) + 1                                                                                                                      ;
            S.ing_buysell           = CV.order_BUY                                                                                                                                                  ;
            S.ing_triggerPrice      = this.TradingSymbolPrice                                                                                                                                       ;
            S.ing_orderType         = S.ing_orderType || CV.order_T_LMT                                                                                                                             ;
            S.ing_orderPrice        = isStrictNumber(S.ing_orderPrice) ? S.ing_orderPrice : S.ing_triggerPrice                                                                                      ;
            S.ing_qty               = this.minEnExPosition * Math.max(1, Math.floor(this.freeMargin * this.leverage / S.ing_orderPrice / this.minEnExPosition / (this.MaxGrid - this.gridNum)))     ;
            S.ing_orderStatus       = CV.order_pending                                                                                                                                              ;
            S.isReal                = this.isReal                                                                                                                                                   ;
            S.TradingSymbol         = this.TradingSymbol                                                                                                                                            ;
            S.spreadsheetID         = this.spreadsheetID                                                                                                                                            ;

            await SendOrderToBroker(S);
            if (!S.respOK) { throw new Error('交易所返回数据不正确') }
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.toUpdateRangeList.push({ range: ingOrderLine, values: [new_ingOrderLineA] });

            AddSetMessage(this.alertMessageSet, "New buy order: waiting confirmed");

            this.canSell = false;
            AddSetMessage(this.alertMessageSet, 'cant sell: just a new buyOrder sent');

            return true;

        } catch (e) {
            // 这是核心错误, 不能解锁, 需要手动查看
            const errMessage = `核心错误: ${e.message}`.trim() ;
            this.AddRunningWellMessage(errMessage) ;
            return errMessage ;
        }
    },

    /**
     * 将this大对象中的数据写入GS
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true表示写入成功
     * @returns string: 具体的出错信息
     */
    async WriteToGS() {
        try {
            await BatchClearGS(this.spreadsheetID, Array.from(this.toClearRangeSet));
            if (this.alertMessageSet.size > 0) { this.alertMessage = StrFromSetMessage(this.alertMessageSet) }

            this.gcpWriteTime = Date.now();

            if (isStrictTrue(this.toWriteHghLow)) {
                const newHghLowV = [    [this.initiated             ]   ,
                                        [this.initiateTime          ]   ,
                                        [this.inTradingSymbolPrice  ]   ,
                                        [this.inBaseCoinPrice       ]   ,
                                        [this.initialFund           ]   ,
                                        [this.hghestFund            ]   ,
                                        [this.lowestFund            ]   ,
                                        [this.initialCoin           ]   ,
                                        [this.hghestCoin            ]   ,
                                        [this.lowestCoin            ]   ]   ;

                this.toUpdateRangeList.push({ range: this.toGCPData.HghLowRange, values: newHghLowV });
            }

            this.toUpdateRangeList.push({ range: this.toGCPData.toWriteMainRange, values: ObjToA2dNumBoolStr(this) });

            await BatchClearUpdateGS(this.spreadsheetID, this.toUpdateRangeList);

            return true;
        } catch (e) {
            // 这是核心错误, 不能解锁, 需要手动查看
            const errMessage = `核心错误: ${e.message}`.trim();
            this.AddRunningWellMessage(errMessage);
            return errMessage;
        }

    },

    /**
     * 发送TG
     * @returns 会抛出错误, 但无返回值
     */
    async SendToTG() {
        const toReadRange = this.toGCPData.toReadRange;
        const rawMessagesA2d = (await GetGS(this.spreadsheetID, toReadRange, 'read')).map(v => CleanArrayToNumStrBool(v));
        const messageString = FormatMatrixToString(rawMessagesA2d);

        const subject = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + '_' + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime);

        await SendTG(subject, messageString);
    },

    /**
     * 发送Email
     * @returns 会抛出错误, 但无返回值
     */
    async SendToEmail() {
        const toEmailRange = this.toGCPData.toEmailRange;
        const rawMessagesA2d = (await GetGS(this.spreadsheetID, toEmailRange, 'read')).map(v => CleanArrayToNumStrBool(v));
        const messageHTML = ConvertRowsToHtmlTable(rawMessagesA2d);
        const mail_subject = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + '_' + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime);
        await SendEmail(mail_subject, messageHTML);
    },

};


export async function HandleTradeBot(tvData) {
    const gcpGetTime = Date.now() ;
    // 清洗来自TV的数据
    Object.keys(tvData).forEach(key => {
        tvData[key] = ToStrictNumBoolStr(tvData[key], 'notAvailableValueFromTV') ;
        if ( isStrictString(tvData[key]) && tvData[key].includes(CV.HuanHang) ) { tvData[key] = tvData[key].replaceAll(CV.HuanHang, '\n').trim() }
    } ) ;

    const bot = Object.create(TradeBot);

    const r_CreateBasicAttr = await bot.CreateBasicAttr(tvData);
    if (!r_CreateBasicAttr || isStrictString(r_CreateBasicAttr)) { throw new Error('CreateBasicAttr() 失败: \n' + r_CreateBasicAttr) }
    // if (isStrictTrue(r_CreateBasicAttr)) { console.log(bot.cLogHead + 'CreateBasicAttr() success') }

    const r_Get_gsData = await bot.Get_gsData();
    if (!r_Get_gsData || isStrictString(r_Get_gsData)) { throw new Error('Get_gsData() 失败: \n' + r_Get_gsData) }
    // if (isStrictTrue(r_Get_gsData)) { console.log(bot.cLogHead + 'Get_gsData() success') }

    const r_ToCheckInitiate = await bot.ToCheckInitiate();
    if (!r_ToCheckInitiate || isStrictString(r_ToCheckInitiate)) { throw new Error('ToCheckInitiate() 失败: \n' + r_ToCheckInitiate) }
    // if (isStrictTrue(r_ToCheckInitiate)) { console.log(bot.cLogHead + 'ToCheckInitiate() success') }

    const r_ToCheckFundFee = await bot.ToCheckFundFee();
    if (!r_ToCheckFundFee || isStrictString(r_ToCheckFundFee)) { throw new Error('ToCheckFundFee() 失败: \n' + r_ToCheckFundFee) }
    // if (isStrictTrue(r_ToCheckFundFee)) { console.log(bot.cLogHead + 'ToCheckFundFee() success') }

    const r_ToCheckWaitingOrder = await bot.ToCheckWaitingOrder();
    if (!r_ToCheckWaitingOrder || isStrictString(r_ToCheckWaitingOrder)) { throw new Error('ToCheckWaitingOrder() 失败: \n' + r_ToCheckWaitingOrder) }
    // if (isStrictTrue(r_ToCheckWaitingOrder)) { console.log(bot.cLogHead + 'ToCheckWaitingOrder() success') }

    // 将 mainData 和 tvData 写入到this大对象中
    // 必须先写入mainData, 再写入tvData
    // 因为mainData包含旧数据
    bot.UpdateDataToBot(bot.mainData)                           ;
    bot.UpdateDataToBot(bot.tvData)                             ;
    bot.gcpGetTime  = gcpGetTime  ;
    // console.log(bot.cLogHead + 'UpdateDataToBot() success')     ;

    bot.ReNew()                                     ;
    // console.log(bot.cLogHead + 'ReNew() success')   ;

    const r_ToSell = await bot.ToSell();
    if (!r_ToSell || isStrictString(r_ToSell)) { throw new Error('ToSell() 失败: \n' + r_ToSell) }
    // if (isStrictTrue(r_ToSell)) { console.log(bot.cLogHead + 'ToSell() success') }

    const r_ToBuy = await bot.ToBuy();
    if (!r_ToBuy || isStrictString(r_ToBuy)) { throw new Error('ToBuy() 失败: \n' + r_ToBuy) }
    // if (isStrictTrue(r_ToBuy)) { console.log(bot.cLogHead + 'ToBuy() success') }

    const r_WriteToGS = await bot.WriteToGS();
    if (!r_WriteToGS || isStrictString(r_WriteToGS)) { throw new Error('WriteToGS() 失败: \n' + r_WriteToGS) }
    // if (isStrictTrue(r_WriteToGS)) { console.log(bot.cLogHead + 'WriteToGS() success') }

    const task_SendToTG     = bot.SendToTG()     ;
    const task_SendToEmail  = bot.SendToEmail()  ;

    const task_ReleaseLockOfGS = bot.ReleaseLockOfGS() ;

    bot.promiseArray.push({taskName: '发送TG'   , task: task_SendToTG   }) ;
    bot.promiseArray.push({taskName: '发送Email', task: task_SendToEmail}) ;

    const taskindex_ReleaseLockOfGS = bot.promiseArray.push({taskName: '最后解锁GS', task: task_ReleaseLockOfGS}) - 1;

    // 执行并发任务
    const taskResults = await Promise.allSettled(bot.promiseArray.map(v => v.task));
    let task_thereErr   = false    ;
    let task_errMessage = ''       ;
    taskResults.forEach((result, index) => {
        const taskName = bot.promiseArray[index].taskName ;
        if (result.status === "fulfilled") {
            bot.promiseArray[index].result  = result.value ;
        }
        if (result.status !== "fulfilled") {
            task_thereErr       =  true;
            task_errMessage    +=  taskName + '失败: ' + ( result.reason?.message || String(result.reason || '未知错误') ) ;
        }
    });

    const r_ReleaseLockOfGS = bot.promiseArray[taskindex_ReleaseLockOfGS].result ;
    if (!r_ReleaseLockOfGS || isStrictString(r_ReleaseLockOfGS)) { 
        // 无法为GS解锁, 是严重错误, 需要手动解锁
        bot.AddRunningWellMessage('程序运行到最后, 无法为GS解锁, 是严重错误, 需要手动解锁: \n' + r_ReleaseLockOfGS) ;
        throw new Error('ReleaseLockOfGS() 失败: \n' + r_ReleaseLockOfGS)  ;
    }
    // if (isStrictTrue(r_ReleaseLockOfGS)) { console.log(bot.cLogHead + 'ReleaseLockOfGS() success') }

    const r_ReleaseTradeBotLOCK = await bot.ReleaseTradeBotLOCK();
    if (!r_ReleaseTradeBotLOCK || isStrictString(r_ReleaseTradeBotLOCK)) { 
        // 无法为GS解锁, 是严重错误, 需要手动解锁
        bot.AddRunningWellMessage('程序运行到最后, 无法为TradeBot解锁, 是严重错误, 需要手动解锁: \n' + r_ReleaseTradeBotLOCK) ;
        throw new Error('ReleaseTradeBotLOCK() 失败: \n' + r_ReleaseTradeBotLOCK)  ;
    }
    // if (isStrictTrue(r_ReleaseTradeBotLOCK)) { console.log(bot.cLogHead + 'ReleaseTradeBotLOCK() success') }


    if (task_thereErr) {throw new Error(task_errMessage)}

}
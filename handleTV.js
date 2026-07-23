import {
    isStrictNumber,
    isStrictBoolean,
    isStrictTrue,
    isStrictFalse,
    isStrictString,
    isStrictSet,
    isPlainObject,
    isObjectOfKeyValue,
    isEmptyObject,
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
    GetSheetsIDfromSheet,
    BatchGetGS,
    ClearGS,
    ConvertRowsToHtmlTable,
    SendEmail,
    Sleep,
    makeRequestBodyArrayofBatchUpdate_clear,
    makeRequestBodyArrayofBatchUpdate_update,
    makeRequestBodyArrayofBatchUpdate_clearUpdate,
    makeRequestBodyArrayofBatchUpdate_append,
    BatchUpdateGS,
    try3times,
    LogsWithTime
} from "./utility.js";

import { CheckAllPosition, SendOrderToBroker, CheckOrderConfirm, CheckFundFee } from "./broker.js";


export const CV = {
    stillHandleLast : 'stillHandleLast' ,
    newerHandled    : 'newerHandled'    ,
    stopSet         : 'stopSet'         ,
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


export async function HandleAllPrice(tvData, thisLogs) {
    const RangeAllPrices = "fromTV!A2:B" ;

    // 清洗来自TV的数据
    Object.keys(tvData).forEach(key => {
        tvData[key] = ToStrictNumBoolStr(tvData[key], 'notAvailableValueFromTV') ;
        if ( isStrictString(tvData[key]) && tvData[key].includes(CV.HuanHang) ) { tvData[key] = tvData[key].replaceAll(CV.HuanHang, '\n').trim() }
    } ) ;

    const spreadsheetID = process.env.SHEET_ID              ;
    const toWriteArray  = ObjToA2dNumBoolStr(tvData)        ;
    const startWriteTime = Date.now()
    await try3times(UpdateGS, spreadsheetID, RangeAllPrices, toWriteArray) ;
    thisLogs.AddNewLogLine(`写入GS用时${Math.round((Date.now()-startWriteTime)/1000)}秒`) ;
}

export const TradeBot = {
    TradeBotNumber : Date.now() ,

    /**
     * 为大对象和子对象创建基本的运行参数 ;
     * 每次子对象创建后, 必须运行这个函数 ;
     * @param {object} tvData 清理后的tvData
     * @returns 因为有try/catch, 不会抛错
     * @returns {boolean}   true: 成功
     * @returns {string}    string:出错信息
     */
    async CreateBasicAttr(tvData, thisLogs) {
        this.TradeBotNumber     =  TradeBot.TradeBotNumber                          ;
        this.TradeBotNumberTime =  GetTimeStringWithOffset(8, this.TradeBotNumber)  ;
        this.thisLogs           =  thisLogs                                         ;
        this.tvData             =  tvData                                           ;
        this.gcpGetTime         =  tvData.gcpGetTime                                ;
        this.LockTime           =  tvData.timestamp                                 ;
        this.lockName           =  'T' + String(this.LockTime)                      ;
        this.task_setGSLOCK     =  null                                             ;
        this.task_gslock_fail   =  false                                            ;
        this.task_gslock_isOK   =  false                                            ;
        this.batchUpdateList    =  []                                               ;
        this.alertMessageSet    =  new Set()                                        ;
        this.toSendEmail        =  false                                            ;
        AddSetMessage(this.alertMessageSet, tvData.thisAlertMessage) ;

        this.tbName_TGID           =  tvData.botNumber + '_TGID'           ; // 全局中保存的发送命令的ID
        this.tbName_tgReset        =  tvData.botNumber + '_tgReset'        ; // 全局中的归零信号名
        this.tbName_tgSTOP         =  tvData.botNumber + '_tgSTOP'         ; // 全局中的停止本机器人信号名
        this.tbName_tgSTOP_resp    =  tvData.botNumber + '_tgSTOP_resp'    ; // 全局中的停止本机器人信号已收到名
        this.tbName_tgToReadGSCMD  =  tvData.botNumber + '_tgToReadGSCMD'  ; // 全局中的去读取gs command信号已收到名

        this.tbName_isLocked       =  tvData.botNumber + '_isLocked'       ; // 全局中判断是否locked的名
        this.tbName_lastLockTime   =  tvData.botNumber + '_lastLockTime'   ; // 全局中的锁名
        this.tbName_runningWell    =  tvData.botNumber + '_runningWell'    ; // 全局中的出错名
        this.tbName_spreadsheetID  =  tvData.botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID, 避免每次重新读取
        this.tbName_sheetsID       =  tvData.botNumber + '_sheetsID'       ; // 全局中保存的sheetsID, 避免每次重新读取
        this.tbName_gsData         =  tvData.botNumber + '_gsData'         ; // 全局中保存的gsData, 避免每次重新读取

        if (!Object.hasOwn(TradeBot, this.tbName_tgReset       )) { TradeBot[this.tbName_tgReset      ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgSTOP        )) { TradeBot[this.tbName_tgSTOP       ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgSTOP_resp   )) { TradeBot[this.tbName_tgSTOP_resp  ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgToReadGSCMD )) { TradeBot[this.tbName_tgToReadGSCMD] = false       }

        if (!Object.hasOwn(TradeBot, this.tbName_isLocked      )) { TradeBot[this.tbName_isLocked     ] = false       } // 在全局中设置是否已经被锁
        if (!Object.hasOwn(TradeBot, this.tbName_lastLockTime  )) { TradeBot[this.tbName_lastLockTime ] = 0           } // 在全局中设锁
        if (!Object.hasOwn(TradeBot, this.tbName_runningWell   )) { TradeBot[this.tbName_runningWell  ] = new Set()   } // 在全局中设runningWell
        if (!Object.hasOwn(TradeBot, this.tbName_spreadsheetID )) { TradeBot[this.tbName_spreadsheetID] = null        } // 在全局中设置spreadsheetID
        if (!Object.hasOwn(TradeBot, this.tbName_sheetsID      )) { TradeBot[this.tbName_sheetsID     ] = {}          } // 在全局中设置sheetsID
        if (!Object.hasOwn(TradeBot, this.tbName_gsData        )) { TradeBot[this.tbName_gsData       ] = {}          } // 在全局中设置gsData


        // 可以通过TG-RESET信号来重置全局锁 和 报错信息
        let toResetGSLOCK = false ;
        if (isStrictTrue(TradeBot[this.tbName_tgReset])) { 
            TradeBot[this.tbName_tgSTOP       ]     = false         ;
            TradeBot[this.tbName_tgSTOP_resp  ]     = false         ;
            TradeBot[this.tbName_tgReset      ]     = false         ;
            TradeBot[this.tbName_isLocked     ]     = false         ;
            TradeBot[this.tbName_lastLockTime ]     = 0             ;
            TradeBot[this.tbName_runningWell  ]     = new Set()     ;
            TradeBot[this.tbName_spreadsheetID]     = null          ;
            TradeBot[this.tbName_sheetsID     ]     = {}            ;
            TradeBot[this.tbName_gsData       ]     = {}            ;

            toResetGSLOCK = true ;

            SendTG(`${tvData.botNumber} RESET命令已收到`, 'RESET已设置', TradeBot[this.tbName_TGID]).catch(() => { });
        }

        if (isStrictTrue(TradeBot[this.tbName_tgSTOP])) {
            if (isStrictFalse(TradeBot[this.tbName_tgSTOP_resp])) {
                SendTG(`${tvData.botNumber} STOP命令已收到`, 'STOP已设置,  停止继续处理本信号', TradeBot[this.tbName_TGID]).catch(() => { });
                TradeBot[this.tbName_tgSTOP_resp] = true;
            }
            return CV.stopSet ;
        }


        // 在全局中有报错的话, 直接退出
        if (!this.isRunningWell()) {return '发现之前的运行中有错误, 本次信号没必要再处理, 提前退出, 以前的错误为: \n' + StrFromSetMessage(TradeBot[this.tbName_runningWell]) }

        if (TradeBot[this.tbName_lastLockTime] > this.LockTime) {return CV.newerHandled}
        // 正常情况下一个信号运行绝对不会超过5分钟; 一旦发生这种情况, 肯定是发生了不可挽回的错误, 直接抛错退出当前信号处理就可以了
        if (isStrictTrue(TradeBot[this.tbName_isLocked]) && Date.now() - TradeBot[this.tbName_lastLockTime] > 5 * 60 * 1000) {return '上一个信号长时间未解锁, 肯定遇到了无法挽回的错误, 但错误未被记录, 本信号不再处理, 需手动检查' }
        // 如果现在有锁的话, 等待当前正在处理的信号完成, 当信号已经过去60s后, 不再处理
        while (isStrictTrue(TradeBot[this.tbName_isLocked]) && Date.now() - this.LockTime < 60 * 1000) { await Sleep(1000) }
        // 已经超过60s, 或者大锁被释放
        if (isStrictTrue(TradeBot[this.tbName_isLocked])) {return CV.stillHandleLast}
        // 大锁被清空后, 马上抢大锁
        if (isStrictFalse(TradeBot[this.tbName_isLocked])) {
            TradeBot[this.tbName_isLocked] = true;
        }
        // 至此, 已经在大TradeBot对象中, 给当前botNumber上锁, 其他botNumber几乎不可能再抢占到 大TradeBot锁
        // 在GS中上锁前, 会再次检查 大TradeBot 中的锁, 确保万无一失

        if (TradeBot[this.tbName_spreadsheetID] === null) {
            try { TradeBot[this.tbName_spreadsheetID] = await try3times(GetSpreadsheetID, tvData.botNumber) }
            catch (e) { return '获取spreadsheetID失败: ' + e.message.trim() }
        }
        if (isStrictString(TradeBot[this.tbName_spreadsheetID])) {this.spreadsheetID = TradeBot[this.tbName_spreadsheetID] }

        if (isEmptyObject(TradeBot[this.tbName_sheetsID])) {
            try { TradeBot[this.tbName_sheetsID] = await try3times(GetSheetsIDfromSheet, this.spreadsheetID) }
            catch (e) { return '获取sheetsID失败: ' + e.message.trim() }
        }
        if (!isEmptyObject(TradeBot[this.tbName_sheetsID]) && isObjectOfKeyValue(TradeBot[this.tbName_sheetsID])) {this.sheetsID = TradeBot[this.tbName_sheetsID] }

        if (isEmptyObject(TradeBot[this.tbName_gsData]) ) {
            thisLogs.AddNewLogLine('缓存中未发现gsData数据, 去执行Get_gsData()');
            const r_Get_gsData = await this.get_gsData();
            if (!isStrictTrue(r_Get_gsData) || isStrictString(r_Get_gsData)) { throw new Error('Get_gsData() 失败: \n' + r_Get_gsData) }
            else { thisLogs.AddNewLogLine('Get_gsData()成功') }
        } else {
            this.toGCPData              =  TradeBot[this.tbName_gsData].toGCPData            ;
            this.mainData               =  TradeBot[this.tbName_gsData].mainData             ;
            this.ingOrderTitleA         =  TradeBot[this.tbName_gsData].ingOrderTitleA       ;
            this.ingOrderData           =  TradeBot[this.tbName_gsData].ingOrderData         ;
            this.uncloseOrdersTitleA    =  TradeBot[this.tbName_gsData].uncloseOrdersTitleA  ;
            this.uncloseOrdersA2d       =  TradeBot[this.tbName_gsData].uncloseOrdersA2d     ;
            this.tradeHistoryTitleA     =  TradeBot[this.tbName_gsData].tradeHistoryTitleA   ;
            if (this.TradeBotNumber !== this.mainData.TradeBotNumber) { throw new Error('this.TradeBotNumber !== this.mainData.TradeBotNumber') }
            if (TradeBot[this.tbName_lastLockTime] !== this.mainData.timestamp) { throw new Error('lastLockTime !== this.mainData.timestamp') }
            thisLogs.AddNewLogLine('直接从缓存中获取gsData') ;
        }

        TradeBot[this.tbName_lastLockTime] = this.LockTime;

        if (TradeBot[this.tbName_tgToReadGSCMD]) {
            const tgRspTitle = `${tvData.botNumber} 读取gsCommand命令已收到`;
            thisLogs.AddNewLogLine('收到命令去读取 gs command');

            const commandData = A2dToCleanObj(await try3times(GetGS, this.spreadsheetID, this.toGCPData.CommandRange));
            const r_makeGSCMD = await this.makeGSCMD(commandData);
            let thisLog;
            if (isStrictString(r_makeGSCMD)) { thisLog = r_makeGSCMD }
            if (isStrictTrue(r_makeGSCMD)) { thisLog = '读取 gs command 成功' }

            thisLogs.AddNewLogLine(thisLog);
            SendTG(tgRspTitle, thisLog, TradeBot[this.tbName_TGID]).catch(() => { });

            TradeBot[this.tbName_tgToReadGSCMD] = false;
        }


        const lstTargetHgh      = this.tvData.lstTargetHgh          ;
        const lstTargetLow      = this.tvData.lstTargetLow          ;
        const lstTouchHghTime   = this.tvData.lstTouchHghTime       ;
        const lstTouchLowTime   = this.tvData.lstTouchLowTime       ;

        this.lstRcdTargetHgh    = this.mainData.lstRcdTargetHgh     ;
        this.lstRcdTargetLow    = this.mainData.lstRcdTargetLow     ;
        this.lstRcdTouchHghTime = this.mainData.lstRcdTouchHghTime  ;
        this.lstRcdTouchLowTime = this.mainData.lstRcdTouchLowTime  ;

        this.markTouchTargetHgh = false ;
        this.markTouchTargetLow = false ;

        if (isStrictString(this.lstRcdTouchHghTime)) {
            this.markTouchTargetHgh     = false             ;
            this.lstRcdTouchHghTime     = lstTouchHghTime   ;
            this.lstRcdTargetHgh        = lstTargetHgh      ;
        }
        if (isStrictNumber(this.lstRcdTouchHghTime) && this.lstRcdTouchHghTime < lstTouchHghTime) {
            this.markTouchTargetHgh     = true              ;
            this.lstRcdTouchHghTime     = lstTouchHghTime   ;
            this.lstRcdTargetHgh        = lstTargetHgh      ;
            AddSetMessage(this.alertMessageSet, "↑ mark TouchTargetHgh") ;
        }
        if (isStrictString(this.lstRcdTouchLowTime)) {
            this.markTouchTargetLow     = false             ;
            this.lstRcdTouchLowTime     = lstTouchLowTime   ;
            this.lstRcdTargetLow        = lstTargetLow      ;
        }
        if (isStrictNumber(this.lstRcdTouchLowTime) && this.lstRcdTouchLowTime < lstTouchLowTime) {
            this.markTouchTargetLow     = true              ;
            this.lstRcdTouchLowTime     = lstTouchLowTime   ;
            this.lstRcdTargetLow        = lstTargetLow      ;
            AddSetMessage(this.alertMessageSet, "↓ mark TouchTargetLow") ;
        }


        let currentLock = this.mainData.LOCK ;
        if (this.mainData.timestamp > this.LockTime) { this.releaseTradeBotLOCK(); throw new Error('检查GS发现已处理过更新的信号'); }
        if (TradeBot[this.tbName_lastLockTime] !== this.LockTime) { this.releaseTradeBotLOCK(); throw new Error('临上GS锁前, 再次检查大锁, 发现大锁已被别的信号抢去'); }
        if (currentLock !== CV.noLOCK && !toResetGSLOCK) {
            const errMessage = '上一次运行大TradeBot锁被释放的情况下, GS锁未被释放';
            this.addRunningWellMessage(errMessage);
            throw new Error(errMessage);
        }

        // 发送设置GSLOCK任务, 写入不成功是小概率事件, 不必等待结果, 只在运行到重要情况前确认
        if (currentLock === CV.noLOCK || toResetGSLOCK) {
            // await UpdateGS(this.spreadsheetID, toGCPData.lockRange, [[this.lockName]]);
            thisLogs.AddNewLogLine('去GS设锁')
            this.task_setGSLOCK = try3times(UpdateGS, this.spreadsheetID, this.toGCPData.lockRange, [[this.lockName]])
                .catch((e) => {
                   this.task_gslock_fail = true ;
                   this.thisLogs.AddNewLogLine('set gslock fail: ' + e.message) ;
                })
                .finally(() => {
                    if(!this.task_gslock_fail) {
                        this.task_gslock_isOK = true ;
                        this.thisLogs.AddNewLogLine('set gslock success') ;
                    }
                }) ;
        }

        return true ; 

    } , // 执行完此后, 已获得 大TradeBot锁 和 GS锁 

    getThisTvMainData(key) {
        let value = null ;
        if      (key === 'tvData'             ) { value = this.tvData             }
        else if (key === 'toGCPData'          ) { value = this.toGCPData          }
        else if (key === 'mainData'           ) { value = this.mainData           }
        else if (key === 'ingOrderData'       ) { value = this.ingOrderData       }
        else if (key === 'ingOrderTitleA'     ) { value = this.ingOrderTitleA     }
        else if (key === 'uncloseOrdersA2d'   ) { value = this.uncloseOrdersA2d   }
        else if (key === 'uncloseOrdersTitleA') { value = this.uncloseOrdersTitleA}
        else if (key === 'tradeHistoryTitleA' ) { value = this.tradeHistoryTitleA }
        else {value = this[key] ?? this.tvData[key] ?? this.mainData[key] ?? null}
        if (value === null) {throw new Error(`GetThisTvMainData error: ${key}`)} else {return value}
    } ,

    /**
     * 释放大锁
     * @returns true: 解锁成功
     * @returns string: 解锁校验出错
     */
    releaseTradeBotLOCK() {
        if (TradeBot[this.tbName_lastLockTime] !== this.LockTime) { return '释放大锁失败, 此信号无权解锁' }
        else { TradeBot[this.tbName_isLocked] = false; return true; }
    } ,

    /**
     * 将新的出错信息写入 大TradeBot对象 中
     * @param {string} errMessage 
     */
    addRunningWellMessage(errMessage) { AddSetMessage(TradeBot[this.tbName_runningWell], errMessage) } ,

    /**
     * 依据runningWellSet中是否有元素来判断是否有运行错误
     * @returns true: 运行中无错误
     * @returns false: 运行中有错误
     */
    isRunningWell() { return TradeBot[this.tbName_runningWell].size === 0 },

    async gslock_waitOK() {
        await this.task_setGSLOCK ;
        if (this.task_gslock_isOK) {return true} 
        else {return '检查set GSLOCK，发现设置失败'}
    } ,

    async makeGSCMD(commandData) {
        this.thereCommandFromGS = false ; // 最高等级的交易命令, 直接来自GS的交易信号, 需要亲自手动设置
        if (isStrictTrue(this.mainData.initiated)               &&    
            Object.hasOwn(commandData, 'thisCommandBeRead')     &&
            Object.hasOwn(commandData, 'noCommandError')        &&
            isStrictFalse(commandData.thisCommandBeRead)        &&
            isStrictTrue(commandData.noCommandError)            )  {
            commandData.thisCommandBeRead = true ;
            await try3times(UpdateGS, this.spreadsheetID, this.toGCPData.commandReadRange, [[commandData.thisCommandBeRead]]) ;
            let checkCommandRead = ToStrictNumBoolStr( (await try3times(GetGS, this.spreadsheetID, this.toGCPData.commandReadRange))[0][0] ) ;
            if (checkCommandRead !== commandData.thisCommandBeRead) {
                // 再重试一次, 重新写, 等2s再重新读
                await try3times(UpdateGS, this.spreadsheetID, this.toGCPData.commandReadRange, [[commandData.thisCommandBeRead]]) ;
                checkCommandRead = ToStrictNumBoolStr( (await try3times(GetGS, this.spreadsheetID, this.toGCPData.commandReadRange))[0][0] ) ;
                if (checkCommandRead !== commandData.thisCommandBeRead) {
                    throw new Error('读取并设置commandFromGS 失败') ;
                }
            }
            this.thereCommandFromGS = true ;
            this.commandData = commandData;
            return true ;
        } else { return '未发现待读取gs command' }
    } ,

    /**
     * 获取GS数据, 并写入子对象中
     * 无返回值, 直接在对象上修改
     * @returns 因为有try/catch, 不会抛错
     * @returns true: 获取数据并写入对象成功
     * @returns string: 具体的出错信息
     */
    async get_gsData() {
        try {
            const toGCPData = Object.hasOwn(this, 'toGCPData') && Object.hasOwn(this.toGCPData, 'mainRange')    ?
                this.toGCPData                                                                                  :
                A2dToCleanObj(await try3times(GetGS, this.spreadsheetID, CV.toGCPRanges))                       ;

            const getDataList = [] ; // 下面的顺序不能乱，因为后面的数据获取需要依据上面的数据
            getDataList.push({name: 'toGCPData'             , range: CV.toGCPRanges                     }) ;
            getDataList.push({name: 'mainData'              , range: toGCPData.mainRange                }) ;
            getDataList.push({name: 'ingOrderTitleA'        , range: toGCPData.ingOrderTitleLine        }) ;
            getDataList.push({name: 'ingOrderData'          , range: toGCPData.ingOrderLine             }) ;
            getDataList.push({name: 'uncloseOrdersTitleA'   , range: toGCPData.uncloseOrdersTitleLine   }) ;
            getDataList.push({name: 'uncloseOrdersA2d'      , range: toGCPData.uncloseOrdersRange       }) ;
            getDataList.push({name: 'tradeHistoryTitleA'    , range: toGCPData.tradeHistoryTitleLine    }) ;
            getDataList.push({name: 'toReadA2d'             , range: toGCPData.toReadRange              }) ;
            getDataList.push({name: 'toEmailA2d'            , range: toGCPData.toEmailRange             }) ;

            const rangesList = getDataList.map(v => v.range) ;
            const valuesArray   = await try3times(BatchGetGS, this.spreadsheetID, rangesList);

            const gsData = TradeBot[this.tbName_gsData] ;
            for (const [i, v] of getDataList.entries()) {
                if (v.name === 'toGCPData') {
                    const rawDataA2d = valuesArray[i];
                    gsData.toGCPData = A2dToCleanObj(rawDataA2d);
                } else if (v.name === 'mainData') {
                    const rawDataA2d = valuesArray[i];
                    gsData.mainData = A2dToCleanObj(rawDataA2d);
                } else if (v.name === 'ingOrderTitleA') {
                    const rawDataA2d = valuesArray[i];
                    gsData.ingOrderTitleA = CleanArrayToNumStrBool(rawDataA2d[0]);
                } else if (v.name === 'ingOrderData') {
                    const rawDataA2d = valuesArray[i];
                    const ingOrderLineA = gsData.mainData.ing_orderStatus === CV.order_waiting ? CleanArrayToNumStrBool(rawDataA2d[0]) : [];
                    gsData.ingOrderData = gsData.mainData.ing_orderStatus === CV.order_waiting ? A2LinesToCleanObj([gsData.ingOrderTitleA, ingOrderLineA]) : {};
                } else if (v.name === 'uncloseOrdersTitleA') {
                    const rawDataA2d = valuesArray[i];
                    gsData.uncloseOrdersTitleA = CleanArrayToNumStrBool(rawDataA2d[0]);
                } else if (v.name === 'uncloseOrdersA2d') {
                    const rawDataA2d = valuesArray[i];
                    gsData.uncloseOrdersA2d = isStrictTrue(gsData.mainData.therePosition) ? (rawDataA2d).map(lines => CleanArrayToNumStrBool(lines)) : [];
                } else if (v.name === 'tradeHistoryTitleA') {
                    const rawDataA2d = valuesArray[i];
                    gsData.tradeHistoryTitleA = CleanArrayToNumStrBool(rawDataA2d[0]);
                } else if (v.name === 'toReadA2d') {
                    const rawDataA2d = valuesArray[i];
                    gsData.toReadA2d = rawDataA2d.map(v => CleanArrayToNumStrBool(v))
                } else if (v.name === 'toEmailA2d') {
                    const rawDataA2d = valuesArray[i];
                    gsData.toEmailA2d = rawDataA2d.map(v => CleanArrayToNumStrBool(v))
                } else { throw new Error('get data from gs error') }
            }

            if (gsData.mainData.TradingSymbol !== this.tvData.TradingSymbol) {
                const errMessage = 'The TradingSymbol in GS is different from TV' ;
                this.addRunningWellMessage(errMessage) ; // 这是很严重的错误, 需要记录
                throw new Error(errMessage) ;
            }

            this.toGCPData              =  TradeBot[this.tbName_gsData].toGCPData            ;
            this.mainData               =  TradeBot[this.tbName_gsData].mainData             ;
            this.ingOrderTitleA         =  TradeBot[this.tbName_gsData].ingOrderTitleA       ;
            this.ingOrderData           =  TradeBot[this.tbName_gsData].ingOrderData         ;
            this.uncloseOrdersTitleA    =  TradeBot[this.tbName_gsData].uncloseOrdersTitleA  ;
            this.uncloseOrdersA2d       =  TradeBot[this.tbName_gsData].uncloseOrdersA2d     ;
            this.tradeHistoryTitleA     =  TradeBot[this.tbName_gsData].tradeHistoryTitleA   ;
            this.toReadA2d              =  TradeBot[this.tbName_gsData].toReadA2d            ;
            this.toEmailA2d             =  TradeBot[this.tbName_gsData].toEmailA2d           ;

            return true ;

        } catch (e) { return e.message.trim() }
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

            const r_gslock = await this.gslock_waitOK() ;
            if (!isStrictTrue(r_gslock)) { throw new Error(ToStrictString(r_gslock)) }

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
            const i_toBatchUpdateList   =  []           ;

            i_toClearRangeSet.add( this.toGCPData.ingOrderLine       )  ;
            i_toClearRangeSet.add( this.toGCPData.uncloseOrdersRange )  ;
            i_toClearRangeSet.add( this.toGCPData.tradeHistoryRange  )  ;
            i_toClearRangeSet.add( this.toGCPData.HghLowRange        )  ;
            i_toClearRangeSet.add( this.toGCPData.simBrokerRange     )  ;
            i_toClearRangeSet.add( this.toGCPData.BrokerRange        )  ;
            i_toClearRangeSet.add( this.toGCPData.toWriteMainRange   )  ;

            const toClearRangeList = Array.from(i_toClearRangeSet).map(v => makeRequestBodyArrayofBatchUpdate_clear({
                sheetID: this.sheetsID[v.split('!')[0]],
                range: v
            }));

            i_toBatchUpdateList.push(...toClearRangeList) ;

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



            i_toBatchUpdateList.push(...makeRequestBodyArrayofBatchUpdate_clearUpdate(
                {
                    sheetID: this.sheetsID[this.toGCPData.HghLowRange.split('!')[0]],
                    range: this.toGCPData.HghLowRange,
                    values: newHghLowV
                }));

            this.thisLogs.AddNewLogLine('去GS更新initiate') ;
            await try3times(BatchUpdateGS, this.spreadsheetID, i_toBatchUpdateList) ;

            const r_Get_gsData = await this.get_gsData();
            if (!isStrictTrue(this.mainData.initiated)) { throw new Error('初始化后经校验初始化结果未更新') }


            this.thisLogs.AddNewLogLine('在GS更新initiate成功') ;

            AddSetMessage(this.alertMessageSet, 'just initiated')  ;
            
            return true ;

        } catch(e) {
            this.addRunningWellMessage(e.message) ;
            return e.message ;
        }
    } ,

    async CheckAllPosition_withBroker() {
        const S                     = {}                                            ;
        S.isReal                    = this.mainData.isReal                          ;
        S.TradingSymbol             = this.mainData.TradingSymbol                   ;
        S.allPosition               = ToStrictNumber(this.mainData.allPosition, 0)  ;
        S.gridNum                   = ToStrictNumber(this.mainData.gridNum, 0)      ;
        S.ifOrderWaiting            = this.mainData.ifOrderWaiting                  ;
        S.waitingPosition           = this.ingOrderData?.ing_qty ?? 0               ;
        S.allPositionWithWaiting    = S.allPosition + S.waitingPosition             ;

        try {
            S.thisLogs = this.thisLogs ;
            await CheckAllPosition(S) ;

            // 无仓位 无pending_orders 的情况
            if (S.allPosition               < this.mainData.minEnExPosition             &&
                S.allPositionWithWaiting    < this.mainData.minEnExPosition             &&
                S.brokerPosition            < 2 * this.mainData.minEnExPosition         ) { return true }

            const probableEachGridPosition = S.gridNum > 0                                  ?
                S.allPosition / S.gridNum                                                   :
                this.mainData.freeMargin * this.leverage / this.tvData.TradingSymbolPrice   ;

            // 有pending_orders 的情况
            if ( isStrictTrue(S.ifOrderWaiting)                                                          &&
                Math.abs(S.allPosition            - S.brokerPosition) > 1.5 * probableEachGridPosition   &&
                Math.abs(S.allPositionWithWaiting - S.brokerPosition) > 1.5 * probableEachGridPosition   ) { throw new Error('GS中记录的仓位与交易所实际仓位不符') }
            // 无pending_orders 的情况
            if (!isStrictTrue(S.ifOrderWaiting)                                                          &&
                Math.abs(S.allPosition            - S.brokerPosition) > 0.5 * probableEachGridPosition   &&
                Math.abs(S.allPositionWithWaiting - S.brokerPosition) > 0.5 * probableEachGridPosition   ) { throw new Error('GS中记录的仓位与交易所实际仓位不符') }
            return true ;
        } catch (e) {
            const errMessage = `核心错误: ${e.message}` ;
            this.addRunningWellMessage(errMessage);
            return errMessage ;
        }

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
     * 将新数据写入bot对象中 ; 
     * @param {Object} newData 需要写入的新数据, 需保证newData是clean状态
     * @returns string: 失败返回具体熔断错误字符串
     */
    updateDataToBot(newData) {
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
     * 计算当价格变化多少的时候, 引起的 allFund 和 allCoin 会成为多少
     * @param {number} chgPct 价格变化的值, 例如-0.2 表示价格变化-20%, 要求: -2 < chgPct < 2
     * @returns 一个对象 {then_allFUnd, then_allCoin}
     */
    valueIfChg(chgPct) {
        const TradingSymbolPrice    =  this.getThisTvMainData('TradingSymbolPrice')    ;
        const BaseCoinPrice         =  this.getThisTvMainData('BaseCoinPrice')         ;
        const Aup2B                 =  this.getThisTvMainData('Aup2B')                 ;
        const Adn2B                 =  this.getThisTvMainData('Adn2B')                 ;
        const inFund                =  this.getThisTvMainData('inFund')                ;
        const inCoin                =  this.getThisTvMainData('inCoin')                ;
        const therePosition         =  this.getThisTvMainData('therePosition')         ;
        const allPosition           =  this.getThisTvMainData('allPosition')           ;
        const avgBuyPrice           =  this.getThisTvMainData('avgBuyPrice')           ;
        const netProfit             =  this.getThisTvMainData('netProfit')             ;

        if (!isStrictNumber(chgPct) || chgPct > 2 || chgPct < -2) {throw new Error('chgPct输入错误')}
        const then_Price        =  TradingSymbolPrice * (1+chgPct) ;
        const then_openProfit   =  therePosition ? allPosition * (then_Price - avgBuyPrice) : 0 ;
        const then_b_chgPct     =  (chgPct > 0 ? Aup2B : Adn2B) * chgPct ;
        const then_b_Price      =  BaseCoinPrice * (1+then_b_chgPct) ;
        const then_allFUnd      =  inCoin * then_b_Price + inFund + ToStrictNumber(netProfit, 0) + then_openProfit ;
        const then_allCoin      =  then_allFUnd / then_b_Price ;
        return {then_allFUnd, then_allCoin} ;
    } ,

    /**
     * 计算在当前仓位下, 如果allFund变化多少的时候, 标的价格应当变化多少, 才会导致allFund变化这个多
     * @param {number} toAllFund  例如, 历史最高allFund * -0.3 , 计算止损价
     * @param {number} findUPchgpctLimit 例如 0.1
     * @param {number} findDNchgpctLimit 例如 -1.1
     * @returns 会抛出错误
     * @returns number 计算出来的数值
     */
    chgPctIfVALUEFchg(toAllFund, findUPchgpctLimit = 0, findDNchgpctLimit = -1) {
        if (!isStrictNumber(toAllFund) || !isStrictNumber(findUPchgpctLimit) || !isStrictNumber(findDNchgpctLimit) || findUPchgpctLimit < 0 || findDNchgpctLimit > 0 ) {
            throw new Error('toAllFund, findUPchgpctLimit, findDNchgpctLimit 输入错误') ;
        } ;
        const upLimit_allFund = this.valueIfChg(findUPchgpctLimit).then_allFUnd ;
        const dnLimit_allFund = this.valueIfChg(findDNchgpctLimit).then_allFUnd ;

        const minchg = findUPchgpctLimit * findDNchgpctLimit > 0 ? MinABSnumber(findUPchgpctLimit, findDNchgpctLimit) : 0 ;

        let toFind              =  false    ;
        let find_directionUp    =  true     ;
        let find_bigger         =  true     ;

        if (toAllFund > this.allFund && upLimit_allFund < toAllFund && dnLimit_allFund < toAllFund) {return false} 
        if (toAllFund > this.allFund && upLimit_allFund > toAllFund && dnLimit_allFund > toAllFund) {return minchg} 
        if (toAllFund > this.allFund && upLimit_allFund > toAllFund && dnLimit_allFund < toAllFund) {
            toFind              =  true     ;
            find_directionUp    =  true     ;
            find_bigger         =  true     ;
        }
        if (toAllFund > this.allFund && upLimit_allFund < toAllFund && dnLimit_allFund > toAllFund) {
            toFind              =  true     ;
            find_directionUp    =  false    ;
            find_bigger         =  true     ;
        }

        if (toAllFund < this.allFund && upLimit_allFund > toAllFund && dnLimit_allFund > toAllFund) {return false} 
        if (toAllFund < this.allFund && upLimit_allFund < toAllFund && dnLimit_allFund < toAllFund) {return minchg} 
        if (toAllFund < this.allFund && upLimit_allFund > toAllFund && dnLimit_allFund < toAllFund) {
            toFind              =  true     ;
            find_directionUp    =  false    ;
            find_bigger         =  false    ;
        }
        if (toAllFund < this.allFund && upLimit_allFund < toAllFund && dnLimit_allFund > toAllFund) {
            toFind              =  true     ;
            find_directionUp    =  true     ;
            find_bigger         =  false    ;
        }

        let step = 0.01;

        if (toFind &&  find_directionUp &&  find_bigger) {
            let findchgpct = findDNchgpctLimit;
            while (findchgpct < findUPchgpctLimit && this.valueIfChg(findchgpct).then_allFUnd < toAllFund) { findchgpct += step }
            return findchgpct;
        }
        if (toFind && !find_directionUp &&  find_bigger) {
            let findchgpct = findUPchgpctLimit;
            while (findchgpct > findDNchgpctLimit && this.valueIfChg(findchgpct).then_allFUnd < toAllFund) { findchgpct -= step }
            return findchgpct;
        }

        if (toFind && !find_directionUp && !find_bigger) {
            let findchgpct = findUPchgpctLimit;
            while (findchgpct > findDNchgpctLimit && this.valueIfChg(findchgpct).then_allFUnd > toAllFund) { findchgpct -= step }
            return findchgpct;
        }
        if (toFind &&  find_directionUp && !find_bigger) {
            let findchgpct = findDNchgpctLimit;
            while (findchgpct < findUPchgpctLimit && this.valueIfChg(findchgpct).then_allFUnd > toAllFund) { findchgpct += step }
            return findchgpct;
        }

        throw new Error('chgPctIfVALUEFchg() 逻辑错误') ;

    } ,

    /**
     * 计算在当前仓位下, 如果allCoin变化多少的时候, 标的价格应当变化多少, 才会导致allCoin变化这个多
     * @param {number} toAllCoin  例如, 历史最高allCoin * -0.2 , 计算止损价
     * @param {number} findUPchgpctLimit 例如 0.1
     * @param {number} findDNchgpctLimit 例如 -1.1
     * @returns 会抛出错误
     * @returns number 计算出来的数值
     */
    chgPctIfVALUECchg(toAllCoin, findUPchgpctLimit = 0, findDNchgpctLimit = -1) {
        if (!isStrictNumber(toAllCoin) || !isStrictNumber(findUPchgpctLimit) || !isStrictNumber(findDNchgpctLimit) || findUPchgpctLimit < 0 || findDNchgpctLimit > 0 ) {
            throw new Error('toAllCoin, findUPchgpctLimit, findDNchgpctLimit 输入错误') ;
        } ;
        const upLimit_allCoin = this.valueIfChg(findUPchgpctLimit).then_allCoin ;
        const dnLimit_allCoin = this.valueIfChg(findDNchgpctLimit).then_allCoin ;

        const minchg = findUPchgpctLimit * findDNchgpctLimit > 0 ? MinABSnumber(findUPchgpctLimit, findDNchgpctLimit) : 0 ;

        let toFind              =  false    ;
        let find_directionUp    =  true     ;
        let find_bigger         =  true     ;

        if (toAllCoin > this.allCoin && upLimit_allCoin < toAllCoin && dnLimit_allCoin < toAllCoin) {return false} 
        if (toAllCoin > this.allCoin && upLimit_allCoin > toAllCoin && dnLimit_allCoin > toAllCoin) {return minchg} 
        if (toAllCoin > this.allCoin && upLimit_allCoin > toAllCoin && dnLimit_allCoin < toAllCoin) {
            toFind              =  true     ;
            find_directionUp    =  true     ;
            find_bigger         =  true     ;
        }
        if (toAllCoin > this.allCoin && upLimit_allCoin < toAllCoin && dnLimit_allCoin > toAllCoin) {
            toFind              =  true     ;
            find_directionUp    =  false    ;
            find_bigger         =  true     ;
        }

        if (toAllCoin < this.allCoin && upLimit_allCoin > toAllCoin && dnLimit_allCoin > toAllCoin) {return false} 
        if (toAllCoin < this.allCoin && upLimit_allCoin < toAllCoin && dnLimit_allCoin < toAllCoin) {return minchg} 
        if (toAllCoin < this.allCoin && upLimit_allCoin > toAllCoin && dnLimit_allCoin < toAllCoin) {
            toFind              =  true     ;
            find_directionUp    =  false    ;
            find_bigger         =  false    ;
        }
        if (toAllCoin < this.allCoin && upLimit_allCoin < toAllCoin && dnLimit_allCoin > toAllCoin) {
            toFind              =  true     ;
            find_directionUp    =  true     ;
            find_bigger         =  false    ;
        }

        let step = 0.01;

        if (toFind &&  find_directionUp &&  find_bigger) {
            let findchgpct = findDNchgpctLimit;
            while (findchgpct < findUPchgpctLimit && this.valueIfChg(findchgpct).then_allCoin < toAllCoin) { findchgpct += step }
            return findchgpct;
        }
        if (toFind && !find_directionUp &&  find_bigger) {
            let findchgpct = findUPchgpctLimit;
            while (findchgpct > findDNchgpctLimit && this.valueIfChg(findchgpct).then_allCoin < toAllCoin) { findchgpct -= step }
            return findchgpct;
        }

        if (toFind && !find_directionUp && !find_bigger) {
            let findchgpct = findUPchgpctLimit;
            while (findchgpct > findDNchgpctLimit && this.valueIfChg(findchgpct).then_allCoin > toAllCoin) { findchgpct -= step }
            return findchgpct;
        }
        if (toFind &&  find_directionUp && !find_bigger) {
            let findchgpct = findDNchgpctLimit;
            while (findchgpct < findUPchgpctLimit && this.valueIfChg(findchgpct).then_allCoin > toAllCoin) { findchgpct += step }
            return findchgpct;
        }

        throw new Error('chgPctIfVALUECchg() 逻辑错误') ;

    } ,

    /**
     * 计算stopPriceF
     * @returns false: 表示永远不会触发stopPriceF
     * @returns number: 计算出的stopPriceF
     */
    getStopPriceF() {
        const TradingSymbolPrice = this.getThisTvMainData('TradingSymbolPrice')    ;
        const stopRate4F         = this.getThisTvMainData('stopRate4F')            ;
        const notStop4C          = this.getThisTvMainData('notStop4C')             ;
        const hghestFund         = this.getThisTvMainData('hghestFund')            ;
        const hghestCoin         = this.getThisTvMainData('hghestCoin')            ;

        const pct_stopF_stopF    = this.chgPctIfVALUEFchg(hghestFund * (1+stopRate4F/100), 0 , -1) ;
        const pct_stopF_notStopC = this.chgPctIfVALUECchg(hghestCoin * (1+notStop4C /100), 0 , -1) ;
        if (!isStrictNumber(pct_stopF_stopF) || !isStrictNumber(pct_stopF_notStopC)) {return false}
        return TradingSymbolPrice * (1 + Math.min(pct_stopF_stopF, pct_stopF_notStopC)) ;
    } ,

    /**
     * 计算stopPriceC
     * @returns false: 表示永远不会触发stopPriceC
     * @returns number: 计算出的stopPriceC
     */
    getStopPriceC() {
        const TradingSymbolPrice    = this.getThisTvMainData('TradingSymbolPrice')     ;
        const stopRate4C            = this.getThisTvMainData('stopRate4C')             ;
        const notStop4F             = this.getThisTvMainData('notStop4F')              ;
        const hghestFund            = this.getThisTvMainData('hghestFund')             ;
        const hghestCoin            = this.getThisTvMainData('hghestCoin')             ;

        const pct_stopC_stopC    = this.chgPctIfVALUECchg(hghestCoin * (1+stopRate4C /100) , 0 , -1) ;
        const pct_stopC_notStopF = this.chgPctIfVALUEFchg(hghestFund * (1+notStop4F  /100) , 0 , -1) ;
        if (!isStrictNumber(pct_stopC_stopC) || !isStrictNumber(pct_stopC_notStopF)) {return false}
        return TradingSymbolPrice * (1 + Math.min(pct_stopC_stopC, pct_stopC_notStopF)) ;
    } ,

    /**
     * 计算liquidatePrice
     * @returns false: 表示永远不会触发liquidatePrice
     * @returns number: 计算出的liquidatePrice
     */
    getLiquidPrice() {
        const TradingSymbolPrice = this.getThisTvMainData('TradingSymbolPrice') ;

        const pct_liquid = this.chgPctIfVALUEFchg(0, 0, -1) ;
        if (!isStrictNumber(pct_liquid)){return false}
        return this.TradingSymbolPrice * (1 + pct_liquid) ;
    } ,

    renewData() {
        const timestamp             =  this.getThisTvMainData('timestamp')             ;
        const TradingSymbolPrice    =  this.getThisTvMainData('TradingSymbolPrice')    ;
        const BaseCoinPrice         =  this.getThisTvMainData('BaseCoinPrice')         ;
        const BaseCoinHairCut       =  this.getThisTvMainData('BaseCoinHairCut')       ;
        const leverage              =  this.getThisTvMainData('leverage')              ;
        const inFund                =  this.getThisTvMainData('inFund')                ;
        const inCoin                =  this.getThisTvMainData('inCoin')                ;
        const therePosition         =  this.getThisTvMainData('therePosition')         ;
        const allPosition           =  this.getThisTvMainData('allPosition')           ;
        const avgBuyPrice           =  this.getThisTvMainData('avgBuyPrice')           ;
        const netProfit             =  this.getThisTvMainData('netProfit')             ;

        // 有新交易后，发生变化的变量是:
        // therePosition, allPosition, avgBuyPrice, netProfit, 
        this.openProfit = isStrictTrue(therePosition) ? allPosition * (TradingSymbolPrice - avgBuyPrice) : CV.NA;
        this.allProfit = ToStrictNumber(netProfit, 0) + ToStrictNumber(this.openProfit, 0);
        this.usedMargin = isStrictTrue(therePosition) ? allPosition * TradingSymbolPrice / leverage : CV.NA;
        this.crtFund = inFund + ToStrictNumber(netProfit, 0) + ToStrictNumber(this.openProfit, 0);
        this.crtCoin = inCoin;
        this.freeMargin = this.crtFund + this.crtCoin * BaseCoinPrice * BaseCoinHairCut - ToStrictNumber(this.usedMargin, 0);
        this.allFund = this.crtFund + this.crtCoin * BaseCoinPrice;
        this.allCoin = this.crtFund / BaseCoinPrice + this.crtCoin;

        this.rcd_fund = ToStrictNumber(this.mainData.rcd_fund, this.allFund);
        this.rcd_coin = ToStrictNumber(this.mainData.rcd_coin, this.allCoin);
        if (this.allFund > this.rcd_fund * (1 + this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↑ new rcd_fund'); }
        if (this.allFund < this.rcd_fund * (1 - this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↓ new rcd_fund'); }
        if (this.allCoin > this.rcd_coin * (1 + this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↑ new rcd_coin'); }
        if (this.allCoin < this.rcd_coin * (1 - this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↓ new rcd_coin'); }

        this.initialFund    = ToStrictNumber(this.mainData.initialFund  , this.allFund) ;
        this.hghestFund     = ToStrictNumber(this.mainData.hghestFund   , this.allFund) ;
        this.lowestFund     = ToStrictNumber(this.mainData.lowestFund   , this.allFund) ;
        this.initialCoin    = ToStrictNumber(this.mainData.initialCoin  , this.allCoin) ;
        this.hghestCoin     = ToStrictNumber(this.mainData.hghestCoin   , this.allCoin) ;
        this.lowestCoin     = ToStrictNumber(this.mainData.lowestCoin   , this.allCoin) ;
        this.toWriteHghLow  = this.toWriteHghLow ?? false ;
        if (this.allFund > this.hghestFund) { this.toWriteHghLow = true; this.hghestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↑ new hghestFund"); }
        if (this.allFund < this.lowestFund) { this.toWriteHghLow = true; this.lowestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↓ new lowestFund"); }
        if (this.allCoin > this.hghestCoin) { this.toWriteHghLow = true; this.hghestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↑ new hghestCoin"); }
        if (this.allCoin < this.lowestCoin) { this.toWriteHghLow = true; this.lowestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↓ new lowestCoin"); }

        if (this.toWriteHghLow) {
            this.initiated              = isStrictTrue(this.mainData.initiated) ? true : false;
            this.initiateTime           = ToStrictNumber(this.mainData.initiateTime             ,timestamp              ) ;
            this.inTradingSymbolPrice   = ToStrictNumber(this.mainData.inTradingSymbolPrice     , TradingSymbolPrice    ) ;
            this.inBaseCoinPrice        = ToStrictNumber(this.mainData.inBaseCoinPrice          , BaseCoinPrice         ) ;
        }

        // [this.liquidatePrice, this.stopPriceC, this.stopPriceF] = this.GetLiquidateStopPrice();
        this.liquidatePrice = isStrictTrue(therePosition) ? this.getLiquidPrice() : CV.NA ;
        this.stopPriceC     = isStrictTrue(therePosition) ? this.getStopPriceC()  : CV.NA ;
        this.stopPriceF     = isStrictTrue(therePosition) ? this.getStopPriceF()  : CV.NA ;

        // 账户状态更新
        this.accStatus = 'Normal';
        if (TradingSymbolPrice < this.liquidatePrice                                            ) { this.accStatus = 'liquidated'   }
        if (TradingSymbolPrice < this.stopPriceC                                                ) { this.accStatus = 'stopC'        }
        if (TradingSymbolPrice < this.stopPriceF                                                ) { this.accStatus = 'stopF'        }
        if (TradingSymbolPrice < this.stopPriceC && this.TradingSymbolPrice < this.stopPriceF   ) { this.accStatus = 'stopCF'       }

    },

    CalcuBuySellLimit() {
        this.renewData() ;

        const timestamp             = this.getThisTvMainData('timestamp')           ;
        const TradingSymbolPrice    = this.getThisTvMainData('TradingSymbolPrice')  ;
        const waveUpChg             = this.getThisTvMainData('waveUpChg')           ;
        const waveDnChg             = this.getThisTvMainData('waveDnChg')           ;
        const roundHgh              = this.getThisTvMainData('roundHgh')            ;
        const roundLow              = this.getThisTvMainData('roundLow')            ;

        const realTradeTime             = this.getThisTvMainData('realTradeTime')               ;
        const realTradeTimeTo           = this.getThisTvMainData('realTradeTimeTo')             ;
        const leverage                  = this.getThisTvMainData('leverage')                    ;
        const minEnExPosition           = this.getThisTvMainData('minEnExPosition')             ;
        const basicLowToBuy             = this.getThisTvMainData('basicLowToBuy')               ;
        const basicHghToBuy             = this.getThisTvMainData('basicHghToBuy')               ;
        const basicLowToSell            = this.getThisTvMainData('basicLowToSell')              ;
        const notBuyCloseToRndHghStep   = this.getThisTvMainData('notBuyCloseToRndHghStep')     ;
        const notBuyCloseToRndLowStep   = this.getThisTvMainData('notBuyCloseToRndLowStep')     ;
        const mustSellToPreventLiq      = this.getThisTvMainData('mustSellToPreventLiq')        ;
        const ordersInterval            = this.getThisTvMainData('ordersInterval')              ;
        const MaxGrid                   = this.getThisTvMainData('MaxGrid')                     ;
        const ifOrderWaiting            = this.getThisTvMainData('ifOrderWaiting')              ;
        const gridNum                   = this.getThisTvMainData('gridNum')                     ;
        const hghBuyPriceUnclose        = this.getThisTvMainData('hghBuyPriceUnclose')          ;
        const enDifficulty              = this.getThisTvMainData('enDifficulty')                ;
        const exDifficulty              = this.getThisTvMainData('exDifficulty')                ;
        const therePosition             = this.getThisTvMainData('therePosition')               ;
        const lstTradeTime              = this.getThisTvMainData('lstTradeTime')                ;
        const lowBuyPriceUnclose        = this.getThisTvMainData('lowBuyPriceUnclose')          ;



        // 计算边界
        this.closeToRndHgh = roundHgh / Math.pow((1 + waveUpChg), notBuyCloseToRndHghStep);
        this.closeToRndLow = roundLow / Math.pow((1 + waveDnChg), notBuyCloseToRndLowStep);

        this.enDifficultyBuyPrice  = therePosition ? lowBuyPriceUnclose * (1+enDifficulty*waveDnChg) : null ;
        this.exDifficultySellPrice = therePosition ? lowBuyPriceUnclose * (1+exDifficulty*waveUpChg) : null ;

        this.lowToBuy = Math.max(basicLowToBuy, this.closeToRndLow);

        this.hghToBuy = Math.min(basicHghToBuy, this.closeToRndHgh);

        if (therePosition) { this.hghToBuy = Math.min(this.hghToBuy, this.enDifficultyBuyPrice) }
        
        this.lowToSell = basicLowToSell;
        if (therePosition) { this.lowToSell = Math.max(basicLowToSell, this.exDifficultySellPrice) }

        this.cutTooHighBuyPrice = CV.NA ;
        if (therePosition) {
            this.cutTooHighBuyPrice = Math.min(
                hghBuyPriceUnclose / (roundHgh / roundLow) ,
                hghBuyPriceUnclose / (1 + waveUpChg)
            ) ;
        }

        this.cutToPreventLiqPrice = this.liquidatePrice > 0 ? this.liquidatePrice / (1 + mustSellToPreventLiq/100) : CV.NA ;

        this.inTradingTime = timestamp > realTradeTime && timestamp < realTradeTimeTo;

        // 判断严格地不能买卖条件
        this.canBuy         = true  ;
        this.cantBuyReason  = ""    ;
        this.canSell        = true  ;
        this.cantSellReason = ""    ;

        if (!this.inTradingTime) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'not in trading time');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'not in trading time');
        }

        if (timestamp - lstTradeTime < ordersInterval * 60000) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'there order just done, wait some time');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'there order just done, wait some time');
        }

        if (ifOrderWaiting) {
            this.canBuy = false;
            this.canSell = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'there order waiting');
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'there order waiting');
        }

        if (Number(gridNum) >= Number(MaxGrid)) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + "gridNum >= MaxGrid");
        }
        if (this.freeMargin / (MaxGrid - gridNum) < 1.1 * minEnExPosition * TradingSymbolPrice / leverage) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'Not enough freeMargin');
        }

        if (!isStrictTrue(therePosition)) {
            this.canSell = false;
            this.cantSellReason = AddMessage(this.cantSellReason, 'cant sell: ' + 'No position to sell');
        }

        AddSetMessage(this.alertMessageSet, this.cantBuyReason);
        AddSetMessage(this.alertMessageSet, this.cantSellReason);
    },

    /**
     * 检查fundfee
     * @param 调用前必须保证已更新过 Get_gsData()
     * @returns 因为有try/catch 不会抛错
     * @returns true: 表示收取fundFee并写入成功, 或者不需要检查fundfee并成功退出
     * @returns String: 具体的出错信息
     */
    async ToCheckFundFee() {
        try {
            const mainData              = this.getThisTvMainData('mainData')            ;
            const tvData                = this.getThisTvMainData('tvData')              ;
            const tradeHistoryTitleA    = this.getThisTvMainData('tradeHistoryTitleA')  ; 
            const toGCPData             = this.getThisTvMainData('toGCPData')           ;

            const tradeHistoryRange     = toGCPData.tradeHistoryRange  ;

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

            this.thisLogs.AddNewLogLine('ToCheckFundFee()') ;
            fund.thisLogs = this.thisLogs ;
            await CheckFundFee(fund);
            if (!fund.respOK) {throw new Error('交易所返回数据不正确')}

            this.freeMargin += fund.fundFee ;

            const newFundHistoryA = tradeHistoryTitleA.map(v => isStrictNumber(fund[v]) ? fund[v] : (fund[v] || CV.NA));

            this.batchUpdateList.push(makeRequestBodyArrayofBatchUpdate_append({ sheetID: this.sheetsID[tradeHistoryRange.split('!')[0]], values: [newFundHistoryA] }));

            AddSetMessage(this.alertMessageSet, `New fund fee: ${fund.fundFee}`)  ;
            this.toSendEmail = true ;

            return true;
        } catch (e) { return e.message.trim() }

    } ,

    /**
     * 判断是否要发出卖单, 并实际下单
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true: 执行完毕, 可能卖出, 也可能不卖出, 只是整个流程没有遇到问题
     * @returns string: 执行错误信息
    */
    async ToSell() {
        if (!isStrictTrue(this.canSell)) {
            if (!this.thereCommandFromGS || isStrictFalse(this.commandData.toSell) ) {return true}
            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toSell) && this.ifOrderWaiting) {
                AddSetMessage(this.alertMessageSet, 'Get toSell signal from GS, but there order waiting, ignore this toSell');
                return true;
            }
            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toSell) && !isStrictTrue(this.therePosition)) {
                AddSetMessage(this.alertMessageSet, 'Get toSell signal from GS, but no position to sell, ignore this toSell');
                return true;
            }
        }

        try {
            const timestamp             =  this.getThisTvMainData('timestamp')             ;
            const TradingSymbolPrice    =  this.getThisTvMainData('TradingSymbolPrice')    ;
            const waveUpChg             =  this.getThisTvMainData('waveUpChg')             ;

            const TradingSymbol         =  this.getThisTvMainData('TradingSymbol')         ;
            const isReal                =  this.getThisTvMainData('isReal')                ;
            const tradeFeeRate          =  this.getThisTvMainData('tradeFeeRate')          ;
            const mustSellProfitStep    =  this.getThisTvMainData('mustSellProfitStep')    ;
            const lowBuyPriceUnclose    =  this.getThisTvMainData('lowBuyPriceUnclose')    ;
            const avgBuyPriceUnclose    =  this.getThisTvMainData('avgBuyPriceUnclose')    ;
            const lowBuySerialUnclose   =  this.getThisTvMainData('lowBuySerialUnclose')   ;
            const hghBuySerialUnclose   =  this.getThisTvMainData('hghBuySerialUnclose')   ;
            
            const uncloseOrdersA2d      =  this.getThisTvMainData('uncloseOrdersA2d')      ;
            const uncloseOrdersTitleA   =  this.getThisTvMainData('uncloseOrdersTitleA')   ;
            const ingOrderTitleA        =  this.getThisTvMainData('ingOrderTitleA')        ;
            const toGCPData             =  this.getThisTvMainData('toGCPData')             ;

            const ingOrderLine          =  toGCPData.ingOrderLine    ;

            let toSell = false;
            let toSellOrderA;
            const S = {};

            const idx_serial        = uncloseOrdersTitleA.indexOf('serial')         ;
            const idx_confirmPrice  = uncloseOrdersTitleA.indexOf('confirmPrice')   ;
            const idx_qty           = uncloseOrdersTitleA.indexOf('qty')            ;

            const inNormalSellRegion = TradingSymbolPrice > this.lowToSell ? true : false ;
            AddSetMessage(this.alertMessageSet, inNormalSellRegion ? 'inNormalSellRegion' : 'not inNormalSellRegion');

            // touch targetHgh
            if (inNormalSellRegion && (TradingSymbolPrice > (1 + tradeFeeRate) * lowBuyPriceUnclose) && this.markTouchTargetHgh) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(lowBuySerialUnclose));
                S.ing_orderPrice = this.lstRcdTargetHgh;
                S.ing_orderType  = CV.order_T_LMT ;
                S.ing_reason = 'touchTargetHgh';
            }
            // mustSellProfitStep
            if ((TradingSymbolPrice > Math.pow((1 + waveUpChg), mustSellProfitStep) * Math.max(lowBuyPriceUnclose, avgBuyPriceUnclose))) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(lowBuySerialUnclose));
                S.ing_orderPrice = TradingSymbolPrice ;
                S.ing_orderType  = CV.order_T_LMT ;
                S.ing_reason = 'must sell Profit';
            }
            // cut too high buy order
            if (TradingSymbolPrice < this.cutTooHighBuyPrice) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(hghBuySerialUnclose));
                S.ing_orderPrice = CV.NA;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut too hgh buy order';
            }
            // cut due to stopC
            if (TradingSymbolPrice < this.stopPriceC) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(hghBuySerialUnclose));
                S.ing_orderPrice = CV.NA;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut due to stopC';
            }
            // cut due to stopF
            if (TradingSymbolPrice < this.stopPriceF) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(hghBuySerialUnclose));
                S.ing_orderPrice = CV.NA;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut due to stopF';
            }
            // cut to prevent liquidate
            if (TradingSymbolPrice < this.cutToPreventLiqPrice) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(hghBuySerialUnclose));
                S.ing_orderPrice = 0;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut to prevent liquidate';
            }

            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toSell)) {
                AddSetMessage(this.alertMessageSet, 'Get toSell signal from GS') ;
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(lowBuySerialUnclose));
                S.ing_orderPrice = this.commandData.price;
                S.ing_orderType  = this.commandData.orderType ;
                if (S.ing_orderType === CV.order_T_MKT) {S.ing_orderPrice = CV.NA}
                S.ing_reason = 'toSell from GS';
            }

            if (isStrictFalse(toSell)) { return true }

            const r_gslock = await this.gslock_waitOK() ;
            if (!isStrictTrue(r_gslock)) { throw new Error(ToStrictString(r_gslock)) }

            S.ing_orderID           = 'S-' + GetTimeStringWithOffset(8, timestamp)      ;
            S.ing_orderTimestamp    = Date.now()                                        ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)  ;
            S.ing_serial            = -1 * toSellOrderA[idx_serial]                     ;
            S.ing_buysell           = CV.order_SELL                                     ;
            S.ing_triggerPrice      = TradingSymbolPrice                                ;
            S.ing_boughtPrice       = toSellOrderA[idx_confirmPrice]                    ;
            S.ing_qty               = -1 * toSellOrderA[idx_qty]                        ;
            S.ing_orderStatus       = CV.order_pending                                  ;
            S.isReal                = isReal                                            ;
            S.TradingSymbol         = TradingSymbol                                     ;
            S.spreadsheetID         = this.spreadsheetID                                ;

            this.thisLogs.AddNewLogLine('ToBuy()') ;
            S.thisLogs = this.thisLogs ;
            await SendOrderToBroker(S);
            if (!S.respOK) {throw new Error('交易所返回数据不正确')}
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.ifOrderWaiting             =  true ;
            this.ingOrderData               =  S    ;

            this.batchUpdateList.push(...makeRequestBodyArrayofBatchUpdate_clearUpdate({
                sheetID: this.sheetsID[ingOrderLine.split('!')[0]],
                range: ingOrderLine,
                values: [new_ingOrderLineA]
            }));

            AddSetMessage(this.alertMessageSet, "New sell order, waiting confirmed");
            this.toSendEmail = true ;

            this.canBuy = false;
            AddSetMessage(this.alertMessageSet, 'cant buy: just a new sellOrder sent');

            return true;
        } catch(e) {
            // 这是核心错误, 不能解锁, 需要手动查看
            const errMessage = `核心错误: ${e.message}`.trim() ;
            this.addRunningWellMessage(errMessage) ;
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
        if (!isStrictTrue(this.canBuy)) {
            if (!this.thereCommandFromGS || isStrictFalse(this.commandData.toBuy)) { return true }
            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toBuy) && this.ifOrderWaiting) {
                AddSetMessage(this.alertMessageSet, 'Get toBuy signal from GS, but there order waiting, ignore this toBuy');
                return true;
            }
            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toBuy) && Number(this.gridNum) >= Number(this.MaxGrid)) {
                AddSetMessage(this.alertMessageSet, 'Get toBuy signal from GS, but gridNum >= MaxGrid, ignore this toBuy');
                return true;
            }
        }

        try {
            const timestamp             =  this.getThisTvMainData('timestamp')            ;
            const TradingSymbolPrice    =  this.getThisTvMainData('TradingSymbolPrice')   ;
            const waveUpChg             =  this.getThisTvMainData('waveUpChg')            ;
            const roundHgh              =  this.getThisTvMainData('roundHgh')             ;
            const roundLow              =  this.getThisTvMainData('roundLow')             ;

            const TradingSymbol         =  this.getThisTvMainData('TradingSymbol')        ;
            const isReal                =  this.getThisTvMainData('isReal')               ;
            const minEnExPosition       =  this.getThisTvMainData('minEnExPosition')      ;
            const tradeFeeRate          =  this.getThisTvMainData('tradeFeeRate')         ;
            const leverage              =  this.getThisTvMainData('leverage')             ;
            const mustSellToPreventLiq  =  this.getThisTvMainData('mustSellToPreventLiq') ;
            const mustSellProfitStep    =  this.getThisTvMainData('mustSellProfitStep')   ;
            const MaxGrid               =  this.getThisTvMainData('MaxGrid')              ;
            const gridNum               =  this.getThisTvMainData('gridNum')              ;
            const hghBuyPriceUnclose    =  this.getThisTvMainData('hghBuyPriceUnclose')   ;
            const lowBuyPriceUnclose    =  this.getThisTvMainData('lowBuyPriceUnclose')   ;
            const avgBuyPriceUnclose    =  this.getThisTvMainData('avgBuyPriceUnclose')   ;
            const lstBuySerial          =  this.getThisTvMainData('lstBuySerial')         ;
            const lowBuySerialUnclose   =  this.getThisTvMainData('lowBuySerialUnclose')  ;
            const hghBuySerialUnclose   =  this.getThisTvMainData('hghBuySerialUnclose')  ;
            
            const uncloseOrdersA2d      =  this.getThisTvMainData('uncloseOrdersA2d')     ;
            const uncloseOrdersTitleA   =  this.getThisTvMainData('uncloseOrdersTitleA')  ;
            const ingOrderTitleA        =  this.getThisTvMainData('ingOrderTitleA')       ;
            const toGCPData             =  this.getThisTvMainData('toGCPData')            ;

            const ingOrderLine          =  this.toGCPData.ingOrderLine   ;

            let toBuy = false;
            const S = {};

            const inNormalBuyRegion = TradingSymbolPrice > this.lowToBuy && TradingSymbolPrice < this.hghToBuy ? true : false ; 
            AddSetMessage(this.alertMessageSet, inNormalBuyRegion ? 'inNormalBuyRegion' : 'not inNormalBuyRegion') ;

            if (inNormalBuyRegion && isStrictTrue(this.markTouchTargetLow)) {
                toBuy = true;
                S.ing_orderPrice = this.lstRcdTargetLow;
                S.ing_orderType = CV.order_T_LMT;
                S.ing_reason = 'touchTargetLow';
            }

            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toBuy)) {
                AddSetMessage(this.alertMessageSet, 'Get toBuy signal from GS');
                toBuy = true;
                S.ing_orderPrice = this.commandData.price;
                S.ing_orderType = this.commandData.orderType;
                if (S.ing_orderType === CV.order_T_MKT) { S.ing_orderPrice = CV.NA }
                S.ing_reason = 'toBuy from GS';
            }

            if (isStrictFalse(toBuy)) { return true }

            const r_gslock = await this.gslock_waitOK() ;
            if (!isStrictTrue(r_gslock)) { throw new Error(ToStrictString(r_gslock)) }

            S.ing_orderID           = 'B-' + GetTimeStringWithOffset(8, timestamp)          ;
            S.ing_orderTimestamp    = Date.now()                                            ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)      ;
            S.ing_serial            = ToStrictNumber(lstBuySerial, 0) + 1                   ;
            S.ing_buysell           = CV.order_BUY                                          ;
            S.ing_triggerPrice      = TradingSymbolPrice                                    ;
            S.ing_orderType         = S.ing_orderType || CV.order_T_LMT                     ;
            S.ing_orderStatus       = CV.order_pending                                      ;
            S.isReal                = isReal                                                ;
            S.TradingSymbol         = TradingSymbol                                         ;
            S.spreadsheetID         = this.spreadsheetID                                    ;
            S.calcuQtyPrice = (S.ing_orderType === CV.order_T_MKT || !isStrictNumber(S.ing_orderPrice) ) ? TradingSymbolPrice : S.ing_orderPrice ;
            S.ing_qty               = minEnExPosition * Math.max(1, Math.floor(this.freeMargin * leverage / S.calcuQtyPrice / minEnExPosition / (MaxGrid - gridNum)))     ;

            this.thisLogs.AddNewLogLine('ToBuy()') ;
            S.thisLogs = this.thisLogs ;
            await SendOrderToBroker(S);
            if (!S.respOK) { throw new Error('交易所返回数据不正确') }
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.ifOrderWaiting             =  true ;
            this.ingOrderData               =  S    ;

            this.batchUpdateList.push(...makeRequestBodyArrayofBatchUpdate_clearUpdate({
                sheetID: this.sheetsID[ingOrderLine.split('!')[0]],
                range: ingOrderLine,
                values: [new_ingOrderLineA]
            }));

            AddSetMessage(this.alertMessageSet, "New buy order: waiting confirmed");
            this.toSendEmail = true ;

            this.canSell = false;
            AddSetMessage(this.alertMessageSet, 'cant sell: just a new buyOrder sent');

            return true;

        } catch (e) {
            const errMessage = `核心错误: ${e.message}`.trim() ;
            this.addRunningWellMessage(errMessage) ;
            return errMessage ;
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
            const tvData                =  this.getThisTvMainData('tvData')                 ;
            const toGCPData             =  this.getThisTvMainData('toGCPData')              ;
            const mainData              =  this.getThisTvMainData('mainData')               ;
            const ingOrderData          =  this.getThisTvMainData('ingOrderData')           ;
            const ingOrderTitleA        =  this.getThisTvMainData('ingOrderTitleA')         ;
            const uncloseOrdersA2d      =  this.getThisTvMainData('uncloseOrdersA2d')       ;
            const uncloseOrdersTitleA   =  this.getThisTvMainData('uncloseOrdersTitleA')    ;
            const tradeHistoryTitleA    =  this.getThisTvMainData('tradeHistoryTitleA')     ;

            const minEnExPosition       =  this.getThisTvMainData('minEnExPosition')        ;
            const ifOrderWaiting        =  this.getThisTvMainData('ifOrderWaiting')         ;
            const therePosition         =  this.getThisTvMainData('therePosition')          ;
            const allPosition           =  this.getThisTvMainData('allPosition')            ;
            const avgBuyPrice           =  this.getThisTvMainData('avgBuyPrice')            ;
            const netProfit             =  this.getThisTvMainData('netProfit')              ;
            const hghBuyPriceUnclose    =  this.getThisTvMainData('hghBuyPriceUnclose')     ;



            if (!isStrictTrue(ifOrderWaiting)) { return true }

            ingOrderData.isReal             = mainData.isReal                                                       ;
            ingOrderData.TradingSymbol      = tvData.TradingSymbol                                                  ;
            ingOrderData.spreadsheetID      = this.spreadsheetID                                                    ;
            ingOrderData.lst_allGotProfit   = ToStrictNumber(mainData.allGotProfit  , 0                      )      ;
            ingOrderData.lst_allTradeFee    = ToStrictNumber(mainData.allTradeFee   , 0                      )      ;
            ingOrderData.inCoin             = ToStrictNumber(mainData.inCoin        , 0                      )      ;
            ingOrderData.inFund             = ToStrictNumber(mainData.inFund        , 0                      )      ;
            ingOrderData.BaseCoinPrice      = ToStrictNumber(tvData.BaseCoinPrice   , mainData.BaseCoinPrice )      ;

            ingOrderData.ifWaitingThenCancel = true;
            if (ingOrderData.ing_buysell === CV.order_BUY  && tvData.TradingSymbolPrice < ToStrictNumber(ingOrderData.ing_orderPrice, 0) * (1 + tvData.waveUpChg)) { ingOrderData.ifWaitingThenCancel = false }
            if (ingOrderData.ing_buysell === CV.order_SELL && tvData.TradingSymbolPrice > ToStrictNumber(ingOrderData.ing_orderPrice, 0) * (1 + tvData.waveDnChg)) { ingOrderData.ifWaitingThenCancel = false }
            if (ingOrderData.ing_reason.includes('from GS')) {ingOrderData.ifWaitingThenCancel = false}
            if (this.thereCommandFromGS && this.commandData.toCancel) { // 查看是否有来自最高等级的GS交易命令
                AddMessage(this.alertMessage, 'Get toCancel signal from GS');
                ingOrderData.ifWaitingThenCancel = true;
            } 

            // 去交易所查看成交情况
            this.thisLogs.AddNewLogLine('ToCheckWaitingOrder()') ;
            ingOrderData.thisLogs = this.thisLogs ;
            await CheckOrderConfirm(ingOrderData);
            if (!ingOrderData.respOK) {throw new Error('交易所返回数据有错')}

            const w_toUpdateRangeList       = []            ;
            const w_toClearRangeSet         = new Set()     ;
            const w_toAppendTradeHistory    = {}            ;
            const w_toAppendUncloseOrders   = {}            ;

            // 对于部分成交的情况,
            // 按照成交逻辑, 如果返回order_cancel的话, 表示订单没有任何成交
            // 如果传入了撤单命令, 但是订单有成交的话, 返回的订单状态为order_confirm, 但是ing_qty参数做了修改
            // 如果ifWaitingThenCancel = false,  只修改ing_orderStatus一个变量
            // 如果ifWaitingThenCancel = true ,  当做confirm来判断
            // 需要注意的是卖单, 如果部分成交的话, 不能简单地将uncloseOrders中的那个订单删掉, 需要修改那一行, 而不是删掉那一行

            if (ingOrderData.ing_orderStatus === CV.order_confirm ) {
                this.toReNewBeforeWrite = true ;

                if (ingOrderData.ing_buysell === CV.order_BUY) {
                    const newUncloseOrderLine = uncloseOrdersTitleA.map(v => isStrictNumber(ingOrderData['ing_' + v]) ? ingOrderData['ing_' + v] : (ingOrderData['ing_' + v] || CV.NA));
                    uncloseOrdersA2d.push(newUncloseOrderLine);

                    if (ingOrderData.confirmPrice > hghBuyPriceUnclose) { this.hghBuyPriceUnclose = ingOrderData.confirmPrice }
                    if (!isStrictTrue(therePosition)) { this.therePosition = true }
                    this.allPosition = ToStrictNumber(allPosition, 0) + ingOrderData.ing_qty ;
                    this.avgBuyPrice = ingOrderData.ing_avgBuyPrice ;
                    // this.netProfit 无变化
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

                    this.allPosition = allPosition + ingOrderData.ing_qty ;
                    if (this.allPosition < minEnExPosition) {this.allPosition = 0}
                    this.therePosition = this.allPosition > minEnExPosition ? true : false ;
                    // this.avgBuyPrice 无变化
                    this.netProfit = ToStrictNumber(netProfit, 0) + ingOrderData.ing_qty * (ingOrderData.ing_confirmPrice - avgBuyPrice) + ingOrderData.ing_tradeFee;
                }

                w_toClearRangeSet.add(toGCPData.ingOrderLine);
                w_toClearRangeSet.add(toGCPData.uncloseOrdersRange);

                const newTradeHistoryA = tradeHistoryTitleA.map(v => isStrictNumber(ingOrderData['ing_' + v]) ? ingOrderData['ing_' + v] : (ingOrderData['ing_' + v] || CV.NA));
                w_toAppendTradeHistory.toAppend     = true                          ;
                w_toAppendTradeHistory.range        = toGCPData.tradeHistoryRange   ;
                w_toAppendTradeHistory.values       = [newTradeHistoryA]            ;

                // if (uncloseOrdersA2d.length > 0) { w_toUpdateRangeList.push({ range: toGCPData.uncloseOrdersRange, values: uncloseOrdersA2d }) }
                if (uncloseOrdersA2d.length > 0) {
                    w_toAppendUncloseOrders.toAppend     = true                         ;
                    w_toAppendUncloseOrders.range        = toGCPData.uncloseOrdersRange ;
                    w_toAppendUncloseOrders.values       = uncloseOrdersA2d             ;
                }

                const thisMessage = isStrictNumber(ingOrderData.ing_isPartial) ?
                    (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + `Order partially ${Math.round(1000*ingOrderData.ing_isPartial)/10}% confirmed, but order canceled` :
                    (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + `Order fully confirmed`;

                AddSetMessage(this.alertMessageSet, thisMessage) ;
                this.toSendEmail = true ;
            }

            if (ingOrderData.ing_orderStatus === CV.order_partial && ingOrderData.ing_partial - ingOrderData.lst_partial> 0.1 ) {
                const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(ingOrderData[v]) ? ingOrderData[v] : ingOrderData[v] || CV.NA);
                w_toUpdateRangeList.push({ range: toGCPData.ingOrderLine, values: [new_ingOrderLineA] });
                AddSetMessage(this.alertMessageSet, (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + "Order more partial confirmed");
                this.toSendEmail = true ;
            }

            if (ingOrderData.ing_orderStatus === CV.order_cancel) {
                w_toClearRangeSet.add(toGCPData.ingOrderLine);
                AddSetMessage(this.alertMessageSet, (ingOrderData.ing_buysell === CV.order_BUY ? "buy" : "sell") + "Order canceled");
                this.toSendEmail = true ;
            }


            if (w_toClearRangeSet.size > 0) {
                const toClearRangeList = Array.from(w_toClearRangeSet).map(v => makeRequestBodyArrayofBatchUpdate_clear({
                    sheetID: this.sheetsID[v.split('!')[0]],
                    range: v
                }));
                this.batchUpdateList.push(...toClearRangeList);
            }

            if (w_toUpdateRangeList.length > 0) {
                const toClearUpdateRangeList = w_toUpdateRangeList.map(v => makeRequestBodyArrayofBatchUpdate_clearUpdate({
                    sheetID: this.sheetsID[v.range.split('!')[0]],
                    range: v.range,
                    values: v.values
                })).flat();
                this.batchUpdateList.push(...toClearUpdateRangeList);
            }
            
            if (isStrictTrue(w_toAppendTradeHistory.toAppend)) {
                const w_toAppendTradeLine = makeRequestBodyArrayofBatchUpdate_append({
                    sheetID: this.sheetsID[w_toAppendTradeHistory.range.split('!')[0]],
                    values: w_toAppendTradeHistory.values
                });
                this.batchUpdateList.push(w_toAppendTradeLine);
            }

            if (isStrictTrue(w_toAppendUncloseOrders.toAppend)) {
                const w_toAppendUncloseOrdersLines = makeRequestBodyArrayofBatchUpdate_append({
                    sheetID: this.sheetsID[w_toAppendUncloseOrders.range.split('!')[0]],
                    values: w_toAppendUncloseOrders.values
                });
                this.batchUpdateList.push(w_toAppendUncloseOrdersLines);
            }
            
            return true;
        } catch (e) { return e.message.trim() }

    },

    /**
     * 将this大对象中的数据写入GS
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true表示写入成功
     * @returns string: 具体的出错信息
     */
    async WriteToGS_ReleaseLocks() {
        try {
            if (isStrictTrue(this.toReNewBeforeWrite)) { this.renewData() }

            this.updateDataToBot(this.tvData) ;

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

                this.batchUpdateList.push(...makeRequestBodyArrayofBatchUpdate_clearUpdate({
                    sheetID: this.sheetsID[this.toGCPData.HghLowRange.split('!')[0]] ,
                    range: this.toGCPData.HghLowRange,
                    values: newHghLowV
                })) ;
            }

            this.batchUpdateList.push(makeRequestBodyArrayofBatchUpdate_clear({
                sheetID: this.sheetsID[this.toGCPData.toWriteMainRange.split('!')[0]],
                range: this.toGCPData.toWriteMainRange
            }));

            this.batchUpdateList.push(makeRequestBodyArrayofBatchUpdate_append({
                sheetID: this.sheetsID[this.toGCPData.toWriteMainRange.split('!')[0]],
                values: ObjToA2dNumBoolStr(this)
            }));

            this.batchUpdateList.push(makeRequestBodyArrayofBatchUpdate_update(
                {
                sheetID : this.sheetsID[this.toGCPData.lockRange.split('!')[0]]     ,
                range   : this.toGCPData.lockRange                                  ,
                values  : [[CV.noLOCK]]                                             }
            ));


            const r_gslock = await this.gslock_waitOK() ;
            if (!isStrictTrue(r_gslock)) { throw new Error(ToStrictString(r_gslock)) }

            this.thisLogs.AddNewLogLine('去往GS更新最终数据') ;
            await try3times(BatchUpdateGS, this.spreadsheetID, this.batchUpdateList) ;
            this.thisLogs.AddNewLogLine('往GS更新最终数据成功') ;

            this.thisLogs.AddNewLogLine('去执行get_gsData(), 将获得数据存入缓存');
            const r_get_gsData = await this.get_gsData();
            if      (!isStrictTrue(r_get_gsData) || isStrictString(r_get_gsData)) { throw new Error('get_gsData() 失败: \n' + r_get_gsData) }
            else if (this.mainData.timestamp !== this.tvData.timestamp) {throw new Error('get_gsData() 失败: timestamp 不匹配\n') }
            else { this.thisLogs.AddNewLogLine('get_gsData()并写入缓存成功') }

            this.thisLogs.AddNewLogLine('去发送 TG消息 和 Email信息');
            this.sendToTG(this.toReadA2d).catch(() => { });
            this.sendToEmail(this.toEmailA2d).catch(() => { });

            const r_releaseTradeBotLOCK = this.releaseTradeBotLOCK();
            if (!r_releaseTradeBotLOCK || isStrictString(r_releaseTradeBotLOCK)) {
                const errMessage = 'ReleaseTradeBotLOCK() 失败: ' + r_releaseTradeBotLOCK ;
                // 无法为GS解锁, 是严重错误, 需要手动解锁
                this.addRunningWellMessage(errMessage);
                throw new Error(errMessage);
            }

            return true;
        } catch (e) {
            const errMessage = `核心错误: ${e.message}`.trim();
            this.addRunningWellMessage(errMessage);
            return errMessage;
        }

    },

    /**
     * 发送TG
     * @returns 会抛出错误, 但无返回值
     */
    async sendToTG(toReadA2d) {
        const messageString = FormatMatrixToString(toReadA2d);
        const subject = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + '_' + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime);
        await SendTG(subject, messageString);
    },

    /**
     * 发送Email
     * @returns 会抛出错误, 但无返回值
     */
    async sendToEmail(toEmailA2d) {
        if (this.toSendEmail) {
            const messageHTML = ConvertRowsToHtmlTable(toEmailA2d);
            const mail_subject = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + '_' + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime);
            await SendEmail(mail_subject, messageHTML);
        }
    },

};

/**
 * 
 * @param {Object} tvData 
 * @param {LogsWithTime} thisLogs 
 * @returns 
 */
export async function HandleTradeBot(tvData, thisLogs) {
    // 清洗来自TV的数据
    Object.keys(tvData).forEach(key => {
        tvData[key] = ToStrictNumBoolStr(tvData[key], 'notAvailableValueFromTV') ;
        if ( isStrictString(tvData[key]) && tvData[key].includes(CV.HuanHang) ) { tvData[key] = tvData[key].replaceAll(CV.HuanHang, '\n').trim() }
    } ) ;

    const bot = Object.create(TradeBot);
    thisLogs.AddNewLogLine(`创建${tvData.botNumber}机器人成功`)

    thisLogs.AddNewLogLine('去执行CreateBasicAttr()') ;
    const r_CreateBasicAttr = await bot.CreateBasicAttr(tvData, thisLogs);
    if (r_CreateBasicAttr === CV.stopSet         ) {return r_CreateBasicAttr}
    if (r_CreateBasicAttr === CV.newerHandled    ) {return r_CreateBasicAttr}
    if (r_CreateBasicAttr === CV.stillHandleLast ) {return r_CreateBasicAttr}
    if (!r_CreateBasicAttr || isStrictString(r_CreateBasicAttr)) { throw new Error('CreateBasicAttr() 失败: \n' + r_CreateBasicAttr) }
    if (isStrictTrue(r_CreateBasicAttr)) { thisLogs.AddNewLogLine('CreateBasicAttr() success') }

    thisLogs.AddNewLogLine('去执行ToCheckInitiate()') ;
    const r_ToCheckInitiate = await bot.ToCheckInitiate();
    if (!r_ToCheckInitiate || isStrictString(r_ToCheckInitiate)) { throw new Error('ToCheckInitiate() 失败: \n' + r_ToCheckInitiate) }
    if (isStrictTrue(r_ToCheckInitiate)) { thisLogs.AddNewLogLine('ToCheckInitiate() success') }

    thisLogs.AddNewLogLine('去执行CheckAllPosition_withBroker()') ;
    const r_CheckAllPosition_withBroker = await bot.CheckAllPosition_withBroker();
    if (!r_CheckAllPosition_withBroker || isStrictString(r_CheckAllPosition_withBroker)) { throw new Error('CheckAllPosition_withBroker() 失败: \n' + r_CheckAllPosition_withBroker) }
    if (isStrictTrue(r_CheckAllPosition_withBroker)) { thisLogs.AddNewLogLine('CheckAllPosition_withBroker() success') }

    bot.CalcuBuySellLimit();
    thisLogs.AddNewLogLine('CalcuBuySellLimit() success');

    thisLogs.AddNewLogLine('去执行ToCheckFundFee()') ;
    const r_ToCheckFundFee = await bot.ToCheckFundFee();
    if (!r_ToCheckFundFee || isStrictString(r_ToCheckFundFee)) { throw new Error('ToCheckFundFee() 失败: \n' + r_ToCheckFundFee) }
    if (isStrictTrue(r_ToCheckFundFee)) { thisLogs.AddNewLogLine('ToCheckFundFee() success') }

    thisLogs.AddNewLogLine('去执行ToSell()') ;
    const r_ToSell = await bot.ToSell();
    if (!r_ToSell || isStrictString(r_ToSell)) { throw new Error('ToSell() 失败: \n' + r_ToSell) }
    if (isStrictTrue(r_ToSell)) { thisLogs.AddNewLogLine('ToSell() success') }

    thisLogs.AddNewLogLine('去执行ToBuy()') ;
    const r_ToBuy = await bot.ToBuy();
    if (!r_ToBuy || isStrictString(r_ToBuy)) { throw new Error('ToBuy() 失败: \n' + r_ToBuy) }
    if (isStrictTrue(r_ToBuy)) { thisLogs.AddNewLogLine('ToBuy() success') }

    thisLogs.AddNewLogLine('去执行ToCheckWaitingOrder()') ;
    const r_ToCheckWaitingOrder = await bot.ToCheckWaitingOrder();
    if (!r_ToCheckWaitingOrder || isStrictString(r_ToCheckWaitingOrder)) { throw new Error('ToCheckWaitingOrder() 失败: \n' + r_ToCheckWaitingOrder) }
    if (isStrictTrue(r_ToCheckWaitingOrder)) { thisLogs.AddNewLogLine('ToCheckWaitingOrder() success') }

    thisLogs.AddNewLogLine('去执行WriteToGS_ReleaseLocks()') ;
    const r_WriteToGS_ReleaseLocks = await bot.WriteToGS_ReleaseLocks();
    if (!r_WriteToGS_ReleaseLocks || isStrictString(r_WriteToGS_ReleaseLocks)) { throw new Error('WriteToGS_ReleaseLocks() 失败: \n' + r_WriteToGS_ReleaseLocks) }
    if (isStrictTrue(r_WriteToGS_ReleaseLocks)) { thisLogs.AddNewLogLine('WriteToGS_ReleaseLocks() success') }

    return true ;

}
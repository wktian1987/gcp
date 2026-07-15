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
    /**
     * 为大对象和子对象创建基本的运行参数 ;
     * 每次子对象创建后, 必须运行这个函数 ;
     * @param {object} tvData 清理后的tvData
     * @returns 因为有try/catch, 不会抛错
     * @returns {boolean}   true: 成功
     * @returns {string}    string:出错信息
     */
    async CreateBasicAttr(tvData, thisLogs) {
        this.thisLogs           =  thisLogs                     ;
        this.tvData             =  tvData                       ;
        this.LockTime           =  tvData.timestamp             ;
        this.lockName           =  'T' + String(this.LockTime)  ;
        this.task_setGSLOCK     =  null                         ;
        this.task_gslock_fail   =  false                        ;
        this.task_gslock_isOK   =  false                        ;
        this.batchUpdateList    =  []                           ;
        this.alertMessageSet    =  new Set()                    ;
        this.toSendEmail        =  false                        ;
        AddSetMessage(this.alertMessageSet, tvData.thisAlertMessage) ;

        this.tbName_TGID           =  tvData.botNumber + '_TGID'           ; // 全局中保存的发送命令的ID
        this.tbName_tgResetGSLOCK  =  tvData.botNumber + '_tgResetGSLOCK'  ; // 全局中的GS归零信号名
        this.tbName_tgReset        =  tvData.botNumber + '_tgReset'        ; // 全局中的归零信号名
        this.tbName_tgSTOP         =  tvData.botNumber + '_tgSTOP'         ; // 全局中的停止本机器人信号名
        this.tbName_tgSTOP_resp    =  tvData.botNumber + '_tgSTOP_resp'    ; // 全局中的停止本机器人信号已收到名
        this.tbName_tgToReadGSCMD  =  tvData.botNumber + '_tgToReadGSCMD'  ; // 全局中的去读取gs command信号已收到名

        this.tbName_isLocked       =  tvData.botNumber + '_isLocked'       ; // 全局中判断是否locked的名
        this.tbName_lastLockTime   =  tvData.botNumber + '_lastLockTime'   ; // 全局中的锁名
        this.tbName_runningWell    =  tvData.botNumber + '_runningWell'    ; // 全局中的出错名
        this.tbName_spreadsheetID  =  tvData.botNumber + '_spreadsheetID'  ; // 全局中保存的spreadsheetID, 避免每次重新读取
        this.tbName_sheetsID       =  tvData.botNumber + '_sheetsID'       ; // 全局中保存的sheetsID, 避免每次重新读取
        this.tbName_toGCPData      =  tvData.botNumber + '_toGCPData'      ; // 全局中保存的toGCPData, 避免每次重新读取
        this.tbName_gsData         =  tvData.botNumber + '_gsData'         ; // 全局中保存的gsData, 避免每次重新读取

        if (!Object.hasOwn(TradeBot, this.tbName_tgResetGSLOCK )) { TradeBot[this.tbName_tgResetGSLOCK] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgReset       )) { TradeBot[this.tbName_tgReset      ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgSTOP        )) { TradeBot[this.tbName_tgSTOP       ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgSTOP_resp   )) { TradeBot[this.tbName_tgSTOP_resp  ] = false       }
        if (!Object.hasOwn(TradeBot, this.tbName_tgToReadGSCMD )) { TradeBot[this.tbName_tgToReadGSCMD] = false       }

        if (!Object.hasOwn(TradeBot, this.tbName_isLocked      )) { TradeBot[this.tbName_isLocked     ] = false       } // 在全局中设置是否已经被锁
        if (!Object.hasOwn(TradeBot, this.tbName_lastLockTime  )) { TradeBot[this.tbName_lastLockTime ] = 0           } // 在全局中设锁
        if (!Object.hasOwn(TradeBot, this.tbName_runningWell   )) { TradeBot[this.tbName_runningWell  ] = new Set()   } // 在全局中设runningWell
        if (!Object.hasOwn(TradeBot, this.tbName_spreadsheetID )) { TradeBot[this.tbName_spreadsheetID] = null        } // 在全局中设置spreadsheetID
        if (!Object.hasOwn(TradeBot, this.tbName_sheetsID      )) { TradeBot[this.tbName_sheetsID     ] = {}          } // 在全局中设置sheetsID
        if (!Object.hasOwn(TradeBot, this.tbName_toGCPData     )) { TradeBot[this.tbName_toGCPData    ] = {}          } // 在全局中设置toGCPData
        if (!Object.hasOwn(TradeBot, this.tbName_gsData        )) { TradeBot[this.tbName_gsData       ] = {}          } // 在全局中设置gsData


        // 可以通过TG-RESET信号来重置全局锁 和 报错信息
        if (isStrictTrue(TradeBot[this.tbName_tgReset])) { 
            TradeBot[this.tbName_tgSTOP       ]     = false         ;
            TradeBot[this.tbName_tgSTOP_resp  ]     = false         ;
            TradeBot[this.tbName_tgReset      ]     = false         ;
            TradeBot[this.tbName_isLocked     ]     = false         ;
            TradeBot[this.tbName_lastLockTime ]     = 0             ;
            TradeBot[this.tbName_runningWell  ]     = new Set()     ;
            TradeBot[this.tbName_spreadsheetID]     = null          ;
            TradeBot[this.tbName_sheetsID     ]     = {}            ;
            TradeBot[this.tbName_toGCPData    ]     = {}            ;
            TradeBot[this.tbName_gsData       ]     = {}            ;

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
            TradeBot[this.tbName_lastLockTime] = this.LockTime;
        }
        // 至此, 已经在大TradeBot对象中, 给当前botNumber上锁, 其他botNumber几乎不可能再抢占到 大TradeBot锁
        // 在GS中上锁前, 会再次检查 大TradeBot 中的锁, 确保万无一失

        if (TradeBot[this.tbName_spreadsheetID] === null) {
            try {
                // TradeBot[this.tbName_spreadsheetID] = await GetSpreadsheetID(tvData.botNumber);
                TradeBot[this.tbName_spreadsheetID] = await try3times(GetSpreadsheetID, tvData.botNumber);
            } catch (e) {
                let errMessage = e.message + '\n' ;
                const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
                errMessage += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : '大锁已释放' + '\n' ;
                return '获取spreadsheetID失败: \n' + errMessage.trim() ;
            }
        }
        if (isStrictString(TradeBot[this.tbName_spreadsheetID])) {this.spreadsheetID = TradeBot[this.tbName_spreadsheetID] }

        if (isEmptyObject(TradeBot[this.tbName_sheetsID]) ) {
            try {
                // TradeBot[this.tbName_sheetsID] = await GetSheetsIDfromSheet(this.spreadsheetID) ;
                TradeBot[this.tbName_sheetsID] = await try3times(GetSheetsIDfromSheet, this.spreadsheetID) ;
            } catch (e) {
                let errMessage = e.message + '\n' ;
                const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
                errMessage += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : '大锁已释放' + '\n' ;
                return '获取sheetsID失败: \n' + errMessage.trim() ;
            }
        }
        if (!isEmptyObject(TradeBot[this.tbName_sheetsID]) && isObjectOfKeyValue(TradeBot[this.tbName_sheetsID])) {this.sheetsID = TradeBot[this.tbName_sheetsID] }

        if (isEmptyObject(TradeBot[this.tbName_toGCPData]) ) {
            try {
                TradeBot[this.tbName_toGCPData] = await this.Get_toGCPData() ;
            } catch (e) {
                let errMessage = e.message + '\n' ;
                const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
                errMessage += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : '大锁已释放' + '\n' ;
                return '获取toGCPData失败: \n' + errMessage.trim() ;
            }
        }
        if (!isEmptyObject(TradeBot[this.tbName_toGCPData]) && isObjectOfKeyValue(TradeBot[this.tbName_toGCPData])) {this.toGCPData = TradeBot[this.tbName_toGCPData] }

        if (isEmptyObject(TradeBot[this.tbName_gsData]) ) {
            thisLogs.AddNewLogLine('缓存中未发现gsData数据, 去执行Get_gsData()');
            const r_Get_gsData = await this.Get_gsData();
            if (!isStrictTrue(r_Get_gsData) || isStrictString(r_Get_gsData)) { throw new Error('Get_gsData() 失败: \n' + r_Get_gsData) }
            else { thisLogs.AddNewLogLine('Get_gsData()成功') }
        } else {thisLogs.AddNewLogLine('直接从缓存中获取gsData')}
        if (!isEmptyObject(TradeBot[this.tbName_gsData]) && isObjectOfKeyValue(TradeBot[this.tbName_gsData])) {
            this.toGCPData              =  TradeBot[this.tbName_gsData].toGCPData            ;
            this.mainData               =  TradeBot[this.tbName_gsData].mainData             ;
            this.ingOrderData           =  TradeBot[this.tbName_gsData].ingOrderData         ;
            this.ingOrderTitleA         =  TradeBot[this.tbName_gsData].ingOrderTitleA       ;
            this.uncloseOrdersA2d       =  TradeBot[this.tbName_gsData].uncloseOrdersA2d     ;
            this.uncloseOrdersTitleA    =  TradeBot[this.tbName_gsData].uncloseOrdersTitleA  ;
            this.tradeHistoryTitleA     =  TradeBot[this.tbName_gsData].tradeHistoryTitleA   ;
        }

        if (TradeBot[this.tbName_tgToReadGSCMD]) {
            const tgRspTitle = `${tvData.botNumber} 读取gsCommand命令已收到` ;
            thisLogs.AddNewLogLine('收到命令去读取 gs command') ;
            if (isStrictTrue(this.thereCommandFromGS)) {
                const thisLog = 'gs command 已在缓存中, 不必再次获取' ;
                thisLogs.AddNewLogLine(thisLog) ;
                SendTG(tgRspTitle, thisLog, TradeBot[this.tbName_TGID]).catch(() => { });
            } else {
                const commandData = A2dToCleanObj(await try3times(GetGS(this.spreadsheetID, this.toGCPData.CommandRange)));
                const r_makeGSCMD = await this.makeGSCMD(commandData);
                if (isStrictString(r_makeGSCMD)) {
                    const thisLog = r_makeGSCMD;
                    thisLogs.AddNewLogLine(thisLog);
                    SendTG(tgRspTitle, thisLog, TradeBot[this.tbName_TGID]).catch(() => { });
                }
                if (isStrictTrue(r_makeGSCMD)) {
                    const thisLog = '读取 gs command 成功';
                    thisLogs.AddNewLogLine(thisLog);
                    SendTG(tgRspTitle, thisLog, TradeBot[this.tbName_TGID]).catch(() => { });
                }

            }

            TradeBot[this.tbName_tgToReadGSCMD] = false ;
        }

        let currentLock = this.toGCPData.LOCK ;
        if (this.toGCPData.lstLockSignalTime > this.LockTime) { throw new Error('检查GS发现已处理过更新的信号') }
        if (TradeBot[this.tbName_lastLockTime] !== this.LockTime) { throw new Error('临上GS锁前, 再次检查大锁, 发现大锁已被别的信号抢去') }
        if (currentLock !== CV.noLOCK && isStrictTrue(TradeBot[this.tbName_tgResetGSLOCK])) {
            TradeBot[this.tbName_tgResetGSLOCK] = false;
            let resetGSLOCKMessage = '收到resetGSLOCK信号, GSLOCK已释放';
            // await UpdateGS(this.spreadsheetID, toGCPData.lockRange, [[CV.noLOCK]]);
            await try3times(UpdateGS, this.spreadsheetID, this.toGCPData.lockRange, [[CV.noLOCK]]);
            await this.Get_toGCPData();
            currentLock = this.toGCPData.LOCK;
            if (isStrictTrue(currentLock !== CV.noLOCK)) { 
                resetGSLOCKMessage = '收到RESETGSLOCK信号, 但往GS写入noLOCK失败' ;
                SendTG(`${tvData.botNumber} resetGSLOCK命令已收到`, resetGSLOCKMessage, TradeBot[this.tbName_TGID]).catch(() => { });
                throw new Error(resetGSLOCKMessage);
            }
            SendTG(`${tvData.botNumber} resetGSLOCK命令已收到`, resetGSLOCKMessage, TradeBot[this.tbName_TGID]).catch(() => { });
        }

        if (currentLock !== CV.noLOCK) {
            const errMessage = '上一次运行大TradeBot锁被释放的情况下, GS锁未被释放';
            this.AddRunningWellMessage(errMessage);
            throw new Error(errMessage);
        }

        // 发送设置GSLOCK任务, 写入不成功是小概率事件, 不必等待结果, 只在运行到重要情况前确认
        if (currentLock === CV.noLOCK) {
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

    } , // 执行完此后, 已获得 大TradeBot锁 和 GS锁 , 谨记最后释放

    /**
     * 释放大锁
     * @returns true: 解锁成功
     * @returns string: 解锁校验出错
     */
    ReleaseTradeBotLOCK() {
        if (TradeBot[this.tbName_lastLockTime] !== this.LockTime) {
            return '释放大锁失败, 此信号无权解锁' ;
        } else {
            TradeBot[this.tbName_isLocked] = false ;
            return true ;
        }
    },

    /**
     * 将新的出错信息写入 大TradeBot对象 中
     * @param {string} errMessage 
     */
    AddRunningWellMessage(errMessage) { AddSetMessage(TradeBot[this.tbName_runningWell], errMessage) } ,

    /**
     * 依据runningWellSet中是否有元素来判断是否有运行错误
     * @returns true: 运行中无错误
     * @returns false: 运行中有错误
     */
    isRunningWell() { return TradeBot[this.tbName_runningWell].size === 0 },

    /**
     * 获取当前toGCPData
     * @returns {Promise<Object>}
     */
    async Get_toGCPData() { 
        this.toGCPData = A2dToCleanObj(await try3times(GetGS, this.spreadsheetID, CV.toGCPRanges)) ;
        return this.toGCPData ;
    },

    /**
     * 检测当前GS中分布式锁的真实归属,
     * @returns {Promise<String>} String: 当前的lockName
     */
    async CheckLockFromGS(NotGotLockValueTo = 'NotGotLockValue') {return ( await this.Get_toGCPData() ) ?.LOCK ?? NotGotLockValueTo } ,

    async GSLOCK_waitOK() {
        await this.task_setGSLOCK ;
        if (this.task_gslock_isOK) {return true} 
        else {return '检查set GSLOCK，发现设置失败'}
    } ,

    /**
     * 释放分布式排他锁
     * @param {number} [MAX_Attempts=99] 最多尝试解锁次数
     * @param {string} [NotGotLockValueTo='NotGotLockValue'] 未从GS中获取到锁状态时的默认值, 保持默认即可
     * @returns 因为try/catch, 不会抛错
     * @returns {Promise<boolean>} true:   解锁成功返回
     * @returns {Promise<string>}  string: 解锁失败原因
     */
    async ReleaseLockOfGS(MAX_Attempts = 3, NotGotLockValueTo = 'NotGotLockValue') {
        try {
            // 再次确权, 验证要加的锁, 是否与TradeBot中的锁相同
            if (TradeBot[this.tbName_lastLockTime] !== this.LockTime) { throw new Error('TradeBot存放的LockTime与当前写入的不符') }

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
                    await try3times(UpdateGS, this.spreadsheetID, toGCPData.lockRange, [[CV.noLOCK]]);
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
    async Get_gsData() {
        try {
            let toGCPData = this.toGCPData ;

            const rangesList = [    toGCPData.mainRange                ,    // 0 
                                    toGCPData.uncloseOrdersRange       ,    // 1
                                    toGCPData.ingOrderLine             ,    // 2
                                    toGCPData.tradeHistoryTitleLine    ,    // 3
                                    toGCPData.uncloseOrdersTitleLine   ,    // 4
                                    toGCPData.ingOrderTitleLine        ,    // 5
                                    toGCPData.CommandRange             ,    // 6
                                    CV.toGCPRanges                     ,    // 7
                                    toGCPData.toReadRange              ,    // 8
                                    toGCPData.toEmailRange                  // 9
                                ] ; 
                        
            const valuesArray   = await try3times(BatchGetGS, this.spreadsheetID, rangesList);

            const raw_mainData  = valuesArray[0];
            if (!Array.isArray(raw_mainData) || !Array.isArray(raw_mainData[0]) ) {throw new Error('didnt get available data, 1') }
            const mainData  = A2dToCleanObj(raw_mainData) ;
            // if (    !Object.hasOwn(mainData, 'LOCK')    ||
            //         !isStrictString(mainData.LOCK)      ||
            //         mainData.LOCK !== this.lockName     )   {throw new Error('didnt get available data, 2') }
            if (mainData.TradingSymbol !== this.tvData.TradingSymbol) {
                const errMessage = 'The TradingSymbol in GS is different from TV' ;
                this.AddRunningWellMessage(errMessage) ; // 这是很严重的错误, 需要记录
                throw new Error(errMessage) ;
            }

            const uncloseOrdersA2d      = isStrictTrue(mainData.therePosition) ? (valuesArray[1]).map(lines => CleanArrayToNumStrBool(lines)) : [] ;

            const ingOrderLineA         = mainData.ing_orderStatus === CV.order_waiting ? CleanArrayToNumStrBool(valuesArray[2][0]) : [] ;
            const ingOrderTitleA        = CleanArrayToNumStrBool(valuesArray[5][0]) ;
            const ingOrderData          = mainData.ing_orderStatus === CV.order_waiting ? A2LinesToCleanObj([ingOrderTitleA, ingOrderLineA]) : null ;

            const uncloseOrdersTitleA   = CleanArrayToNumStrBool(valuesArray[4][0]) ;

            const tradeHistoryTitleA    = CleanArrayToNumStrBool(valuesArray[3][0]) ;

            // const commandData           = A2dToCleanObj(valuesArray[6]) ;

            toGCPData = A2dToCleanObj(valuesArray[7]);

            const toReadA2d = valuesArray[8].map(v => CleanArrayToNumStrBool(v)) ;
            const toEmailA2d = valuesArray[9].map(v => CleanArrayToNumStrBool(v)) ;

            this.toGCPData              =  toGCPData            ;
            this.mainData               =  mainData             ;
            this.ingOrderData           =  ingOrderData         ;
            this.ingOrderTitleA         =  ingOrderTitleA       ;
            this.uncloseOrdersA2d       =  uncloseOrdersA2d     ;
            this.uncloseOrdersTitleA    =  uncloseOrdersTitleA  ;
            this.tradeHistoryTitleA     =  tradeHistoryTitleA   ;
            this.toReadA2d              =  toReadA2d            ;
            this.toEmailA2d             =  toEmailA2d           ;

            TradeBot[this.tbName_gsData].toGCPData              =  this.toGCPData            ;
            TradeBot[this.tbName_gsData].mainData               =  this.mainData             ;
            TradeBot[this.tbName_gsData].ingOrderData           =  this.ingOrderData         ;
            TradeBot[this.tbName_gsData].ingOrderTitleA         =  this.ingOrderTitleA       ;
            TradeBot[this.tbName_gsData].uncloseOrdersA2d       =  this.uncloseOrdersA2d     ;
            TradeBot[this.tbName_gsData].uncloseOrdersTitleA    =  this.uncloseOrdersTitleA  ;
            TradeBot[this.tbName_gsData].tradeHistoryTitleA     =  this.tradeHistoryTitleA   ;

            // await this.makeGSCMD(commandData) ;

            return true ;

        } catch(e) { 
        // 这里的错误是非核心错误, 可以在释放两个锁后, 抛出错误退出
            let errMessage = e.message + '\n' ;

            const r_ReleaseLockOfGS     =  await this.ReleaseLockOfGS() ; // 尝试给GS解锁
            const r_ReleaseTradeBotLOCK =  isStrictTrue(r_ReleaseLockOfGS) ? this.ReleaseTradeBotLOCK() : 'ReleaseLockOfGS() fail, no need to release TradeBot Lock' ;
            errMessage  += isStrictString(r_ReleaseLockOfGS)     ? r_ReleaseLockOfGS     + '\n' : 'GS LOCK释放成功'       + '\n';
            errMessage  += isStrictString(r_ReleaseTradeBotLOCK) ? r_ReleaseTradeBotLOCK + '\n' : 'TradeBot LOCK释放成功' + '\n';
            if (!isStrictTrue(r_ReleaseLockOfGS) || !isStrictTrue(r_ReleaseTradeBotLOCK)) {this.AddRunningWellMessage(errMessage)}
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

            const r_gslock = await this.GSLOCK_waitOK() ;
            if (!isStrictTrue(r_gslock)) {return ToStrictString(r_gslock)}

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

            const r_Get_gsData = await this.Get_gsData() ;
            if (!isStrictTrue(r_Get_gsData) || isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
            if (!isStrictTrue(this.mainData.initiated)) {
                await Sleep(2000) ; // 第一次校验不成功的话, 等2s再校验一次
                const r_Get_gsData = await this.Get_gsData() ;
                if (isStrictString(r_Get_gsData)) {throw new Error('Get_gsData() 失败: \n' + r_Get_gsData)}
                if (!isStrictTrue(this.mainData.initiated)) {throw new Error('初始化后经校验初始化结果未更新') }
            }

            this.thisLogs.AddNewLogLine('在GS更新initiate成功') ;

            AddSetMessage(this.alertMessageSet, 'just initiated')  ;
            
            return true ;

        } catch(e) {
            // 这属于严重核心错误, 不必解锁了, 让它一直锁着, 等手动调试
            this.AddRunningWellMessage(e.message) ;
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
            this.AddRunningWellMessage(errMessage);
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

    /**
     * 计算当价格变化多少的时候, 引起的 allFund 和 allCoin 会成为多少
     * @param {number} chgPct 价格变化的值, 例如-0.2 表示价格变化-20%, 要求: -2 < chgPct < 2
     * @returns 一个对象 {then_allFUnd, then_allCoin}
     */
    valueIfChg(chgPct) {
        if (!isStrictNumber(chgPct) || chgPct > 2 || chgPct < -2) {throw new Error('chgPct输入错误')}
        const then_Price        =  this.TradingSymbolPrice * (1+chgPct) ;
        const then_openProfit   =  this.therePosition ? this.allPosition * (then_Price - this.avgBuyPrice) : 0 ;
        const then_b_chgPct     =  (chgPct > 0 ? this.Aup2B : this.Adn2B) * chgPct ;
        const then_b_Price      =  this.BaseCoinPrice * (1+then_b_chgPct) ;
        const then_allFUnd      =  this.inCoin * then_b_Price + this.inFund + ToStrictNumber(this.netProfit, 0) + then_openProfit ;
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
    GetStopPriceF() {
        const pct_stopF_stopF    = this.chgPctIfVALUEFchg(this.hghestFund * (1+this.stopRate4F/100), 0 , -1) ;
        const pct_stopF_notStopC = this.chgPctIfVALUECchg(this.hghestCoin * (1+this.notStop4C /100), 0 , -1) ;
        if (!isStrictNumber(pct_stopF_stopF) || !isStrictNumber(pct_stopF_notStopC)) {return false}
        return this.TradingSymbolPrice * (1 + Math.min(pct_stopF_stopF, pct_stopF_notStopC)) ;
    } ,

    /**
     * 计算stopPriceC
     * @returns false: 表示永远不会触发stopPriceC
     * @returns number: 计算出的stopPriceC
     */
    GetStopPriceC() {
        const pct_stopC_stopC    = this.chgPctIfVALUECchg(this.hghestCoin * (1+this.stopRate4C /100) , 0 , -1) ;
        const pct_stopC_notStopF = this.chgPctIfVALUEFchg(this.hghestFund * (1+this.notStop4F  /100) , 0 , -1) ;
        if (!isStrictNumber(pct_stopC_stopC) || !isStrictNumber(pct_stopC_notStopF)) {return false}
        return this.TradingSymbolPrice * (1 + Math.min(pct_stopC_stopC, pct_stopC_notStopF)) ;
    } ,

    /**
     * 计算liquidatePrice
     * @returns false: 表示永远不会触发liquidatePrice
     * @returns number: 计算出的liquidatePrice
     */
    GetLiquidPrice() {
        const pct_liquid = this.chgPctIfVALUEFchg(0, 0, -1) ;
        if (!isStrictNumber(pct_liquid)){return false}
        return this.TradingSymbolPrice * (1 + pct_liquid) ;
    } ,

    renewData() {
    // 有新交易后，发生变化的变量是:
    // therePosition, allPosition, avgBuyPrice, netProfit, 
    this.openProfit     = isStrictTrue(this.therePosition) ? this.allPosition * (this.TradingSymbolPrice - this.avgBuyPrice) : CV.NA    ;
    this.allProfit      = ToStrictNumber(this.netProfit, 0) + ToStrictNumber(this.openProfit, 0)                                        ;
    this.usedMargin     = isStrictTrue(this.therePosition) ? this.allPosition * this.TradingSymbolPrice / this.leverage : CV.NA         ;
    this.crtFund        = this.inFund + ToStrictNumber(this.netProfit, 0) + ToStrictNumber(this.openProfit, 0)                          ;
    this.crtCoin        = this.inCoin                                                                                                   ;
    this.freeMargin     = this.crtFund + this.crtCoin * this.BaseCoinPrice * this.BaseCoinHairCut - ToStrictNumber(this.usedMargin, 0)  ;
    this.allFund        = this.crtFund + this.crtCoin * this.BaseCoinPrice                                                              ;
    this.allCoin        = this.crtFund / this.BaseCoinPrice + this.crtCoin                                                              ;

    // [this.liquidatePrice, this.stopPriceC, this.stopPriceF] = this.GetLiquidateStopPrice();
    this.liquidatePrice = isStrictTrue(this.therePosition) ? this.GetLiquidPrice() : CV.NA ;
    this.stopPriceC     = isStrictTrue(this.therePosition) ? this.GetStopPriceC()  : CV.NA ;
    this.stopPriceF     = isStrictTrue(this.therePosition) ? this.GetStopPriceF()  : CV.NA ;
    } ,

    /**
     * 对当前账户状态进行更新 ; 
     * 直接从bot对象中获取数据, 不需要额外输入 ; 
     * bot对象中的数据, 来源于GS, TV ;
     * 除了修改的数据之外, 认为这些数据是绝对正确的
     */
    ReNew() {
        this.renewData() ;

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


        if (this.allFund > this.rcd_fund * (1 + this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↑ new rcd_fund'); }
        if (this.allFund < this.rcd_fund * (1 - this.barChgA)) { this.rcd_fund = this.allFund; AddSetMessage(this.alertMessageSet, '↓ new rcd_fund'); }
        if (this.allCoin > this.rcd_coin * (1 + this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↑ new rcd_coin'); }
        if (this.allCoin < this.rcd_coin * (1 - this.barChgB)) { this.rcd_coin = this.allCoin; AddSetMessage(this.alertMessageSet, '↓ new rcd_coin'); }

        this.toWriteHghLow = false ;
        if (this.allFund > this.hghestFund) { this.toWriteHghLow = true; this.hghestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↑ new hghestFund"); }
        if (this.allFund < this.lowestFund) { this.toWriteHghLow = true; this.lowestFund = this.allFund; AddSetMessage(this.alertMessageSet, "↓ new lowestFund"); }
        if (this.allCoin > this.hghestCoin) { this.toWriteHghLow = true; this.hghestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↑ new hghestCoin"); }
        if (this.allCoin < this.lowestCoin) { this.toWriteHghLow = true; this.lowestCoin = this.allCoin; AddSetMessage(this.alertMessageSet, "↓ new lowestCoin"); }

        // 计算边界, 以后用
        this.closeToRndHgh = this.roundHgh / Math.pow((1 + this.waveUpChg), this.notBuyCloseToRndHghStep);
        this.closeToRndLow = this.roundLow / Math.pow((1 + this.waveDnChg), this.notBuyCloseToRndLowStep);

        this.enDifficultyBuyPrice  = this.therePosition ? this.lowBuyPriceUnclose * (1+this.enDifficulty*this.waveDnChg) : null ;
        this.exDifficultySellPrice = this.therePosition ? this.lowBuyPriceUnclose * (1+this.enDifficulty*this.waveUpChg) : null ;

        this.lowToBuy = Math.max(this.basicLowToBuy, this.closeToRndLow);

        this.hghToBuy = Math.min(
            this.basicHghToBuy                                                  ,
            this.closeToRndHgh                                                  ) ;
        if (this.therePosition) { this.hghToBuy = Math.min(this.hghToBuy, this.enDifficultyBuyPrice) }
        
        this.lowToSell = this.basicLowToSell;
        if (this.therePosition) { this.lowToSell = Math.max(this.basicLowToSell, this.exDifficultySellPrice) }

        this.inTradingTime = this.timestamp > this.realTradeTime && this.timestamp < this.realTradeTimeTo;

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
        if (this.freeMargin / (this.MaxGrid - this.gridNum) < 1.1 * this.minEnExPosition * this.TradingSymbolPrice / this.leverage) {
            this.canBuy = false;
            this.cantBuyReason = AddMessage(this.cantBuyReason, 'cant buy: ' + 'Not enough freeMargin');
        }

        if (!isStrictTrue(this.therePosition)) {
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
            
            const uncloseOrdersA2d      =  this.uncloseOrdersA2d         ;
            const uncloseOrdersTitleA   =  this.uncloseOrdersTitleA      ;
            const ingOrderTitleA        =  this.ingOrderTitleA           ;
            const ingOrderLine          =  this.toGCPData.ingOrderLine   ;

            let toSell = false;
            let toSellOrderA;
            const S = {};

            const idx_serial        = uncloseOrdersTitleA.indexOf('serial')         ;
            const idx_confirmPrice  = uncloseOrdersTitleA.indexOf('confirmPrice')   ;
            const idx_qty           = uncloseOrdersTitleA.indexOf('qty')            ;

            const inNormalSellRegion = this.TradingSymbolPrice > this.lowToSell ? true : false ;
            AddSetMessage(this.alertMessageSet, inNormalSellRegion ? 'inNormalSellRegion' : 'not inNormalSellRegion');

            // touch targetHgh
            if (inNormalSellRegion && (this.TradingSymbolPrice > (1 + this.tradeFeeRate) * this.lowBuyPriceUnclose) && this.markTouchTargetHgh) {
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
                S.ing_orderPrice = CV.NA;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut too hgh buy order';
            }
            // cut due to stopC
            if (this.TradingSymbolPrice < this.stopPriceC) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = CV.NA;
                S.ing_orderType = CV.order_T_MKT; 
                S.ing_reason = 'cut due to stopC';
            }
            // cut due to stopF
            if (this.TradingSymbolPrice < this.stopPriceF) {
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.hghBuySerialUnclose));
                S.ing_orderPrice = CV.NA;
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

            if (this.thereCommandFromGS && isStrictTrue(this.commandData.toSell)) {
                AddSetMessage(this.alertMessageSet, 'Get toSell signal from GS') ;
                toSell = true;
                toSellOrderA = uncloseOrdersA2d.find(v => String(v[idx_serial]) === String(this.lowBuySerialUnclose));
                S.ing_orderPrice = this.commandData.price;
                S.ing_orderType  = this.commandData.orderType ;
                if (S.ing_orderType === CV.order_T_MKT) {S.ing_orderPrice = CV.NA}
                S.ing_reason = 'toSell from GS';
            }

            if (isStrictFalse(toSell)) { return true }

            const r_gslock = await this.GSLOCK_waitOK();
            if (!isStrictTrue(r_gslock)) { return ToStrictString(r_gslock) }

            S.ing_orderID           = 'S-' + GetTimeStringWithOffset(8, this.timestamp)                         ;
            S.ing_orderTimestamp    = Date.now()                                                                ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)                          ;
            S.ing_serial            = -1 * toSellOrderA[idx_serial]                                             ;
            S.ing_buysell           = CV.order_SELL                                                             ;
            S.ing_triggerPrice      = this.TradingSymbolPrice                                                   ;
            S.ing_boughtPrice       = toSellOrderA[idx_confirmPrice]                                            ;
            S.ing_qty               = -1 * toSellOrderA[idx_qty]                                                ;
            S.ing_orderStatus       = CV.order_pending                                                          ;
            S.isReal                = this.isReal                                                               ;
            S.TradingSymbol         = this.TradingSymbol                                                        ;
            S.spreadsheetID         = this.spreadsheetID                                                        ;

            this.thisLogs.AddNewLogLine('ToBuy()') ;
            S.thisLogs = this.thisLogs ;
            await SendOrderToBroker(S);
            if (!S.respOK) {throw new Error('交易所返回数据不正确')}
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.ifOrderWaiting             =  true ;
            this.mainData.ifOrderWaiting    =  true ;
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
            const ingOrderTitleA = this.ingOrderTitleA          ;
            const ingOrderLine   = this.toGCPData.ingOrderLine  ;

            let toBuy = false;
            const S = {};

            const inNormalBuyRegion = this.TradingSymbolPrice > this.lowToBuy && this.TradingSymbolPrice < this.hghToBuy ? true : false ; 
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

            const r_gslock = await this.GSLOCK_waitOK();
            if (!isStrictTrue(r_gslock)) { return ToStrictString(r_gslock) }

            S.ing_orderID           = 'B-' + GetTimeStringWithOffset(8, this.timestamp)     ;
            S.ing_orderTimestamp    = Date.now()                                            ;
            S.ing_orderDate         = GetTimeStringWithOffset(8, S.ing_orderTimestamp)      ;
            S.ing_serial            = ToStrictNumber(this.lstBuySerial, 0) + 1              ;
            S.ing_buysell           = CV.order_BUY                                          ;
            S.ing_triggerPrice      = this.TradingSymbolPrice                               ;
            S.ing_orderType         = S.ing_orderType || CV.order_T_LMT                     ;
            S.ing_orderStatus       = CV.order_pending                                      ;
            S.isReal                = this.isReal                                           ;
            S.TradingSymbol         = this.TradingSymbol                                    ;
            S.spreadsheetID         = this.spreadsheetID                                    ;
            S.calcuQtyPrice = (S.ing_orderType === CV.order_T_MKT || !isStrictNumber(S.ing_orderPrice) ) ? this.TradingSymbolPrice : S.ing_orderPrice ;
            S.ing_qty               = this.minEnExPosition * Math.max(1, Math.floor(this.freeMargin * this.leverage / S.calcuQtyPrice / this.minEnExPosition / (this.MaxGrid - this.gridNum)))     ;

            this.thisLogs.AddNewLogLine('ToBuy()') ;
            S.thisLogs = this.thisLogs ;
            await SendOrderToBroker(S);
            if (!S.respOK) { throw new Error('交易所返回数据不正确') }
            // 对于实际交易所中的orderID, 交易所可能会返回, 他们自己的orderID格式

            const new_ingOrderLineA = ingOrderTitleA.map(v => isStrictNumber(S[v]) ? S[v] : (S[v] || CV.NA));

            this.ifOrderWaiting             =  true ;
            this.mainData.ifOrderWaiting    =  true ;
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
            // 这是核心错误, 不能解锁, 需要手动查看
            const errMessage = `核心错误: ${e.message}`.trim() ;
            this.AddRunningWellMessage(errMessage) ;
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
                    if (!isStrictTrue(this.therePosition)) { this.therePosition = true }
                    this.allPosition = ToStrictNumber(this.allPosition, 0) + ingOrderData.ing_qty ;
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

                    this.allPosition = this.allPosition + ingOrderData.ing_qty ;
                    if (this.allPosition < this.minEnExPosition) {this.allPosition = 0}
                    this.therePosition = this.allPosition > this.minEnExPosition ? true : false ;
                    // this.avgBuyPrice 无变化
                    this.netProfit = ToStrictNumber(this.netProfit, 0) + ingOrderData.ing_qty * (ingOrderData.ing_confirmPrice - this.avgBuyPrice) + ingOrderData.ing_tradeFee;
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
     * 将this大对象中的数据写入GS
     * @returns 因为有try/catch, 不会抛出错误
     * @returns true表示写入成功
     * @returns string: 具体的出错信息
     */
    async WriteToGS_ReleaseLocks() {
        const r_gslock = await this.GSLOCK_waitOK() ;
        if (!isStrictTrue(r_gslock)) {return ToStrictString(r_gslock)}


        try {
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

            this.thisLogs.AddNewLogLine('去往GS更新最终数据') ;
            await try3times(BatchUpdateGS, this.spreadsheetID, this.batchUpdateList) ;
            this.thisLogs.AddNewLogLine('往GS更新最终数据成功') ;

            this.thisLogs.AddNewLogLine('去执行Get_gsData(), 将获得数据存入缓存');
            const r_Get_gsData = await this.Get_gsData();
            if (!isStrictTrue(r_Get_gsData) || isStrictString(r_Get_gsData)) { throw new Error('Get_gsData() 失败: \n' + r_Get_gsData) }
            else { this.thisLogs.AddNewLogLine('Get_gsData()并写入缓存成功') }

            this.thisLogs.AddNewLogLine('去发送 TG消息 和 Email信息');
            this.SendToTG(this.toReadA2d).catch(() => { });
            this.SendToEmail(this.toEmailA2d).catch(() => { });

            const r_ReleaseTradeBotLOCK = this.ReleaseTradeBotLOCK();
            if (!r_ReleaseTradeBotLOCK || isStrictString(r_ReleaseTradeBotLOCK)) {
                const errMessage = 'ReleaseTradeBotLOCK() 失败: ' + r_ReleaseTradeBotLOCK ;
                // 无法为GS解锁, 是严重错误, 需要手动解锁
                this.AddRunningWellMessage(errMessage);
                throw new Error(errMessage);
            }

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
    async SendToTG(rawMessagesA2d) {
        const messageString = FormatMatrixToString(rawMessagesA2d);
        const subject = this.botNumber + '_' + GetTimeStringWithOffset(8, this.timestamp) + '_' + this.TradingSymbol + '_' + GetTimeStringWithOffset(8, this.realTradeTime);

        await SendTG(subject, messageString);
    },

    /**
     * 发送Email
     * @returns 会抛出错误, 但无返回值
     */
    async SendToEmail(rawMessagesA2d) {
        if (this.toSendEmail) {
            const messageHTML = ConvertRowsToHtmlTable(rawMessagesA2d);
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
    const gcpGetTime = Date.now() ;
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

    // 将 mainData 和 tvData 写入到this大对象中
    // 必须先写入mainData, 再写入tvData
    // 因为mainData包含旧数据
    bot.UpdateDataToBot(bot.mainData)                           ;
    bot.UpdateDataToBot(bot.tvData)                             ;
    bot.gcpGetTime  = gcpGetTime  ;
    thisLogs.AddNewLogLine('UpdateDataToBot() success')     ;

    bot.ReNew();
    thisLogs.AddNewLogLine('ReNew() success')   ;

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

    if (isStrictTrue(bot.toReNewBeforeWrite)) {bot.renewData()}
    thisLogs.AddNewLogLine('去执行WriteToGS_ReleaseLocks()') ;
    const r_WriteToGS_ReleaseLocks = await bot.WriteToGS_ReleaseLocks();
    if (!r_WriteToGS_ReleaseLocks || isStrictString(r_WriteToGS_ReleaseLocks)) { throw new Error('WriteToGS_ReleaseLocks() 失败: \n' + r_WriteToGS_ReleaseLocks) }
    if (isStrictTrue(r_WriteToGS_ReleaseLocks)) { thisLogs.AddNewLogLine('WriteToGS_ReleaseLocks() success') }

    return true ;

}
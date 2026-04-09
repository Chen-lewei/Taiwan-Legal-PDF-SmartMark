// ==========================================
// SmartMark Pro 刑案電子卷證：智慧書籤建立器 
// (V9.9.30 - 執行版)
// 修復：抗 OCR 亂碼之匯款單據終極擴充盾牌
//This script was designed by Prosecutor Chen Le-Wei and written by AI.
// ==========================================

(function() {
    var doc = this;
    if (!doc || !doc.numPages) {
        app.alert({cMsg: "請先開啟一份 PDF 卷證檔案！", nIcon: 0, nType: 0, cTitle: "錯誤"});
        return;
    }

    var totalPages = doc.numPages;
    var statementList = [];
    var docList = [];

    console.println("🚀 SmartMark Pro V9.9.30 (純淨執行版) 啟動中...");
    console.println("📄 總頁數：" + totalPages + " 頁");
    console.println("⏳ 掃描進行中，請勿關閉此視窗...");
    console.println("─────────────────────────────────");

    // ── 預編譯 RegExp ────────────────────────────────────────────
    var reRough = new RegExp("筆錄|調查|偵訊|警詢|詢問|審判|準備程序|出席職員|偵查庭|檢察官問|搜索|扣押|鑑定|採尿|攝影時間|相片影像|解剖|醫鑑字|送驗資料|刑事警察局|廉政署|肅貪組|調查局|調查處|機動工作站|存款交易明細|往來交易明細|診斷證明書|扣押物品照片|酒精測定|交通事故|肇事人自首|醫院|照片黏貼紀錄表|初步分析研判表|現場圖|談話紀錄表|當時天候|有無飲酒|鑑定意見書|駕籍詳細|車輛詳細|職務報告|身分證統一編號|支出金額|存入金額|帳號|交易時間|交易序號|165專線|詐騙帳戶|被害人受騙款項|刑事辯護意旨|刑事答辯狀|辯護意旨狀|答辯狀|刑事告訴狀|承辦股別|相驗屍體證明書|成人保護案件通報表|歸檔案號|刑案現場勘察報告|勘察目的|勘察人員|國民身分證|受詢");
    var reDateYMD1   = new RegExp("(?:民國)?(\\d{1,4})年{1,2}(\\d{1,4})月{0,2}(\\d{1,4})[日曰]{0,2}");
    var reDateSlash1 = new RegExp("(\\d{2,3})\\/(\\d{1,2})\\/(\\d{1,2})");
    var reDateDot1   = new RegExp("(\\d{2,3})\\.(\\d{1,2})\\.(\\d{1,2})");
    var reDateYMDg   = new RegExp("(?:民國)?(\\d{1,4})年{1,2}(\\d{1,4})月{0,2}(\\d{1,4})[日曰]{0,2}", "g");
    var reDateSlashg = new RegExp("(\\d{2,3})\\/(\\d{1,2})\\/(\\d{1,2})", "g");
    var reTailCut    = new RegExp("(性|男|女|別|有|無|歲|籍|出|生|號|綽|住).*$");
    var reChName     = new RegExp("^[\\u4e00-\\u9fa5]{2,5}");
    var reChName4    = new RegExp("^[\\u4e00-\\u9fa5]{2,4}");
    var reNameIgnore = new RegExp("不詳|沒有|忘記|同上|國民|身分|姓名|年籍|住址|下列|告知|出生|詢問|綽號|上記|資料|前科|權利|事項|正確|清楚|何關|關係|告訴");
    var reSkipAns    = new RegExp("不詳|沒有|同上|戶籍|臺中|臺南|臺北|高雄|新竹|苗栗|正確|知道|告知|年籍|住址|下列|出生|詢問|瞭解|都沒|因為|均不|綽號|特徵|性別|清楚|上記|資料|前科|權利|事項|上述|我們|八十|開始");
    var reWitNotName = new RegExp("沒有|不詳|同上|如上|知道");
    var reChinese    = new RegExp("[\\u4e00-\\u9fa5]", "g");
    var reClean1     = new RegExp("[\\s　]+", "g");
    var reEnName     = new RegExp("^[A-Za-z][A-Za-z ]+");

    // ── 重複書籤計數器 ────────────────────────────────────────────
    var docCounter = {};
    var getBookmarkTitle = function(baseName) {
        if (docCounter[baseName] === undefined) docCounter[baseName] = 0;
        docCounter[baseName]++;
        return docCounter[baseName] === 1 ? baseName : baseName + docCounter[baseName];
    };

    // ── 單次文件旗標（只建第一頁）────────────────────────────────
    var photoAdded         = false;
    var seizurePhotoAdded  = false;
    var bankDetailAdded    = false;
    var bankTxAdded        = false;
    var trafficRptAdded    = false;
    var trafficRpt2Added   = false;
    var trafficPhotoAdded  = false;
    var casePhotoAdded     = false;
    var lastFinStatementPage = -99;

    // ── 快取與文字處理 ────────────────────────────────────────────────
    var pageCache = {};

    var getPageWordCount = function(pageNum) {
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        if (pageCache[pageNum].n === undefined)
            pageCache[pageNum].n = doc.getPageNumWords(pageNum);
        return pageCache[pageNum].n;
    };

    var getPageText = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].text !== undefined)
            return pageCache[pageNum].text;
        var n = getPageWordCount(pageNum);
        var parts = [];
        for (var w = 0; w < n; w++) parts.push(doc.getPageNthWord(pageNum, w, false));
        var text = parts.join("").replace(reClean1, "").replace(/◦/g, "0").replace(/(\d)[，、。．,](\d)/g, "$1$2");
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].text = text;
        return text;
    };

    var getPageTextFast = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].text !== undefined)
            return pageCache[pageNum].text;
        var n = getPageWordCount(pageNum);
        if (n === 0) return "";

        var limit1 = Math.min(n, 200);
        var parts = [];
        for (var w = 0; w < limit1; w++) parts.push(doc.getPageNthWord(pageNum, w, false));
        var quick = parts.join("").replace(reClean1, "");

        if (!reRough.test(quick)) {
            if (n <= 200) {
                var cleaned = quick.replace(/◦/g, "0").replace(/(\\d)[，、。．,](\\d)/g, "$1$2");
                if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
                pageCache[pageNum].text = cleaned;
                return cleaned;
            }
            return quick;
        }

        if (n > 200) {
            for (var w3 = limit1; w3 < n; w3++) parts.push(doc.getPageNthWord(pageNum, w3, false));
            quick = parts.join("").replace(reClean1, "");
        }
        var fullText = quick.replace(/◦/g, "0").replace(/(\\d)[，、。．,](\\d)/g, "$1$2");
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].text = fullText;
        return fullText;
    };

    var isOcrPage = function(pageNum) {
        var n = getPageWordCount(pageNum);
        if (n < 10) return false;
        var text = getPageText(pageNum);
        if (text.length < 20) return false;
        var chMatches = text.match(reChinese);
        var chCount = chMatches ? chMatches.length : 0;
        return (chCount / text.length) >= 0.15;
    };

    // ── OCR 預檢 ────────────────────────────────────────────────
    var checkPages = Math.min(5, totalPages);
    var nonOcrCount = 0;
    var nonOcrPages = [];
    for (var cp = 0; cp < checkPages; cp++) {
        if (!isOcrPage(cp)) { nonOcrCount++; nonOcrPages.push(cp + 1); }
    }

    var doScan = true;
    if (nonOcrCount > Math.floor(checkPages / 2)) {
        var warnMsg = "⚠️ OCR 品質警告\n\n"
            + "掃描前 " + checkPages + " 頁中，有 " + nonOcrCount + " 頁疑似為純圖像頁面。\n"
            + "建議先對文件執行「識別文字」後再掃描。\n\n"
            + "【是】→ 繼續掃描全部 " + totalPages + " 頁\n"
            + "【否】→ 中斷掃描";
        var warnResponse = app.alert({cMsg: warnMsg, nIcon: 1, nType: 2, cTitle: "OCR 品質警告"});
        if (warnResponse !== 4) {
            doScan = false;
            console.println("⛔ 使用者選擇中斷掃描。");
        }
    }

    // ── 工具函式 ────────────────────────────────────────────────
    var extractDate = function(zone) {
        var m = reDateYMD1.exec(zone);
        if (m) {
            var y  = m[1].length > 3 ? m[1].substring(0, 3) : m[1];
            var mo = m[2].length > 2 ? m[2].substring(0, 2) : m[2];
            var d  = m[3].length > 2 ? m[3].substring(0, 2) : m[3];
            if (mo.length === 1) mo = "0" + mo;
            if (d.length  === 1) d  = "0" + d;
            return [y, mo, d];
        }
        m = reDateSlash1.exec(zone);
        if (m) return [m[1], m[2].length===1?"0"+m[2]:m[2], m[3].length===1?"0"+m[3]:m[3]];
        m = reDateDot1.exec(zone);
        if (m) return [m[1], m[2].length===1?"0"+m[2]:m[2], m[3].length===1?"0"+m[3]:m[3]];
        return null;
    };

    var findDateGlobal = function(text) {
        reDateYMDg.lastIndex = 0;
        var m;
        while ((m = reDateYMDg.exec(text)) !== null) {
            var y = m[1].length > 3 ? m[1].substring(0, 3) : m[1];
            if (parseInt(y) >= 100) {
                var mo = m[2].length > 2 ? m[2].substring(0, 2) : m[2];
                var d  = m[3].length > 2 ? m[3].substring(0, 2) : m[3];
                if (mo.length === 1) mo = "0" + mo;
                if (d.length  === 1) d  = "0" + d;
                return [y, mo, d];
            }
        }
        reDateSlashg.lastIndex = 0;
        while ((m = reDateSlashg.exec(text)) !== null) {
            if (parseInt(m[1]) >= 100)
                return [m[1], m[2].length===1?"0"+m[2]:m[2], m[3].length===1?"0"+m[3]:m[3]];
        }
        return null;
    };

    var trimName = function(name) {
        var i = name.indexOf("民國");
        if (i !== -1) name = name.substring(0, i);
        return name.replace(reTailCut, "");
    };

    var matchNMinusOne = function(ct, keywords) {
        var hit = 0;
        var need = keywords.length - 1;
        for (var i = 0; i < keywords.length; i++) {
            if (ct.indexOf(keywords[i]) !== -1) hit++;
            if (hit >= need) return true;
        }
        return false;
    };

    var extractTrafficName = function(ct, prefix) {
        var idx = ct.indexOf(prefix);
        if (idx === -1) return null;
        var after = ct.substring(idx + prefix.length).replace(/^[:：\s　]+/, "");
        var nmCh = reChName.exec(after);
        if (nmCh && nmCh[0].length >= 2) return nmCh[0];
        var nmEn = reEnName.exec(after);
        if (nmEn) {
            var en = nmEn[0].replace(/\s+$/, "");
            if (en.length >= 2) return en;
        }
        return null;
    };

    var extractPhotoName = function(ct) {
        var patterns = ["姓名：", "姓名:"];
        for (var pi = 0; pi < patterns.length; pi++) {
            var idx = ct.indexOf(patterns[pi]);
            if (idx === -1) continue;
            var after = ct.substring(idx + patterns[pi].length);
            var nm = reChName.exec(after);
            if (nm && nm[0].length >= 2) return nm[0];
        }
        var idIdx = ct.indexOf("身分證號");
        if (idIdx > 0) {
            var before = ct.substring(Math.max(0, idIdx - 20), idIdx);
            var nm2 = /[\u4e00-\u9fa5]{2,5}$/.exec(before);
            if (nm2 && nm2[0].length >= 2) return nm2[0];
        }
        return null;
    };

    var extractMedLegalNo = function(ct) {
        var idx = ct.indexOf("醫鑑字");
        if (idx === -1) return null;
        var before6 = ct.substring(Math.max(0, idx - 6), idx);
        var yearMatch = before6.match(/\d+/);
        var year = yearMatch ? yearMatch[yearMatch.length - 1] : "";
        var after = ct.substring(idx + 3);
        var noEnd = after.indexOf("號");
        if (noEnd === -1) noEnd = 20;
        var noZone = after.substring(0, noEnd);
        var noMatch = noZone.match(/\d+/);
        var no = noMatch ? noMatch[0] : "";
        if (year && no) return year + "醫鑑字" + no + "號";
        if (no) return "醫鑑字" + no + "號";
        return null;
    };

    var extractDiagName = function(ct) {
        var patterns = ["姓名", "姓　名", "姓  名"];
        for (var pi = 0; pi < patterns.length; pi++) {
            var idx = ct.indexOf(patterns[pi]);
            if (idx === -1) continue;
            var after = ct.substring(idx + patterns[pi].length).replace(/^[:：\s　]+/, "");
            var nmCh = reChName.exec(after);
            if (nmCh && nmCh[0].length >= 2) {
                return nmCh[0].replace(reTailCut, "");
            }
            var nmEn = reEnName.exec(after);
            if (nmEn) {
                var en = nmEn[0].replace(/\s+$/, "");
                if (en.length >= 2) return en;
            }
        }
        return null;
    };

    var extractTrafficTalkName = function(ct) {
        var prefixes = ["當事人", "姓名"];
        for (var pi = 0; pi < prefixes.length; pi++) {
            var idx = ct.indexOf(prefixes[pi]);
            if (idx === -1) continue;
            var after = ct.substring(idx + prefixes[pi].length).replace(/^[:：\s　]+/, "");
            var nmCh = reChName.exec(after);
            if (nmCh && nmCh[0].length >= 2) {
                var cand = nmCh[0].replace(reTailCut, "");
                if (cand.length >= 2 && !reNameIgnore.test(cand)) return cand;
            }
            var nmEn = reEnName.exec(after);
            if (nmEn) {
                var en = nmEn[0].replace(/\s+$/, "");
                if (en.length >= 2) return en;
            }
        }
        return null;
    };

    var extractNameByLabel = function(ct, label) {
        var idx = ct.indexOf(label);
        if (idx === -1) return null;
        var after = ct.substring(idx + label.length).replace(/^[:：\s　]+/, "");
        var nmCh = reChName.exec(after);
        if (nmCh && nmCh[0].length >= 2) {
            var cand = nmCh[0].replace(reTailCut, "");
            if (cand.length >= 2 && !reNameIgnore.test(cand)) return cand;
        }
        var nmEn = reEnName.exec(after);
        if (nmEn) {
            var en = nmEn[0].replace(/\s+$/, "");
            if (en.length >= 2) return en;
        }
        return null;
    };

    var detectDefenseDocName = function(ct) {
        var candidates = ["刑事辯護意旨狀", "刑事答辯狀", "辯護意旨狀", "答辯狀"];
        for (var i = 0; i < candidates.length; i++) {
            if (ct.indexOf(candidates[i]) !== -1) return candidates[i];
        }
        return null;
    };

    // ── 非供述證據 辨識邏輯 ──────────────────────────────────────────────
    var classifyDoc = function(ct) {
        var _memo = {};
        var has = function(kw) {
            if (_memo[kw] === undefined) _memo[kw] = ct.indexOf(kw) !== -1;
            return _memo[kw];
        };

        var hasQDoc = (has("問：") || has("問:"));
        var hasADoc = (has("答：") || has("答:"));
        if (hasQDoc && hasADoc) return {type: "SKIP"};

        var photoNumMatch = ct.match(/照片編號[^\d]{0,3}(\d+)/);
        if (photoNumMatch) {
            var pNum = parseInt(photoNumMatch[1], 10);
            if (pNum > 1) return {type: "SKIP"};
        }

        if (has("照片黏貼紀錄表") && (has("交通事故") || has("交貧事故") || has("事故") || has("車損"))) {
            if (!trafficPhotoAdded && matchNMinusOne(ct, ["攝影時間", "照片編號"])) {
                return {type: "道路交通事故照片黏貼紀錄表", base: "道路交通事故照片黏貼紀錄表"};
            }
            return {type: "SKIP"};
        }

        if (has("照片黏貼紀錄表")) {
            var isFirstPhotoPage = /照片編號[:：]*0?1(?!\d)/.test(ct);
            if (!casePhotoAdded || isFirstPhotoPage) {
                return {type: "照片黏貼紀錄表", base: "照片黏貼紀錄表"};
            }
            return {type: "SKIP"};
        }

        if (has("刑案現場勘察報告") && matchNMinusOne(ct, ["勘察目的", "案件編號", "勘察時間", "勘察人員"])) {
            return {type: "刑案現場勘察報告", base: "刑案現場勘察報告"};
        }

        var defDocName = detectDefenseDocName(ct);
        if (defDocName !== null && matchNMinusOne(ct, ["案號", "股別", "被告"]) && !has("偵查卷宗") && !has("分案日期")) {
            var defName = extractNameByLabel(ct, "被告");
            var defTitle = defName ? defName + defDocName : defDocName;
            return {type: defTitle, base: "答辯狀類"};
        }

        if (matchNMinusOne(ct, ["刑事告訴狀", "案號", "承辦股別", "告訴人"])) {
            var compName = extractNameByLabel(ct, "告訴人");
            var compTitle = compName ? "刑事告訴狀-告訴人" + compName : "刑事告訴狀";
            return {type: compTitle, base: "刑事告訴狀"};
        }

        if (matchNMinusOne(ct, ["警示(詐騙)帳戶", "被害人受騙款項", "165專線", "聯防機制"])) {
            return {type: "受理詐騙帳戶通報警示簡便格式表", base: "受理詐騙帳戶通報警示簡便格式表"};
        }

        if (has("成人保護案件通報表") && matchNMinusOne(ct, ["歸檔案號", "通報單位", "受保護", "通報時間"])) {
            return {type: "成人保護案件通報表", base: "成人保護案件通報表"};
        }

        if (has("相驗屍體證明書") && matchNMinusOne(ct, ["死亡時間", "死亡地點", "死亡方式", "死亡原因"])) {
            var corpName = extractDiagName(ct);
            var corpTitle = corpName ? corpName + "相驗屍體證明書" : "相驗屍體證明書";
            return {type: corpTitle, base: "相驗屍體證明書"};
        }

        // 🚀 V9.9.30 修復：抗 OCR 亂碼匯款單盾牌
        var c1 = (has("身分證") || has("統一編號") || has("紐證")) ? 1 : 0;
        var c2 = has("帳號") ? 1 : 0;
        var c3 = (has("支出") || has("支出金額")) ? 1 : 0;
        var c4 = (has("存入") || has("存人") || has("金額")) ? 1 : 0;
        if ((c1 + c2 + c3 + c4) >= 3) {
            // 加入表單專屬文字與錯字相容，徹底阻擋匯款單
            if (has("收執聯") || has("執據聯") || has("匯款申請書") || has("匯款申") || has("無摺存款") || has("入戶匯款") || has("匯款種類") || has("匯款金額") || has("國內匯款")) {
                return {type: "SKIP"}; 
            }
            return {type: "金融機構交易明細表", base: "金融機構交易明細表"};
        }

        if (matchNMinusOne(ct, ["行車事故鑑定委員會", "囑託機關", "肇事經過", "肇事分析"])) return {type: "行車事故鑑定委員會鑑定意見書", base: "行車事故鑑定委員會鑑定意見書"};
        if (matchNMinusOne(ct, ["駕籍詳細資料報表", "列印單位", "駕駛人基本資料"])) return {type: "駕籍詳細資料報表", base: "駕籍詳細資料報表"};
        if (matchNMinusOne(ct, ["車輛詳細資料報表", "列印單位", "車輛基本資料"])) return {type: "車輛詳細資料報表", base: "車輛詳細資料報表"};
        if (matchNMinusOne(ct, ["搜索筆錄", "扣押筆錄", "執行時間", "執行處所"]) && !has("犯罪事實")) return {type: "搜索扣押筆錄", base: "搜索扣押筆錄"};
        if (matchNMinusOne(ct, ["扣押物品目錄表", "品名", "單位"]) && !has("犯罪事實")) return {type: "扣押物品目錄表", base: "扣押物品目錄表"};
        if (matchNMinusOne(ct, ["自願受搜索同意書", "出於自願", "同意接受"]) && !has("犯罪事實")) return {type: "自願受搜索同意書", base: "自願受搜索同意書"};
        if (matchNMinusOne(ct, ["鑑定許可書", "鑑定人", "受鑑定人"])) return {type: "鑑定許可書", base: "鑑定許可書"};
        if (matchNMinusOne(ct, ["自願受採尿同意書", "出於自願", "特立此同意書"])) return {type: "自願受採尿同意書", base: "自願受採尿同意書"};
        if (matchNMinusOne(ct, ["尿液代號與真實姓名對照表", "代號", "採驗時間"])) return {type: "尿液代號與真實姓名對照表", base: "尿液代號與真實姓名對照表"};
        if (!photoAdded && matchNMinusOne(ct, ["攝影時間", "攝影人", "說明"])) return {type: "刑事案件照片", base: "刑事案件照片"};

        if (!has("通聯紀錄")) {
            var hasPhotoTitle = has("相片影像資料查詢結果");
            var hasPhotoShort = has("相片影像");
            var hasIdNum      = has("身分證號");
            var hasPersonName = has("姓名");
            if ((hasPhotoTitle && hasIdNum) || (hasPhotoShort && hasIdNum && hasPersonName)) {
                var pName = extractPhotoName(ct);
                var pTitle = pName ? pName + "相片影像資料查詢結果" : "相片影像資料查詢結果";
                return {type: pTitle, base: "相片影像資料查詢結果"};
            }
        }

        if (matchNMinusOne(ct, ["法務部調查局濫用藥物實驗室鑑定書", "送驗資料", "送驗項目"])) return {type: "法務部調查局濫用藥物實驗室鑑定書", base: "法務部調查局濫用藥物實驗室鑑定書"};

        if (matchNMinusOne(ct, ["法醫研究所", "解剖報告書", "鑑定報告書", "醫鑑字"])) {
            var medNo = extractMedLegalNo(ct);
            var medTitle = medNo ? "法醫研究所" + medNo + "解剖暨鑑定報告" : "法醫研究所解剖暨鑑定報告";
            return {type: medTitle, base: "法醫研究所解剖暨鑑定報告"};
        }

        if (matchNMinusOne(ct, ["刑事警察局鑑定書", "發文日期", "發文字號", "鑑定結果"])) return {type: "內政部警政署刑事警察局鑑定書", base: "內政部警政署刑事警察局鑑定書"};
        if (!seizurePhotoAdded && matchNMinusOne(ct, ["扣押物品照片", "移送單位", "編號"])) return {type: "扣押物品照片", base: "扣押物品照片"};
        if (!bankDetailAdded && has("存款交易明細") && matchNMinusOne(ct, ["列印日期", "查詢起日", "頁次"])) return {type: "存款交易明細", base: "存款交易明細"};
        if (!bankTxAdded && has("客戶存款往來交易明細表") && matchNMinusOne(ct, ["帳號", "交易時間"])) return {type: "客戶存款往來交易明細表", base: "客戶存款往來交易明細表"};

        if (has("診斷證明書") && !has("相驗屍體證明書") && !has("通報表") && !has("護理評估表") && !has("病歷號") && !has("病程紀錄") && !has("護理紀錄") && matchNMinusOne(ct, ["醫院", "姓名", "性別"])) {
            var diagName = extractDiagName(ct);
            var diagTitle = diagName ? diagName + "診斷證明書" : "診斷證明書";
            return {type: diagTitle, base: "診斷證明書"};
        }

        if (!trafficRptAdded && has("調查報告表") && (has("（一）") || has("(一)") || has("道路型態")) && matchNMinusOne(ct, ["發生時間", "道路型態"])) return {type: "道路交通事故調查報告表", base: "道路交通事故調查報告表"};
        if (!trafficRpt2Added && has("調查報告表") && (has("（二）") || has("(二)")) && matchNMinusOne(ct, ["當事者姓名", "受傷程度"])) return {type: "道路交通事故調查報告表(二)", base: "道路交通事故調查報告表(二)"};

        if (has("道路交通事故當事人酒精測定紀錄表") && matchNMinusOne(ct, ["受測人姓名", "測定時間"])) {
            var alcName = extractTrafficName(ct, "受測人姓名");
            var alcTitle = alcName ? alcName + "酒精測定紀錄表" : "酒精測定紀錄表";
            return {type: alcTitle, base: "酒精測定紀錄表"};
        }

        if (has("道路交通事故肇事人自首情形紀錄表") && matchNMinusOne(ct, ["適用本表當事人姓名", "自首情形"])) {
            var hitName = extractTrafficName(ct, "適用本表當事人姓名");
            var hitTitle = hitName ? hitName + "肇事人自首情形紀錄表" : "肇事人自首情形紀錄表";
            return {type: hitTitle, base: "肇事人自首情形紀錄表"};
        }

        if (matchNMinusOne(ct, ["初步分析研判表", "肇事時間", "肇事地點", "車牌號碼"])) return {type: "道路交通事故初步分析研判表", base: "道路交通事故初步分析研判表"};
        if (matchNMinusOne(ct, ["道路交通事故現場圖", "處理編號", "現場處理摘要", "發生時間"])) return {type: "道路交通事故現場圖", base: "道路交通事故現場圖"};

        return null;
    };

    // ── 供述證據 辨識邏輯 ──────────────────────────────────────────────
    var classifyPage = function(ct) {
        if ((ct.indexOf("道路交通事故談話紀錄表") !== -1 && ct.indexOf("肇事車種") !== -1) || matchNMinusOne(ct, ["詢問人", "當時天候", "駕駛執照", "有無飲酒", "保險證"])) {
            var talkName = extractTrafficTalkName(ct);
            var talkDateStr = "";
            var talkDateIdx = ct.indexOf("詢問日期");
            if (talkDateIdx === -1) talkDateIdx = ct.indexOf("製作日期");
            var talkDateZone = talkDateIdx !== -1 ? ct.substring(talkDateIdx, talkDateIdx + 150) : ct.substring(0, 300);
            var talkDateParts = extractDate(talkDateZone);
            if (talkDateParts && parseInt(talkDateParts[0]) >= 100) {
                talkDateStr = talkDateParts[0] + talkDateParts[1] + talkDateParts[2];
            } else {
                talkDateParts = findDateGlobal(ct);
                if (talkDateParts) talkDateStr = talkDateParts[0] + talkDateParts[1] + talkDateParts[2];
            }
            var talkTitle = (talkName ? talkName : "") + (talkDateStr ? talkDateStr : "") + "道路交通事故談話紀錄表";
            return {type: "交通事故談話紀錄表", customTitle: talkTitle, witness: false, detention: false};
        }

        var hasStaff   = ct.indexOf("出席職員如下") !== -1;
        var hasDefAns  = ct.indexOf("被告答") !== -1;
        var hasWitAns  = ct.indexOf("證人答") !== -1;
        var hasIdCard  = ct.indexOf("國民身分證") !== -1;
        var hasRelAns  = ct.indexOf("關係人答") !== -1;
        var hasCompAns = ct.indexOf("告訴人答") !== -1;
        var hasProQ    = ct.indexOf("檢察官問姓名") !== -1;
        var hasProQOff = ct.indexOf("檢察事務官問姓名") !== -1;
        var hasPrepare = ct.indexOf("準備程序筆錄") !== -1;
        var hasJudge   = ct.indexOf("審判筆錄") !== -1;
        
        var hasEconomy = ct.indexOf("經濟狀況") !== -1;
        var hasInqRec  = ct.indexOf("訊問筆錄") !== -1;
        var hasInvRec  = ct.indexOf("調查筆錄") !== -1;
        var hasPolice  = ct.indexOf("詢問筆錄") !== -1 || ct.indexOf("警詢") !== -1;
        var hasSuspect = ct.indexOf("受詢") !== -1 || ct.indexOf("詢問") !== -1;
        var hasPoliceId = hasIdCard && hasSuspect;

        var hasABInv = ct.indexOf("法務部調查局") !== -1 || ct.indexOf("調查處") !== -1 || ct.indexOf("機動工作站") !== -1;
        if (hasABInv && (hasEconomy || hasPoliceId) && hasInvRec) return {type: "調查筆錄", witness: false, detention: false};

        var hasACInv = ct.indexOf("廉政署") !== -1 || ct.indexOf("肅貪組") !== -1 || ct.indexOf("北部地區調查組") !== -1 || ct.indexOf("中部地區調查組") !== -1 || ct.indexOf("南部地區調查組") !== -1;
        if (hasACInv && (hasEconomy || hasPoliceId) && hasInvRec) return {type: "廉詢筆錄", witness: false, detention: false};

        if (hasInqRec && hasWitAns && hasIdCard) return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasStaff && hasDefAns && hasWitAns && hasIdCard) return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasPrepare && hasStaff && hasDefAns) return {type: "準備程序筆錄", witness: false, detention: true};
        if (hasJudge && ct.indexOf("準備程序") === -1 && hasStaff && hasDefAns) return {type: "審判筆錄", witness: false, detention: true};
        if (hasStaff && (hasDefAns || hasRelAns || hasCompAns) && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasStaff && (hasProQ || hasProQOff)) return {type: "偵訊筆錄", witness: false, detention: true};
        if ((hasProQ || hasProQOff) && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        
        if ((hasEconomy || hasPoliceId) && (hasInvRec || hasPolice)) {
            return {type: "警詢筆錄", witness: false, detention: false};
        }

        return null;
    };

    var extractName = function(ct, isDetention) {
        var namePrefixes = [
            "受詢問人姓名", "受詢姓名", "詢問人姓名", "被告姓名",
            "告訴人答", "關係人答", "受詢問人", "受姓名",
            "被告答", "姓名", "被告", "詢問人"
        ];
        for (var pi = 0; pi < namePrefixes.length; pi++) {
            var idx = ct.indexOf(namePrefixes[pi]);
            if (idx === -1) continue;
            var after = ct.substring(idx + namePrefixes[pi].length);
            if (after.length > 0 && (after.charAt(0) === ":" || after.charAt(0) === "："))
                after = after.substring(1);
            var j = 0;
            while (j < after.length) {
                var code = after.charCodeAt(j);
                if (code >= 0x4e00 && code <= 0x9fa5) break;
                if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) break;
                j++;
            }
            after = after.substring(j);
            var nm = reChName.exec(after);
            if (nm) {
                var cand = trimName(nm[0]);
                if (cand.length >= 2 && !reNameIgnore.test(cand)) return cand;
            }
            var nmEn = reEnName.exec(after);
            if (nmEn) {
                var enName = nmEn[0].replace(/\s+$/, "");
                if (enName.length >= 2) return enName;
            }
        }
        if (isDetention) {
            var seps = ["««", "---", "___"];
            for (var si = 0; si < seps.length; si++) {
                var sepIdx = ct.indexOf(seps[si]);
                if (sepIdx === -1) continue;
                var a2 = ct.substring(sepIdx);
                var j2 = 0;
                while (j2 < a2.length) {
                    var code2 = a2.charCodeAt(j2);
                    if (code2 >= 0x4e00 && code2 <= 0x9fa5) break;
                    j2++;
                }
                a2 = a2.substring(j2);
                var nm2 = reChName.exec(a2);
                if (nm2) {
                    var c2 = trimName(nm2[0]);
                    if (c2.length >= 2) return c2;
                }
            }
            var ai = ct.indexOf("答"), cnt = 0;
            while (ai !== -1 && cnt < 10) {
                var aa = ct.substring(ai + 1);
                var j3 = 0;
                while (j3 < aa.length) {
                    var code3 = aa.charCodeAt(j3);
                    if (code3 >= 0x4e00 && code3 <= 0x9fa5) break;
                    j3++;
                }
                aa = aa.substring(j3);
                var nm3 = reChName4.exec(aa);
                if (nm3 && !reSkipAns.test(nm3[0])) {
                    var c3 = nm3[0].replace(reTailCut, "");
                    if (c3.length >= 2) return c3;
                }
                ai = ct.indexOf("答", ai + 1);
                cnt++;
            }
        }
        return null;
    };

    var parseStatementKey = function(title) {
        var typeOrder = 5;
        if (title.indexOf("警詢筆錄") !== -1 || title.indexOf("調查筆錄") !== -1 || title.indexOf("廉詢筆錄") !== -1) typeOrder = 1;
        else if (title.indexOf("偵訊筆錄") !== -1) typeOrder = 2;
        else if (title.indexOf("準備程序") !== -1) typeOrder = 3;
        else if (title.indexOf("審判筆錄") !== -1) typeOrder = 4;

        var dateMatch = title.match(/(\d{7})/);
        var dateNum = dateMatch ? parseInt(dateMatch[1]) : 9999999;
        var nameMatch = title.match(/^([\u4e00-\u9fa5A-Za-z]+)/);
        var name = nameMatch ? nameMatch[1] : "";
        return {name: name, dateNum: dateNum, typeOrder: typeOrder};
    };

    var sortStatementList = function(list) {
        var firstAppear = {};
        for (var i = 0; i < list.length; i++) {
            var key = parseStatementKey(list[i].title);
            var nm = key.name;
            if (nm === "") nm = "__unknown__";
            if (firstAppear[nm] === undefined) firstAppear[nm] = list[i].page;
        }

        for (var i = 1; i < list.length; i++) {
            var item = list[i];
            var keyI = parseStatementKey(item.title);
            var nmI = keyI.name === "" ? "__unknown__" : keyI.name;
            var firstI = firstAppear[nmI];
            var j = i - 1;
            while (j >= 0) {
                var keyJ = parseStatementKey(list[j].title);
                var nmJ = keyJ.name === "" ? "__unknown__" : keyJ.name;
                var firstJ = firstAppear[nmJ];
                var greater = false;
                if (firstJ > firstI) greater = true;
                else if (firstJ === firstI && nmJ > nmI) greater = true;
                else if (firstJ === firstI && nmJ === nmI && keyJ.dateNum > keyI.dateNum) greater = true;
                else if (firstJ === firstI && nmJ === nmI && keyJ.dateNum === keyI.dateNum && keyJ.typeOrder > keyI.typeOrder) greater = true;
                if (greater) { list[j + 1] = list[j]; j--; }
                else break;
            }
            list[j + 1] = item;
        }
        return list;
    };

    var deduplicateStatementList = function(list) {
        var nameCount = {};
        var dupNames = [];
        for (var i = 0; i < list.length; i++) {
            var t = list[i].title;
            if (nameCount[t] === undefined) nameCount[t] = 0;
            nameCount[t]++;
        }
        for (var t in nameCount) {
            if (nameCount[t] > 1) dupNames.push(t);
        }
        var nameIdx = {};
        for (var i = 0; i < list.length; i++) {
            var t = list[i].title;
            if (nameCount[t] > 1) {
                if (nameIdx[t] === undefined) nameIdx[t] = 1;
                list[i].title = t + nameIdx[t];
                list[i].isDup = true;
                nameIdx[t]++;
            }
        }
        return {list: list, dupNames: dupNames};
    };

    // ── 主執行迴圈 ──────────────────────────────────────────────
    if (doScan) {
        var logEvery = Math.max(10, Math.floor(totalPages * 0.05));

        for (var p = 0; p < totalPages; p++) {
            if (p > 0 && p % logEvery === 0) {
                var pct = Math.floor(p / totalPages * 100);
                console.println("⏳ 進度：" + pct + "% (" + p + "/" + totalPages + " 頁)");
            }

            var quickStr = getPageTextFast(p);
            if (quickStr === "" || !reRough.test(quickStr)) continue;

            var ct = (pageCache[p] && pageCache[p].text !== undefined)
                ? pageCache[p].text : getPageText(p);

            if (ct.indexOf("核被告所為") !== -1 || ct.indexOf("刑事訴訟法") !== -1 || ct.indexOf("處刑書") !== -1 || ct.indexOf("起訴書") !== -1) continue;
            if (ct.indexOf("犯罪事實") !== -1 && (ct.indexOf("移送偵辦") !== -1 || ct.indexOf("分敘如下") !== -1)) continue;
            if (ct.indexOf("職務報告") !== -1 || ct.indexOf("刑事案件報告書") !== -1) continue;
            if (ct.indexOf("偵查卷宗") !== -1 || ct.indexOf("分案日期") !== -1) continue;

            var cls = classifyPage(ct);

            if (cls) {
                var isWitness   = cls.witness;
                var isDetention = cls.detention;
                var recordType  = cls.type;
                var dateStr = "未知日期";
                var parts   = null;

                if (isDetention) {
                    var titleKws = ["準備程序筆錄", "審判筆錄", "訊問筆錄"];
                    var si = -1;
                    for (var ti = 0; ti < titleKws.length; ti++) {
                        var tidx = ct.indexOf(titleKws[ti]);
                        if (tidx !== -1) { si = tidx; break; }
                    }
                    var ei = ct.indexOf("出席職員如下");
                    var dz = (si !== -1 && ei !== -1 && ei > si) ? ct.substring(si, ei)
                           : (ei !== -1 ? ct.substring(0, ei) : ct.substring(0, 200));
                    parts = extractDate(dz);
                    if (parts) dateStr = parts[0] + parts[1] + parts[2];
                } else {
                    var ai2 = ct.indexOf("詢問時間");
                    if (ai2 === -1) ai2 = ct.indexOf("詢時間");
                    if (ai2 === -1) ai2 = ct.indexOf("詢問日期");
                    if (ai2 === -1) ai2 = ct.indexOf("訊問日期");
                    var dz2 = ai2 !== -1 ? ct.substring(ai2, ai2 + 150) : ct.substring(0, 300);
                    parts = extractDate(dz2);
                    if (parts && parseInt(parts[0]) >= 100) {
                        dateStr = parts[0] + parts[1] + parts[2];
                    } else {
                        parts = findDateGlobal(ct);
                        if (parts) dateStr = parts[0] + parts[1] + parts[2];
                    }
                }

                var title = "";
                if (cls.customTitle) {
                    title = cls.customTitle;
                } else if (isWitness) {
                    var wNames = [], sf = 0;
                    while (true) {
                        var wi = ct.indexOf("證人答", sf);
                        if (wi === -1) break;
                        var aw = ct.substring(wi + 3);
                        if (aw.length > 0 && (aw.charAt(0) === ":" || aw.charAt(0) === "："))
                            aw = aw.substring(1);
                        var nw = reChName.exec(aw);
                        if (nw) {
                            var cw = trimName(nw[0]);
                            if (!reWitNotName.test(cw) && cw.length >= 2) {
                                var dup = false;
                                for (var di = 0; di < wNames.length; di++) {
                                    if (wNames[di] === cw) { dup = true; break; }
                                }
                                if (!dup) wNames.push(cw);
                            }
                        }
                        sf = wi + 3;
                    }
                    var rep = wNames.length > 0 ? wNames[wNames.length - 1] : null;
                    if (rep) {
                        title = wNames.length === 1
                            ? "證人" + rep + dateStr + recordType
                            : "證人" + rep + "等" + wNames.length + "人" + dateStr + recordType;
                    } else {
                        title = "證人未知" + dateStr + recordType;
                    }
                } else {
                    var nr = extractName(ct, isDetention);
                    title = (nr ? nr : "未知對象") + dateStr + recordType;
                }

                statementList.push({title: title, page: p, isDup: false});
                console.println("   📝 供述: " + title + " (第 " + (p + 1) + " 頁)");

            } else {
                var docResult = classifyDoc(ct);
                if (docResult) {
                    if (docResult.type === "SKIP") continue;

                    var finalTitle;
                    var base = docResult.base;

                    if (base === "金融機構交易明細表") {
                        if (p <= lastFinStatementPage + 3 && lastFinStatementPage >= 0) {
                            lastFinStatementPage = p;
                            continue;
                        } else {
                            lastFinStatementPage = p;
                            finalTitle = getBookmarkTitle(docResult.type);
                        }
                    } else if (base === "答辯狀類" || base === "刑事告訴狀" || base === "相驗屍體證明書" || base === "成人保護案件通報表" || base === "刑案現場勘察報告") {
                        finalTitle = getBookmarkTitle(docResult.type);
                    } else if (base === "刑事案件照片") {
                        photoAdded = true; finalTitle = "刑事案件照片";
                    } else if (base === "扣押物品照片") {
                        seizurePhotoAdded = true; finalTitle = "扣押物品照片";
                    } else if (base === "存款交易明細") {
                        bankDetailAdded = true; finalTitle = "存款交易明細";
                    } else if (base === "客戶存款往來交易明細表") {
                        bankTxAdded = true; finalTitle = "客戶存款往來交易明細表";
                    } else if (base === "道路交通事故調查報告表") {
                        trafficRptAdded = true; finalTitle = "道路交通事故調查報告表";
                    } else if (base === "道路交通事故調查報告表(二)") {
                        trafficRpt2Added = true; finalTitle = "道路交通事故調查報告表(二)";
                    } else if (base === "道路交通事故照片黏貼紀錄表") {
                        trafficPhotoAdded = true; finalTitle = "道路交通事故照片黏貼紀錄表";
                    } else if (base === "照片黏貼紀錄表") {
                        casePhotoAdded = true; finalTitle = getBookmarkTitle(docResult.type);
                    } else {
                        finalTitle = getBookmarkTitle(docResult.type);
                    }

                    docList.push({title: finalTitle, page: p});
                    console.println("   📁 非供述: " + finalTitle + " (第 " + (p + 1) + " 頁)");
                }
            }
        }

        // ── 建立書籤與整理 ──────────────────────────────────────
        statementList = sortStatementList(statementList);
        var dedupResult = deduplicateStatementList(statementList);
        statementList = dedupResult.list;
        var dupNames = dedupResult.dupNames;

        var totalFound = statementList.length + docList.length;
        console.println("─────────────────────────────────");
        console.println("✔ 掃描完畢：供述證據 " + statementList.length + " 份，非供述證據 " + docList.length + " 份。");

        if (totalFound > 0) {
            var rootBkmk = doc.bookmarkRoot;
            rootBkmk.createChild("📋 智慧書籤清單", "this.pageNum = 0");
            var masterParent = rootBkmk;
            var rootChildren = rootBkmk.children;
            if (rootChildren != null) {
                for (var j = 0; j < rootChildren.length; j++) {
                    if (rootChildren[j].name === "📋 智慧書籤清單") { masterParent = rootChildren[j]; break; }
                }
            }

            if (docList.length > 0) {
                masterParent.createChild("📁 非供述證據", "this.pageNum = " + docList[0].page);
                var docParent = masterParent;
                var mc2 = masterParent.children;
                if (mc2 != null) {
                    for (var j = 0; j < mc2.length; j++) {
                        if (mc2[j].name === "📁 非供述證據") { docParent = mc2[j]; break; }
                    }
                }
                for (var i = docList.length - 1; i >= 0; i--)
                    docParent.createChild(docList[i].title, "this.pageNum = " + docList[i].page);
            }

            if (statementList.length > 0) {
                masterParent.createChild("📝 供述證據", "this.pageNum = " + statementList[0].page);
                var stmtParent = masterParent;
                var mc1 = masterParent.children;
                if (mc1 != null) {
                    for (var j = 0; j < mc1.length; j++) {
                        if (mc1[j].name === "📝 供述證據") { stmtParent = mc1[j]; break; }
                    }
                }
                for (var i = statementList.length - 1; i >= 0; i--)
                    stmtParent.createChild(statementList[i].title, "this.pageNum = " + statementList[i].page);
            }

            // ── 自動存檔 ──────────────────────────────
            var saveOk = false;
            try {
                app.execMenuItem("Save");
                saveOk = true;
                console.println("💾 自動存檔完成：" + doc.path);
            } catch(e1) {
                try {
                    doc.saveAs({cPath: doc.path});
                    saveOk = true;
                    console.println("💾 備援存檔完成：" + doc.path);
                } catch(e2) {
                    console.println("⚠️ 存檔失敗：" + e2);
                }
            }

            // ── 提示視窗 ──────────────────────────────
            var finalMsg = "✅ 書籤建立完成！\n\n"
                + "書籤結構：\n"
                + "📋 智慧書籤清單\n"
                + "  ├ 📝 供述證據（" + statementList.length + " 份）\n"
                + "  └ 📁 非供述證據（" + docList.length + " 份）\n";
            if (dupNames.length > 0) {
                finalMsg += "\n⚠️ 同名書籤已自動編號，請確認是否為不同證據資料：\n";
                for (var i = 0; i < dupNames.length; i++) finalMsg += "  · " + dupNames[i] + "\n";
            }
            finalMsg += "\n" + (saveOk ? "💾 已自動存檔至原路徑。" : "⚠️ 自動存檔失敗，請手動按 Ctrl+S 存檔。");

            app.alert({cMsg: finalMsg, nIcon: 3, nType: 0, cTitle: "✅ SmartMark Pro 完成"});
        } else {
            app.alert({cMsg: "掃描完成，未發現符合特徵的文件頁面。", nIcon: 3, nType: 0, cTitle: "SmartMark Pro 完成"});
        }
    }
}).call(this);
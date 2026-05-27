// ==========================================================================
// SmartMark Pro 刑案電子卷證：智慧書籤建立器 
// (V10.4 - 供述姓名精準修正版)
// 修復：通用浮水印清除、供述姓名欄位尾碼清理、遠距/通譯頁姓名誤抓防禦
// This script was designed by Prosecutor Chen Le-Wei and optimized by AI.
// ==========================================================================

(function() {
    var doc = this;
    if (!doc || !doc.numPages) {
        app.alert({cMsg: "請先開啟一份 PDF 卷證檔案！", nIcon: 0, nType: 0, cTitle: "錯誤"});
        return;
    }

    var totalPages = doc.numPages;
    var statementList = [];
    var docList = [];

    console.clear();
    console.println("🚀 SmartMark Pro V10.4 (供述姓名精準修正版) 啟動中...");
    console.println("📄 總頁數：" + totalPages + " 頁");
    console.println("⏳ 系統已鎖定民國100～129年之3位數日期，並優先以筆錄日期欄位判斷...");
    console.println("─────────────────────────────────");

    // ── 核心資安防禦：定義污染源浮水印字串 ──
    var targetWatermark = "=*M*T*E*1*M*D*U*y*N*j*E*x*M*z*Y*z*M*G*N*s*c*m*4*x*N*z*I*u*M*z*A*u*M*S*4*y*M*j*I*=@";

    // ── 預編譯 RegExp (全部優化為字面量宣告，確保在沙盒中無語法轉義坑) ──
    var reRough = /筆錄|調查|偵訊|警詢|詢問|審判|準備程序|出席職員|偵查庭|檢察官問|搜索|扣押|鑑定|採尿|攝影時間|相片影像|解剖|醫鑑字|送驗資料|刑事警察局|廉政署|肅貪組|調查局|調查處|機動工作站|存款交易明細|往來交易明細|診斷證明書|扣押物品照片|酒精測定|交通事故|肇事人自首|醫院|照片黏貼紀錄表|初步分析研判表|現場圖|談話紀錄表|當時天候|有無飲酒|鑑定意見書|駕籍詳細|車輛詳細|職務報告|身分證統一編號|支出金額|存入金額|帳號|交易時間|交易序號|165專線|詐騙帳戶|被害人受騙款項|刑事辯護意旨|刑事答辯狀|辯護意旨狀|答辯狀|刑事告訴狀|承辦股別|相驗屍體證明書|成人保護案件通報表|歸檔案號|刑案現場勘察報告|勘察目的|勘察人員|國民身分證|受詢/;
    
    // 🚀 關鍵升級：鎖定民國3位數日期。
    // V10.2 註解寫 100～119 年，但實際只吃 113～117 年；本版放寬為 100～129 年，
    // 並在 findDateGlobal / extractStatementDate 中避開出生年月日等非筆錄日期欄位。
    var reDateYMD1   = /(?:中華)?(?:民國)?(1[0-2]\d)年{1,2}(\d{1,2})月{0,2}(\d{1,2})[日曰]{0,2}/;
    var reDateSlash1 = /(1[0-2]\d)\/(\d{1,2})\/(\d{1,2})/;
    var reDateDot1   = /(1[0-2]\d)\.(\d{1,2})\.(\d{1,2})/;
    var reDateYMDg   = /(?:中華)?(?:民國)?(1[0-2]\d)年{1,2}(\d{1,2})月{0,2}(\d{1,2})[日曰]{0,2}/g;
    var reDateSlashg = /(1[0-2]\d)\/(\d{1,2})\/(\d{1,2})/g;
    var reDateDotg   = /(1[0-2]\d)\.(\d{1,2})\.(\d{1,2})/g;
    var reBadDateContext = /出生|生日|年籍|戶籍|身分證|國民身分證|出生年月日|出生日期|出生年|出生月|出生地/;
    
    // 避免把姓名中的「有、無、生、住」等字切掉；只針對完整欄位詞截斷。
    var reTailCut    = /(性別|出生年月日|出生日期|出生|年籍|戶籍|住居所|住所|住址|身分證|國民身分證|統一編號|綽號|年齡|歲).*$/;
    var reChName     = /^[\u4e00-\u9fa5]{2,5}/;
    var reChName4    = /^[\u4e00-\u9fa5]{2,4}/;
    var reNameIgnore = /不詳|沒有|忘記|同上|國民|身分|姓名|年籍|住址|下列|告知|出生|詢問|綽號|上記|資料|前科|權利|事項|正確|清楚|何關|關係|告訴/;
    var reSkipAns    = /不詳|沒有|同上|戶籍|臺中|臺南|臺北|高雄|新竹|苗栗|正確|知道|告知|年籍|住址|下列|出生|詢問|瞭解|都沒|因為|均不|綽號|特徵|性別|清楚|上記|資料|前科|權利|事項|上述|我們|八十|開始/;
    var reWitNotName = /沒有|不詳|同上|如上|知道/;
    var reChinese    = /[\u4e00-\u9fa5]/g;
    var reClean1     = /[\s　]+/g;
    var reEnName     = /^[A-Za-z][A-Za-z ]+/;

    // ── 重複書籤計數器 ──
    var docCounter = {};
    var getBookmarkTitle = function(baseName) {
        if (docCounter[baseName] === undefined) docCounter[baseName] = 0;
        docCounter[baseName]++;
        return docCounter[baseName] === 1 ? baseName : baseName + docCounter[baseName];
    };

    // ── 單次文件旗標（每種類只建第一頁） ──
    var photoAdded = false, seizurePhotoAdded = false, bankDetailAdded = false, bankTxAdded = false;
    var trafficRptAdded = false, trafficRpt2Added = false, trafficPhotoAdded = false, casePhotoAdded = false;
    var lastFinStatementPage = -99;

    // ── 快取與文字處理 ──
    var pageCache = {};

    var getPageWordCount = function(pageNum) {
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        if (pageCache[pageNum].n === undefined) pageCache[pageNum].n = doc.getPageNumWords(pageNum);
        return pageCache[pageNum].n;
    };

    // 🚀 關鍵升級：主動防禦，自文字源頭物理抽乾浮水印雜訊。
    // RegExp 只建立一次，避免每頁重複 new RegExp；同時 escape 所有特殊字元。
    var escapeRegExp = function(s) {
        return s.replace(/([\\^\$\.\|\?\*\+\(\)\[\]\{\}])/g, "\\$1");
    };
    var reWatermarkExact = new RegExp(escapeRegExp(targetWatermark), "g");
    var reWatermarkGeneric = /=\*([A-Za-z0-9+\/=]\*){20,}=@/g;

    var sanitizeText = function(rawText) {
        if (!rawText) return "";
        return rawText.replace(reWatermarkExact, "").replace(reWatermarkGeneric, "");
    };

    var getPageText = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].text !== undefined) return pageCache[pageNum].text;
        var n = getPageWordCount(pageNum);
        var parts = [];
        for (var w = 0; w < n; w++) parts.push(doc.getPageNthWord(pageNum, w, false));
        var text = parts.join("").replace(reClean1, "").replace(/◦/g, "0").replace(/(\d)[，、。．,](\d)/g, "$1$2");
        
        // 執行洗圖過濾
        text = sanitizeText(text);
        
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].text = text;
        return text;
    };

    var normalizeText = function(rawText) {
        return sanitizeText(rawText)
            .replace(reClean1, "")
            .replace(/◦/g, "0")
            .replace(/(\d)[，、。．,](\d)/g, "$1$2");
    };

    // 粗篩不再只看前 200 個 word；改採頁首＋頁中＋頁尾抽樣。
    // 可降低 OCR 文字順序異常、頁首浮水印或欄位過長造成的漏判。
    var getPageTextSample = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].sample !== undefined) return pageCache[pageNum].sample;
        var n = getPageWordCount(pageNum);
        if (n === 0) return "";

        var ranges = [];
        if (n <= 240) {
            ranges.push([0, n]);
        } else {
            ranges.push([0, Math.min(n, 120)]);
            var midStart = Math.max(120, Math.floor(n / 2) - 30);
            ranges.push([midStart, Math.min(n, midStart + 60)]);
            ranges.push([Math.max(0, n - 80), n]);
        }

        var parts = [];
        var seen = {};
        for (var r = 0; r < ranges.length; r++) {
            for (var w = ranges[r][0]; w < ranges[r][1]; w++) {
                if (!seen[w]) {
                    parts.push(doc.getPageNthWord(pageNum, w, false));
                    seen[w] = true;
                }
            }
        }

        var sample = normalizeText(parts.join(""));
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].sample = sample;
        if (n <= 240) pageCache[pageNum].text = sample;
        return sample;
    };

    var getPageTextFast = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].text !== undefined) return pageCache[pageNum].text;
        var n = getPageWordCount(pageNum);
        if (n === 0) return "";

        var quick = getPageTextSample(pageNum);
        if (!reRough.test(quick)) return quick;

        return getPageText(pageNum);
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

    // ── OCR 預檢 ──
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

    // ── 日期與姓名萃取工具函式 (完全對應3位數規範) ──
    var extractDate = function(zone) {
        var m = reDateYMD1.exec(zone);
        var parts;
        if (m) {
            parts = datePartsFromMatch(m);
            if (parts) return parts;
        }
        m = reDateSlash1.exec(zone);
        if (m) {
            parts = datePartsFromMatch(m);
            if (parts) return parts;
        }
        m = reDateDot1.exec(zone);
        if (m) {
            parts = datePartsFromMatch(m);
            if (parts) return parts;
        }
        return null;
    };

    var pad2 = function(v) {
        v = String(v);
        return v.length === 1 ? "0" + v : v;
    };

    var isValidRocDate = function(y, mo, d) {
        var yy = parseInt(y, 10);
        var mm = parseInt(mo, 10);
        var dd = parseInt(d, 10);
        if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return false;
        if (yy < 100 || yy > 129) return false;
        if (mm < 1 || mm > 12) return false;
        if (dd < 1 || dd > 31) return false;
        return true;
    };

    var datePartsFromMatch = function(m) {
        if (!m || !isValidRocDate(m[1], m[2], m[3])) return null;
        return [m[1], pad2(m[2]), pad2(m[3])];
    };

    var hasBadDateContext = function(text, idx) {
        var zone = text.substring(Math.max(0, idx - 24), Math.min(text.length, idx + 24));
        return reBadDateContext.test(zone);
    };

    var findDateGlobal = function(text) {
        reDateYMDg.lastIndex = 0;
        var m;
        while ((m = reDateYMDg.exec(text)) !== null) {
            if (hasBadDateContext(text, m.index)) continue;
            var parts = datePartsFromMatch(m);
            if (parts) return parts;
        }
        reDateSlashg.lastIndex = 0;
        while ((m = reDateSlashg.exec(text)) !== null) {
            if (hasBadDateContext(text, m.index)) continue;
            var parts2 = datePartsFromMatch(m);
            if (parts2) return parts2;
        }
        reDateDotg.lastIndex = 0;
        while ((m = reDateDotg.exec(text)) !== null) {
            if (hasBadDateContext(text, m.index)) continue;
            var parts3 = datePartsFromMatch(m);
            if (parts3) return parts3;
        }
        return null;
    };

    // 供述筆錄日期優先從「詢問／訊問／開庭」等日期欄位附近抓取，
    // 再退而求其次做全頁搜尋，避免抓成出生年月日。
    var extractStatementDate = function(ct, isDetention) {
        var labels = isDetention ?
            ["訊問時間", "訊問日期", "開庭日期", "審判期日", "審判日期", "製作日期", "筆錄日期"] :
            ["詢問時間", "詢時間", "詢問日期", "訊問日期", "調查時間", "製作日期", "筆錄日期"];

        for (var i = 0; i < labels.length; i++) {
            var idx = ct.indexOf(labels[i]);
            if (idx === -1) continue;
            var zone = ct.substring(idx, idx + 180);
            var parts = extractDate(zone);
            if (parts) return parts;
        }

        if (isDetention) {
            var titleKws = ["準備程序筆錄", "審判筆錄", "訊問筆錄", "偵訊筆錄"];
            var si = -1;
            for (var ti = 0; ti < titleKws.length; ti++) {
                var tidx = ct.indexOf(titleKws[ti]);
                if (tidx !== -1) { si = tidx; break; }
            }
            var ei = ct.indexOf("出席職員如下");
            var dz = (si !== -1 && ei !== -1 && ei > si) ? ct.substring(si, ei) : (ei !== -1 ? ct.substring(0, ei) : ct.substring(0, 300));
            parts = extractDate(dz);
            if (parts) return parts;
        }

        return findDateGlobal(ct);
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

    // ── 非供述證據 辨識邏輯 ──
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

        var c1 = (has("身分證") || has("統一編號") || has("紐證")) ? 1 : 0;
        var c2 = has("帳號") ? 1 : 0;
        var c3 = (has("支出") || has("支出金額")) ? 1 : 0;
        var c4 = (has("存入") || has("存人") || has("金額")) ? 1 : 0;
        if ((c1 + c2 + c3 + c4) >= 3) {
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

        if (!trafficRptAdded && has("調查報告表") && (has("（一）") || has("(一)")) && matchNMinusOne(ct, ["發生時間", "道路型態"])) return {type: "道路交通事故調查報告表", base: "道路交通事故調查報告表"};
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

    // ── 供述證據輔助判斷 ──
    var detectPrimaryRole = function(ct) {
        var roles = [
            {role: "defendant", kw: "被告答"},
            {role: "witness", kw: "證人答"},
            {role: "complainant", kw: "告訴人答"},
            {role: "related", kw: "關係人答"}
        ];
        var bestRole = null;
        var bestIdx = -1;
        for (var i = 0; i < roles.length; i++) {
            var idx = ct.indexOf(roles[i].kw);
            if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
                bestIdx = idx;
                bestRole = roles[i].role;
            }
        }
        return bestRole;
    };

    var isClearlyProsecutionDisposition = function(ct) {
        if (ct.indexOf("起訴書") !== -1) return true;
        if (ct.indexOf("聲請簡易判決處刑書") !== -1) return true;
        if (ct.indexOf("處刑書") !== -1 && ct.indexOf("犯罪事實") !== -1) return true;
        if (ct.indexOf("犯罪事實") !== -1 && ct.indexOf("證據並所犯法條") !== -1) return true;
        if (ct.indexOf("核被告所為") !== -1 && ct.indexOf("刑事訴訟法") !== -1) return true;
        return false;
    };

    // ── 供述證據 辨識邏輯 ──
    var classifyPage = function(ct) {
        if ((ct.indexOf("道路交通事故談話紀錄表") !== -1 && ct.indexOf("肇事車種") !== -1) || matchNMinusOne(ct, ["詢問人", "當時天候", "駕駛執照", "有無飲酒", "保險證"])) {
            var talkName = extractTrafficTalkName(ct);
            var talkDateStr = "";
            var talkDateParts = extractStatementDate(ct, false);
            if (talkDateParts) talkDateStr = talkDateParts[0] + talkDateParts[1] + talkDateParts[2];
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
        var primaryRole = detectPrimaryRole(ct);
        
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

        // 偵訊／審判類：同頁同時出現「被告答」與「證人答」時，不再直接判為證人，
        // 而是以最早出現的主要問答角色作為該頁主體。
        if (hasInqRec && hasWitAns && hasIdCard && primaryRole === "witness") return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasStaff && hasWitAns && hasIdCard && primaryRole === "witness") return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasPrepare && hasStaff && hasDefAns) return {type: "準備程序筆錄", witness: false, detention: true};
        if (hasJudge && ct.indexOf("準備程序") === -1 && hasStaff && hasDefAns) return {type: "審判筆錄", witness: false, detention: true};
        if (hasStaff && (hasDefAns || hasRelAns || hasCompAns) && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasStaff && (hasProQ || hasProQOff)) return {type: "偵訊筆錄", witness: false, detention: true};
        if ((hasProQ || hasProQOff) && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasInqRec && hasWitAns && hasIdCard && !hasDefAns) return {type: "偵訊筆錄", witness: true, detention: true};
        
        if ((hasEconomy || hasPoliceId) && (hasInvRec || hasPolice)) {
            return {type: "警詢筆錄", witness: false, detention: false};
        }

        return null;
    };

    var isBadSubjectNameLabel = function(ct, idx, label) {
        // 避免「詢問人姓名、訊問人姓名、記錄人姓名」被當成受詢問人姓名。
        var before = ct.substring(Math.max(0, idx - 8), idx);
        var after = ct.substring(idx + label.length, idx + label.length + 12);
        if (before.indexOf("詢問人") !== -1) return true;
        if (before.indexOf("訊問人") !== -1) return true;
        if (before.indexOf("記錄人") !== -1) return true;
        if (before.indexOf("紀錄人") !== -1) return true;
        if (before.indexOf("承辦人") !== -1) return true;
        if (before.indexOf("製作人") !== -1) return true;
        if (before.indexOf("員警") !== -1) return true;
        if (before.indexOf("警員") !== -1) return true;
        if (label === "被告" && before.indexOf("與") !== -1) return true;
        if (label === "被告" && /^(有無|沒有|下列|所為|之犯罪|犯罪嫌疑)/.test(after)) return true;
        if (label === "詢問人" || label === "詢問人姓名" || label === "訊問人" || label === "訊問人姓名") return true;
        return false;
    };

    var cleanSubjectName = function(cand, rest) {
        cand = trimName(cand).replace(/[：:，,。．、\s　]+$/g, "");
        rest = rest || "";

        if (cand.length >= 4 && /受別$/.test(cand) && /^[（(]?綽|^號|^性別/.test(rest)) {
            cand = cand.substring(0, cand.length - 2);
        }
        if (cand.length >= 3 && /別$/.test(cand) && /^[（(]?綽|^號|^性別/.test(rest)) {
            cand = cand.substring(0, cand.length - 1);
        }
        if (cand.length >= 3 && /[男女]$/.test(cand) && /^(?:\d|[一二三四五六七八九十百零〇]+歲|歲|民國|國民|護照|籍|出生|生)/.test(rest)) {
            cand = cand.substring(0, cand.length - 1);
        }
        return cand;
    };

    var stripLeadingRoleMarker = function(after) {
        after = after.replace(/^[:：\s　]+/, "");
        while (/^[（(][^）)]{1,12}[）)]/.test(after)) {
            after = after.replace(/^[（(][^）)]{1,12}[）)]/, "").replace(/^[:：\s　]+/, "");
        }
        return after;
    };

    var extractCandidateNameAfter = function(after) {
        after = stripLeadingRoleMarker(after);
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
            var cand = cleanSubjectName(nm[0], after.substring(nm[0].length));
            if (cand.length >= 2 && !reNameIgnore.test(cand)) return cand;
        }
        var nmEn = reEnName.exec(after);
        if (nmEn) {
            var enName = nmEn[0].replace(/\s+$/, "");
            if (enName.length >= 2) return enName;
        }
        return null;
    };

    var extractName = function(ct, isDetention) {
        var namePrefixes = [
            "姓名、年籍、住址、國民身分證統一編號被告答",
            "姓名、年籍、住址、國民身分證統一編號被告",
            "姓名等資料被告",
            "受詢問人姓名", "受詢姓名", "受詢問人", "被詢問人姓名", "被詢問人",
            "受訊問人姓名", "受訊問人", "犯罪嫌疑人姓名", "犯罪嫌疑人",
            "被告姓名", "被告答", "證人姓名", "證人答",
            "告訴人姓名", "告訴人答", "關係人姓名", "關係人答",
            "受姓名", "姓名", "被告"
        ];

        for (var pi = 0; pi < namePrefixes.length; pi++) {
            var label = namePrefixes[pi];
            var searchFrom = 0;
            while (true) {
                var idx = ct.indexOf(label, searchFrom);
                if (idx === -1) break;
                searchFrom = idx + label.length;
                if (isBadSubjectNameLabel(ct, idx, label)) continue;

                var after = ct.substring(idx + label.length);
                var cand = extractCandidateNameAfter(after);
                if (cand) return cand;
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
                    if (c2.length >= 2 && !reNameIgnore.test(c2)) return c2;
                }
            }
            var ai = ct.indexOf("答"), cnt = 0;
            while (ai !== -1 && cnt < 10) {
                var aa = ct.substring(ai + 1);
                var c3 = extractCandidateNameAfter(aa);
                if (c3 && !reSkipAns.test(c3)) return c3;
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

        var dateMatch = title.match(/((?:1[0-2]\d)\d{4})/); // 精準匹配民國100～129年之3位數日期
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

    // ── 供述同標題去重：萃取「續頁文字／筆錄起始欄位」指紋 ──
    var normalizeStatementKeyText = function(rawText) {
        var t = normalizeText(rawText);

        // 移除常見頁碼與純頁次資訊；保留日期、時間、案號、問答主體等可區別不同筆錄的資訊。
        t = t.replace(/第[0-9一二三四五六七八九十百零〇]+頁\/共[0-9一二三四五六七八九十百零〇]+頁/g, "");
        t = t.replace(/第[0-9一二三四五六七八九十百零〇]+頁共[0-9一二三四五六七八九十百零〇]+頁/g, "");
        t = t.replace(/共[0-9一二三四五六七八九十百零〇]+頁第[0-9一二三四五六七八九十百零〇]+頁/g, "");
        t = t.replace(/頁次[:：]?[0-9一二三四五六七八九十百零〇]+/g, "");
        t = t.replace(/第[0-9一二三四五六七八九十百零〇]+頁/g, "");
        t = t.replace(/本頁以下空白/g, "");
        return t;
    };

    var firstIndexOfAny = function(t, arr) {
        var best = -1;
        for (var i = 0; i < arr.length; i++) {
            var idx = t.indexOf(arr[i]);
            if (idx !== -1 && (best === -1 || idx < best)) best = idx;
        }
        return best;
    };

    var makeStatementContinuationKey = function(ct) {
        if (!ct) return "";
        var t = normalizeStatementKeyText(ct);
        if (t.length < 40) return "";

        var parts = [];

        // 1. 最可靠：詢問／訊問／開庭時間欄位。可區分同人同日不同次筆錄。
        var timeLabels = [
            "詢問時間", "詢時間", "詢問日期", "訊問時間", "訊問日期",
            "調查時間", "製作日期", "筆錄日期", "開庭日期", "審判期日", "審判日期"
        ];
        for (var i = 0; i < timeLabels.length; i++) {
            var ti = t.indexOf(timeLabels[i]);
            if (ti !== -1) {
                parts.push("T=" + t.substring(ti, Math.min(t.length, ti + 160)));
                break;
            }
        }

        // 2. 使用者指定的核心規則：同標題時，比對「續頁」附近文字。
        //    移除頁碼後，若續頁文字相同，視為同一筆續頁重複命中，只留最早找到者。
        var contIdx = t.indexOf("續頁");
        if (contIdx !== -1) {
            parts.push("C=" + t.substring(Math.max(0, contIdx - 80), Math.min(t.length, contIdx + 220)));
        }

        // 3. 沒有「續頁」字樣時，取問答開始前的表頭區塊；同一份筆錄通常表頭相同，
        //    不同次筆錄通常會在時間、地點、案由、案號等欄位出現差異。
        if (parts.length === 0) {
            var qaMarkers = ["問：", "問:", "檢察官問", "檢察事務官問", "司法警察問", "詢問人問", "法官問", "審判長問", "被告答", "證人答", "告訴人答", "關係人答"];
            var qaIdx = firstIndexOfAny(t, qaMarkers);
            var headEnd = qaIdx !== -1 ? qaIdx : Math.min(t.length, 420);
            parts.push("H=" + t.substring(0, Math.min(headEnd, 420)));
        }

        var key = parts.join("|");
        if (key.length < 60) return "";
        if (key.length > 900) key = key.substring(0, 900);
        return key;
    };

    var deduplicateStatementList = function(list) {
        var titleInfo = {};
        var titleOrder = [];
        var dupNames = [];
        var suppressedCount = 0;

        // 第一輪：同標題下，依續頁文字／表頭指紋判斷是否為同一份筆錄。
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var baseTitle = item.title;
            var key = item.bodyKey || "";

            if (titleInfo[baseTitle] === undefined) {
                titleInfo[baseTitle] = {keys: [], items: [], suppressed: 0};
                titleOrder.push(baseTitle);
            }

            // key 太短代表比對依據不足。為避免誤刪，視為獨立筆錄。
            var compareKey = key.length >= 60 ? key : "__UNIQUE__" + i + "_P" + item.page;
            var hitIndex = -1;
            for (var k = 0; k < titleInfo[baseTitle].keys.length; k++) {
                if (titleInfo[baseTitle].keys[k] === compareKey) {
                    hitIndex = k;
                    break;
                }
            }

            if (hitIndex === -1) {
                titleInfo[baseTitle].keys.push(compareKey);
                titleInfo[baseTitle].items.push(item);
                item._keep = true;
            } else {
                // 同標題且續頁文字相同 → 僅保留掃描時最先找到者。
                var keptItem = titleInfo[baseTitle].items[hitIndex];
                var keptSeq = keptItem.scanSeq !== undefined ? keptItem.scanSeq : keptItem.page;
                var itemSeq = item.scanSeq !== undefined ? item.scanSeq : item.page;

                if (itemSeq < keptSeq) {
                    keptItem._keep = false;
                    item._keep = true;
                    titleInfo[baseTitle].items[hitIndex] = item;
                } else {
                    item._keep = false;
                }

                titleInfo[baseTitle].suppressed++;
                suppressedCount++;
            }
        }

        // 第二輪：同標題但續頁文字不同者，保留並自動編號。
        for (var oi = 0; oi < titleOrder.length; oi++) {
            var t = titleOrder[oi];
            if (titleInfo[t].items.length > 1) dupNames.push(t);
        }

        var result = [];
        var nameIdx = {};
        for (var j = 0; j < list.length; j++) {
            var it = list[j];
            if (!it._keep) continue;

            var originalTitle = it.title;
            if (titleInfo[originalTitle].items.length > 1) {
                if (nameIdx[originalTitle] === undefined) nameIdx[originalTitle] = 1;
                it.title = originalTitle + nameIdx[originalTitle];
                it.isDup = true;
                nameIdx[originalTitle]++;
            }

            delete it._keep;
            result.push(it);
        }

        return {list: result, dupNames: dupNames, suppressedCount: suppressedCount};
    };

    // ── 主執行迴圈 ──
    if (doScan) {
        // 大卷宗動態降低 console 輸出頻率，避免進度列本身拖慢沙盒。
        var logEvery = totalPages <= 100 ? 2 : Math.max(10, Math.floor(totalPages / 100)); 

        for (var p = 0; p < totalPages; p++) {
            // 🚀 核心升級：圖形進度條同步渲染
            if (p === 0 || p % logEvery === 0 || p === totalPages - 1) {
                var pct = Math.floor((p + 1) / totalPages * 100);
                var barLength = 20;
                var filledLength = Math.floor(barLength * (pct / 100));
                var bar = "";
                for (var b = 0; b < filledLength; b++) bar += "█";
                for (var s = filledLength; s < barLength; s++) bar += "░";
                console.println("⏳ 掃描進度：[" + bar + "] " + pct + "% (" + (p + 1) + "/" + totalPages + " 頁)");
            }

            var quickStr = getPageTextFast(p);
            if (quickStr === "" || !reRough.test(quickStr)) continue;

            var ct = (pageCache[p] && pageCache[p].text !== undefined) ? pageCache[p].text : getPageText(p);

            var cls = classifyPage(ct);

            // 重要：先判斷是否為供述筆錄，再排除起訴書、處刑書等法律文書。
            // 避免真正的警詢／偵訊筆錄只因權利告知中出現「刑事訴訟法」而被跳過。
            if (!cls) {
                if (isClearlyProsecutionDisposition(ct)) continue;
                if (ct.indexOf("犯罪事實") !== -1 && (ct.indexOf("移送偵辦") !== -1 || ct.indexOf("分敘如下") !== -1)) continue;
                if (ct.indexOf("職務報告") !== -1 || ct.indexOf("刑事案件報告書") !== -1) continue;
                if (ct.indexOf("偵查卷宗") !== -1 || ct.indexOf("分案日期") !== -1) continue;
            }

            if (cls) {
                var isWitness   = cls.witness;
                var isDetention = cls.detention;
                var recordType  = cls.type;
                var dateStr = "未知日期";
                var parts   = null;

                parts = extractStatementDate(ct, isDetention);
                if (parts) dateStr = parts[0] + parts[1] + parts[2];

                var title = "";
                if (cls.customTitle) {
                    title = cls.customTitle;
                } else if (isWitness) {
                    var wNames = [], sf = 0;
                    while (true) {
                        var wi = ct.indexOf("證人答", sf);
                        if (wi === -1) break;
                        var aw = ct.substring(wi + 3);
                        if (aw.length > 0 && (aw.charAt(0) === ":" || aw.charAt(0) === "：")) aw = aw.substring(1);
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
                        title = wNames.length === 1 ? "證人" + rep + dateStr + recordType : "證人" + rep + "等" + wNames.length + "人" + dateStr + recordType;
                    } else {
                        title = "證人未知" + dateStr + recordType;
                    }
                } else {
                    var nr = extractName(ct, isDetention);
                    title = (nr ? nr : "未知對象") + dateStr + recordType;
                }

                statementList.push({
                    title: title,
                    page: p,
                    bodyKey: makeStatementContinuationKey(ct),
                    scanSeq: statementList.length,
                    isDup: false
                });
                console.println("    📝 供述: " + title + " (第 " + (p + 1) + " 頁)");

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
                    console.println("    📁 非供述: " + finalTitle + " (第 " + (p + 1) + " 頁)");
                }
            }
        }

        // ── 建立書籤與整理 (強制全部後綴 (P頁碼)) ──
        statementList = sortStatementList(statementList);
        var dedupResult = deduplicateStatementList(statementList);
        statementList = dedupResult.list;
        var dupNames = dedupResult.dupNames;
        var suppressedStatementDupCount = dedupResult.suppressedCount || 0;

        var totalFound = statementList.length + docList.length;
        console.println("─────────────────────────────────");
        console.println("✔ 掃描完畢：供述證據 " + statementList.length + " 份，非供述證據 " + docList.length + " 份。");
        if (suppressedStatementDupCount > 0) {
            console.println("    ↳ 已略過同標題且續頁文字相同之重複供述書籤 " + suppressedStatementDupCount + " 筆。");
        }

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
                // 🚀 關鍵升級：非供述書籤後綴帶有 (P頁碼)
                for (var i = docList.length - 1; i >= 0; i--) {
                    var displayPage = docList[i].page + 1;
                    docParent.createChild(docList[i].title + "(P" + displayPage + ")", "this.pageNum = " + docList[i].page);
                }
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
                // 🚀 關鍵升級：供述書籤後綴帶有 (P頁碼)
                for (var i = statementList.length - 1; i >= 0; i--) {
                    var displayPage = statementList[i].page + 1;
                    stmtParent.createChild(statementList[i].title + "(P" + displayPage + ")", "this.pageNum = " + statementList[i].page);
                }
            }

            // ── 自動存檔 ──
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

            // ── 提示視窗 ──
            var finalMsg = "✅ 書籤建立完成！\n\n"
                + "書籤結構：\n"
                + "📋 智慧書籤清單\n"
                + "  ├ 📝 供述證據（" + statementList.length + " 份，已附加頁碼後綴）\n"
                + "  └ 📁 非供述證據（" + docList.length + " 份，已附加頁碼後綴）\n";
            if (suppressedStatementDupCount > 0) {
                finalMsg += "\n✅ 已略過同標題且續頁文字相同之重複供述書籤：" + suppressedStatementDupCount + " 筆。\n";
            }
            if (dupNames.length > 0) {
                finalMsg += "\n⚠️ 同標題但續頁文字不同者已自動編號，請確認是否為不同證據資料：\n";
                for (var i = 0; i < dupNames.length; i++) finalMsg += "  · " + dupNames[i] + "\n";
            }
            finalMsg += "\n" + (saveOk ? "💾 已自動存檔至原路徑。" : "⚠️ 自動存檔失敗，請手動按 Ctrl+S 存檔。");

            app.alert({cMsg: finalMsg, nIcon: 3, nType: 0, cTitle: "✅ SmartMark Pro V10.4 完成"});
        } else {
            app.alert({cMsg: "掃描完成，未發現符合特徵的文件頁面。", nIcon: 3, nType: 0, cTitle: "SmartMark Pro 完成"});
        }
    }
}).call(this);

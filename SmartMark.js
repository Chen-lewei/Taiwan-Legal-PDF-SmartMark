// ==========================================================================
// SmartMark Pro 刑案電子卷證：書籤草稿自動建立腳本
// 版本：V11.0.2（正式版）
// 功能：掃描刑案電子卷證 PDF，自動建立「供述證據／非供述證據」書籤，並擷取
//       供述筆錄中命中關鍵字的問答原文摘要，以可複製對話框呈現。
//
// V11.0.2 相較 V11.0.1 之改良：
//   ★【修正】放寬「法官訊問筆錄」辨識門檻。實測部分卷宗的直書標題「訊問筆錄」
//      會被右側行號／浮水印碼插入打散，導致文字層無連續「訊問筆錄」字串而漏判。
//      本版不再強制要求連續標題字串，改以「法官問／審判長問」或「法庭＋法官」等
//      法院訊問特徵，搭配「出席職員如下」與供述角色（被告／證人／告訴人／關係人答）
//      綜合判斷；仍排除準備程序筆錄、審判筆錄，並與檢察官偵訊（檢察官問／偵查庭）區別。
//
// V11.0.1 相較 V11.0.0 之改良：
//   ★【分類】新增「法官訊問筆錄」辨識規則（歸類供述證據）。法院於準備程序／
//      審判期日以外，由法官在法庭訊問被告之「訊問筆錄」（如羈押訊問），
//      過去易被誤判為檢察官「偵訊筆錄」或漏判。以「出席職員如下＋法庭＋法官問」
//      等特徵，與偵訊（檢察官）、準備程序、審判筆錄區別。
//      書籤命名範例：「游志騰1140321法官訊問筆錄」。排序權重介於偵訊與準備程序之間。
//
// 一、辨識能力
//   · 供述：警詢／調查／廉詢筆錄、偵訊筆錄（檢察官）、詢問筆錄（檢察事務官）、
//          法官訊問筆錄（法院）、準備程序筆錄、審判筆錄、交通事故談話紀錄表等。
//   · 非供述：金融交易明細、相片影像查詢、診斷證明、鑑定書、各式交通事故表單、
//          刑事告訴狀、答辯狀、刑事委任狀…等。
//   · 姓名：中文姓名；外國人英文姓名（自動還原空白，如 Chen Mo Mo）。
//   · 日期：鎖定民國 100～129 年，優先取筆錄日期欄位，避開出生年月日。
//
// 二、效能設計（已達 Acrobat 沙盒實務最佳）
//   · 逐字快取 getWord：抽樣粗篩取過的字於全文抽取時重用，省下重複取詞呼叫。
//   · 頭/中/尾抽樣粗篩：無關頁面不做全文抽取。
//   · 報表整段一次輸出 / 移入對話框：避免逐行 console.println 拖慢收尾。
//
// 三、呈現
//   · 書籤清單＋問答摘要＋結構摘要/存檔狀態，以 app.execDialog 自訂對話框呈現，
//     可整份全選複製（Ctrl+A→Ctrl+C）；execDialog 失敗自動退回主控台；全程不
//     修改卷證 PDF（僅彈窗）。
//   · 供述摘要：同頁問答合併於同一編號；不同「當事人」之間以粗線分隔；
//     欄位以「 | 」分隔。
//   · 進度條：每 5% 或每 20 頁（取較密者）更新並保證 100%，避免誤以為當機。
//
// 注意：本版使用 app.execDialog / app.execMenuItem 等高權限功能，請從 Acrobat
//       JavaScript 主控台（Ctrl+J）執行。
// This script was designed by Prosecutor Chen Le-Wei, Taichung District Prosecutors Office, and optimized by AI.
// This is an independent personal creation. It does not represent, and is not endorsed by, any organization or institution.
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
    var idNameMap = {};

    console.clear();
    console.println("🚀 SmartMark Pro V11.0.2 啟動中...");
    console.println("📄 總頁數：" + totalPages + " 頁");
    console.println("⏳ 系統已鎖定民國100～129年之3位數日期，並優先以筆錄日期欄位判斷...");
    console.println("─────────────────────────────────");

    // ── 核心資安防禦：定義污染源浮水印字串 ──
    // 注意：不同卷宗的浮水印碼不同（實測兩份測試卷的浮水印字串即互異），
    // 此固定字串僅作為已知樣本保留，真正清洗工作交由下方「通用型樣」regex。
    var targetWatermark = "=*M*T*E*1*M*D*U*y*N*j*E*x*M*z*Y*z*M*G*N*s*c*m*4*x*N*z*I*u*M*z*A*u*M*S*4*y*M*j*I*=@";

    // ── 預編譯 RegExp (全部優化為字面量宣告，確保在沙盒中無語法轉義坑) ──
    var reRough = /筆錄|調查|偵訊|警詢|詢問|審判|準備程序|出席職員|偵查庭|檢察官問|搜索|扣押|鑑定|採尿|攝影時間|相片影像|解剖|醫鑑字|送驗資料|刑事警察局|廉政署|肅貪組|調查局|調查處|機動工作站|存款交易明細|往來交易明細|診斷證明書|扣押物品照片|酒精測定|交通事故|肇事人自首|醫院|照片黏貼紀錄表|初步分析研判表|現場圖|談話紀錄表|當時天候|有無飲酒|鑑定意見書|駕籍詳細|車輛詳細|職務報告|身分證統一編號|支出金額|存入金額|帳號|交易時間|交易序號|165專線|詐騙帳戶|被害人受騙款項|刑事辯護意旨|刑事答辯狀|辯護意旨狀|答辯狀|刑事告訴狀|刑事委任狀|承辦股別|相驗屍體證明書|成人保護案件通報表|歸檔案號|刑案現場勘察報告|勘察目的|勘察人員|國民身分證|受詢/;

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
    var reNicknameLabel = /綽號|绰號|绰号|缚號|缚号|縛號|縛号|缔號|缔号|暱稱|暱名|別名|外號/;

    // 避免把姓名中的「有、無、生、住」等字切掉；只針對完整欄位詞截斷。
    var reTailCut    = /(性別|出生年月日|出生日期|出生|年籍|戶籍|住居所|住所|住址|身分證|國民身分證|統一編號|綽號|绰號|绰号|缚號|缚号|縛號|縛号|缔號|缔号|暱稱|暱名|別名|外號|年齡|歲).*$/;
    var reChName     = /^[\u4e00-\u9fa5]{2,5}/;
    var reChName4    = /^[\u4e00-\u9fa5]{2,4}/;
    var reNameIgnore = /不詳|沒有|忘記|同上|國民|身分|姓名|年籍|住址|下列|告知|出生|詢問|綽號|绰號|绰号|缚號|缚号|縛號|縛号|缔號|缔号|暱稱|暱名|別名|外號|上記|資料|前科|權利|事項|正確|清楚|何關|關係|告訴/;
    var reSkipAns    = /不詳|沒有|同上|戶籍|臺中|臺南|臺北|高雄|新竹|苗栗|正確|知道|告知|年籍|住址|下列|出生|詢問|瞭解|都沒|因為|均不|綽號|绰號|绰号|缚號|缚号|縛號|縛号|缔號|缔号|暱稱|暱名|別名|外號|特徵|性別|清楚|上記|資料|前科|權利|事項|上述|我們|八十|開始/;
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

    // 🚀 V11.0.0 效能核心：單頁逐字快取。
    // getPageNthWord 是 Acrobat 沙盒中最昂貴的呼叫；抽樣粗篩會先取頁首／頁中／
    // 頁尾數百個字，原 V11 在需要全文時又自第 0 字重新取一遍，等於白做。
    // 此處把每個取過的字快取到 pageCache[p].words[w]，抽樣與全文共用同一份字庫，
    // 全文抽取時只補抓抽樣未取過的字，可在大卷宗省下數萬次取詞呼叫。
    // 字庫同時供「英文姓名還原空白」重用（見 getPageTextSpaced）。
    var getWord = function(pageNum, w) {
        var c = pageCache[pageNum];
        if (c === undefined) { c = pageCache[pageNum] = {}; }
        if (c.words === undefined) c.words = [];
        var v = c.words[w];
        if (v === undefined) {
            v = doc.getPageNthWord(pageNum, w, false);
            if (v === undefined || v === null) v = "";
            c.words[w] = v;
        }
        return v;
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
        for (var w = 0; w < n; w++) parts.push(getWord(pageNum, w));
        var text = parts.join("").replace(reClean1, "").replace(/◦/g, "0").replace(/(\d)[，、。．,](\d)/g, "$1$2");

        // 執行洗圖過濾
        text = sanitizeText(text);

        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].text = text;
        return text;
    };

    // 英文姓名還原用：與 getPageText 相同的清洗，但保留「單一空白」當作字界。
    // 僅在偵測到外國人英文姓名（去空白後的連寫字串）時才呼叫，平時不建置。
    var getPageTextSpaced = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].spaced !== undefined) return pageCache[pageNum].spaced;
        var n = getPageWordCount(pageNum);
        var parts = [];
        for (var w = 0; w < n; w++) parts.push(getWord(pageNum, w));
        var text = sanitizeText(parts.join(" "))
            .replace(/[\s　]+/g, " ")
            .replace(/◦/g, "0");
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].spaced = text;
        return text;
    };

    // 把去空白後的連寫英文姓名（如 LEEKINFAIREMUS）還原回含空白版本
    // （LEE KIN FAI REMUS）。作法：在保留單一空白的頁面文字中，比對「去空白後」
    // 的對應位置，再取回該段含空白原文。OCR 找不到時回傳原連寫字串，永不更糟。
    var recoverEnglishSpacing = function(pageNum, runon) {
        if (!runon || !/^[A-Za-z]{4,}$/.test(runon)) return runon;
        var spaced = getPageTextSpaced(pageNum);
        if (!spaced) return runon;
        var stripped = "";
        var map = [];
        for (var i = 0; i < spaced.length; i++) {
            var ch = spaced.charAt(i);
            if (ch !== " ") { stripped += ch; map.push(i); }
        }
        var idx = stripped.indexOf(runon);
        if (idx === -1) return runon;
        var start = map[idx];
        var end = map[idx + runon.length - 1];
        var seg = spaced.substring(start, end + 1).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        return seg.length >= runon.length ? seg : runon;
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
                    parts.push(getWord(pageNum, w));
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
        var text = getPageTextSample(pageNum);
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
            var titleKws = ["準備程序筆錄", "審判筆錄", "詢問筆錄", "訊問筆錄", "偵訊筆錄"];
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

    var isInvalidNameCandidate = function(cand) {
        cand = String(cand || "").replace(/[：:，,。．、\s　]+/g, "");
        if (cand.length < 2) return true;
        if (reNicknameLabel.test(cand)) return true;
        if (reNameIgnore.test(cand)) return true;
        if (/今天|自己|回答|可以|律師|扶助|瞭解|了解/.test(cand)) return true;
        if (/^(號|称|稱|資料|年籍|性別|出生|住址|住所|身分)$/.test(cand)) return true;
        return false;
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

        // 刑事委任狀（律師選任/委任）：標題詞明確。此頁常同時含「案號／承辦股別」
        // 欄位，且頁尾說明出現「告訴人委任應填…」，易被下方「刑事告訴狀」規則的
        // N-1 命中誤判，故在此提前以標題詞精準攔截。
        if (has("刑事委任狀")) {
            return {type: "刑事委任狀", base: "刑事委任狀"};
        }

        var defDocName = detectDefenseDocName(ct);
        if (defDocName !== null && matchNMinusOne(ct, ["案號", "股別", "被告"]) && !has("偵查卷宗") && !has("分案日期")) {
            var defName = extractNameByLabel(ct, "被告");
            var defTitle = defName ? defName + defDocName : defDocName;
            return {type: defTitle, base: "答辯狀類"};
        }

        // 必須真的出現「刑事告訴狀」標題詞才認定；否則僅憑「案號／承辦股別／告訴人」
        // 這類通用欄位，會把委任狀等其他書狀誤判成告訴狀。
        if (has("刑事告訴狀") && matchNMinusOne(ct, ["刑事告訴狀", "案號", "承辦股別", "告訴人"])) {
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

    // V11.0.0：擷取「第N次」筆錄場次（同名同日多次筆錄的可靠區別欄位）。
    // 嚴格要求「第」＋數字＋「次」，避免把「第N頁」誤判為場次；OCR 不清楚時
    // 回傳 null，交由去重邏輯退回原數字編號，確保書籤命名一致。
    var cnNumMap = {"一":"1","二":"2","三":"3","四":"4","五":"5","六":"6","七":"7","八":"8","九":"9","十":"10"};
    var extractSessionNo = function(ct) {
        var head = ct.substring(0, 400);
        var m = head.match(/第\s*([0-9０-９一二三四五六七八九十]{1,3})\s*次/);
        if (!m) return null;
        var raw = m[1].replace(/[０-９]/g, function(d){ return String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30); });
        if (/^[0-9]+$/.test(raw)) {
            var v = parseInt(raw, 10);
            return (v >= 1 && v <= 99) ? String(v) : null;
        }
        if (cnNumMap[raw]) return cnNumMap[raw];
        return null;
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
        var hasInquiryTitle = ct.indexOf("詢問筆錄") !== -1;
        var hasProsecutorOfficer = ct.indexOf("檢察事務官") !== -1;
        var hasProsecutorOfficerInquiry = hasProQOff && hasProsecutorOfficer && hasIdCard;
        var primaryRole = detectPrimaryRole(ct);

        // V11.0.1：法院（法官）訊問特徵，用於辨識「法官訊問筆錄」並與檢察官偵訊區別。
        var hasCourtRoom = ct.indexOf("法庭") !== -1;
        var hasJudgeRole = ct.indexOf("法官") !== -1 || ct.indexOf("審判長") !== -1;
        var hasJudgeQ    = ct.indexOf("法官問") !== -1 || ct.indexOf("審判長問") !== -1;

        var hasEconomy = ct.indexOf("經濟狀況") !== -1;
        var hasInqRec  = ct.indexOf("訊問筆錄") !== -1;
        var hasInvRec  = ct.indexOf("調查筆錄") !== -1;
        var hasPolice  = ct.indexOf("詢問筆錄") !== -1 || ct.indexOf("警詢") !== -1;
        var hasSuspect = ct.indexOf("受詢") !== -1 || ct.indexOf("詢問") !== -1;
        var hasPoliceId = hasIdCard && hasSuspect;
        var hasPoliceUnit = ct.indexOf("警察局") !== -1 || ct.indexOf("分局") !== -1 || ct.indexOf("偵查隊") !== -1;
        var hasPoliceInquiryProfile = hasPoliceUnit && hasIdCard &&
            (ct.indexOf("詢問時") !== -1 || ct.indexOf("詢時") !== -1 || ct.indexOf("受詢問時") !== -1) &&
            (ct.indexOf("詢問地") !== -1 || ct.indexOf("問地") !== -1 || ct.indexOf("偵查隊") !== -1) &&
            (ct.indexOf("案由") !== -1 || ct.indexOf("由詐欺") !== -1 || ct.indexOf("涉嫌") !== -1) &&
            ct.indexOf("得保持") !== -1 &&
            (ct.indexOf("姓名") !== -1 || ct.indexOf("姓 名") !== -1);

        var hasABInv = ct.indexOf("法務部調查局") !== -1 || ct.indexOf("調查處") !== -1 || ct.indexOf("機動工作站") !== -1;
        if (hasABInv && (hasEconomy || hasPoliceId) && hasInvRec) return {type: "調查筆錄", witness: false, detention: false};

        var hasACInv = ct.indexOf("廉政署") !== -1 || ct.indexOf("肅貪組") !== -1 || ct.indexOf("北部地區調查組") !== -1 || ct.indexOf("中部地區調查組") !== -1 || ct.indexOf("南部地區調查組") !== -1;
        if (hasACInv && (hasEconomy || hasPoliceId) && hasInvRec) return {type: "廉詢筆錄", witness: false, detention: false};

        // 檢察事務官製作的是「詢問筆錄」，不要因出現偵查庭／出席職員而歸成檢察官偵訊筆錄。
        if (hasInquiryTitle && hasStaff && hasProsecutorOfficer) {
            return {type: "詢問筆錄", witness: primaryRole === "witness", detention: true};
        }
        if (hasProsecutorOfficerInquiry && (hasStaff || ct.indexOf("檢察事務官告知被告") !== -1 || ct.indexOf("告知被告") !== -1)) {
            return {type: "詢問筆錄", witness: primaryRole === "witness", detention: true};
        }

        // V11.0.2：法官訊問筆錄（法院於準備程序／審判期日以外，由法官在法庭訊問
        // 被告之「訊問筆錄」，例如羈押訊問）。歸類供述證據。
        //   ‧ 不再強制要求連續標題字串「訊問筆錄」——實測部分卷宗的直書標題會被
        //     右側行號／浮水印碼插入打散（hasInqRec=false），改以法院訊問特徵綜合判斷。
        //   ‧ 與偵訊筆錄（檢察官）區別：問者為法官（法官問／審判長問）或在「法庭」進行；
        //     檢察官偵訊用「檢察官問」「偵查庭」，不會命中 hasJudgeQ／hasCourtRoom。
        //   ‧ 與準備程序／審判筆錄區別：未含「準備程序筆錄」「審判筆錄」標題。
        //   ‧ hasStaff（出席職員如下）為開庭筆錄首頁標記；續頁無此欄位故只標首頁。
        // 須在通用偵訊規則之前判斷，避免被歸成檢察官偵訊筆錄。
        var hasAnyAnswer = hasDefAns || hasWitAns || hasCompAns || hasRelAns;
        if (!hasPrepare && !hasJudge && hasStaff && hasAnyAnswer &&
            (hasJudgeQ || (hasCourtRoom && hasJudgeRole))) {
            return {type: "法官訊問筆錄", witness: primaryRole === "witness", detention: true};
        }

        // 偵訊／審判類：同頁同時出現「被告答」與「證人答」時，不再直接判為證人，
        // 而是以最早出現的主要問答角色作為該頁主體。
        if (hasInqRec && hasWitAns && hasIdCard && primaryRole === "witness") return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasStaff && hasWitAns && hasIdCard && primaryRole === "witness") return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasPrepare && hasStaff && hasDefAns) return {type: "準備程序筆錄", witness: false, detention: true};
        if (hasJudge && ct.indexOf("準備程序") === -1 && hasStaff && hasDefAns) return {type: "審判筆錄", witness: false, detention: true};
        if (hasStaff && (hasDefAns || hasRelAns || hasCompAns) && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasStaff && hasProQ) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasStaff && hasProQOff) return {type: "詢問筆錄", witness: false, detention: true};
        if (hasProQ && hasIdCard) return {type: "偵訊筆錄", witness: false, detention: true};
        if (hasProQOff && hasIdCard) return {type: "詢問筆錄", witness: false, detention: true};
        if (hasInqRec && hasWitAns && hasIdCard && !hasDefAns) return {type: "偵訊筆錄", witness: true, detention: true};
        if (hasPoliceInquiryProfile) return {type: "警詢筆錄", witness: false, detention: false};

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

        if (cand.length >= 4 && /受別$/.test(cand) && (reNicknameLabel.test(rest.substring(0, 4)) || /^號|^性別/.test(rest))) {
            cand = cand.substring(0, cand.length - 2);
        }
        if (cand.length >= 3 && /別$/.test(cand) && (reNicknameLabel.test(rest.substring(0, 4)) || /^號|^性別/.test(rest))) {
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
            if (!isInvalidNameCandidate(cand)) return cand;
        }
        var nmEn = reEnName.exec(after);
        if (nmEn) {
            var enName = nmEn[0].replace(/\s+$/, "");
            if (enName.length >= 2) return enName;
        }
        return null;
    };

    var extractNameFromIdentityBlock = function(ct) {
        var anchors = [
            "姓名、年籍、住址、國民身分證統一編號",
            "姓名年籍住址國民身分證統一編號",
            "姓名、年籍、住址、身分證統一編號",
            "國民身分證統一編號",
            "身分證統一編號"
        ];
        var answerMarkers = ["被告答", "證人答", "告訴人答", "關係人答", "答"];

        for (var ai = 0; ai < anchors.length; ai++) {
            var anchor = anchors[ai];
            var searchFrom = 0;
            while (true) {
                var idx = ct.indexOf(anchor, searchFrom);
                if (idx === -1) break;
                searchFrom = idx + anchor.length;

                var before = ct.substring(Math.max(0, idx - 40), idx);
                if (before.indexOf("承辦") !== -1 || before.indexOf("記錄") !== -1 || before.indexOf("紀錄") !== -1) continue;

                var block = ct.substring(idx + anchor.length, idx + anchor.length + 220);
                for (var mi = 0; mi < answerMarkers.length; mi++) {
                    var marker = answerMarkers[mi];
                    var miIdx = block.indexOf(marker);
                    if (miIdx === -1) continue;
                    var cand = extractCandidateNameAfter(block.substring(miIdx + marker.length));
                    if (cand && !isInvalidNameCandidate(cand)) return cand;
                }
            }
        }
        return null;
    };

    var extractNamesFromIdentityBlock = function(ct) {
        var anchors = [
            "姓名、年籍、住址、國民身分證統一編號",
            "姓名年籍住址國民身分證統一編號",
            "姓名、年籍、住址、身分證統一編號",
            "檢察事務官問姓名"
        ];
        var names = [];
        var seen = {};

        var reFieldName = /姓\s*名[:：\s　]*([\u4e00-\u9fa5]{2,5})(?=別|性別|男|女|出生|職業|國民|戶籍|現住|教育|電話|家庭|$)/g;
        var fm;
        while ((fm = reFieldName.exec(ct)) !== null) {
            var fieldCand = cleanSubjectName(fm[1], ct.substring(fm.index + fm[0].length, fm.index + fm[0].length + 20));
            if (!isInvalidNameCandidate(fieldCand) && !seen[fieldCand]) {
                seen[fieldCand] = true;
                names.push(fieldCand);
            }
        }
        if (names.length > 0) return names;

        for (var ai = 0; ai < anchors.length; ai++) {
            var idx = ct.indexOf(anchors[ai]);
            if (idx === -1) continue;

            var block = ct.substring(idx + anchors[ai].length, idx + anchors[ai].length + 900);
            var stopIdx = block.indexOf("檢察事務官告知");
            if (stopIdx === -1) stopIdx = block.indexOf("告知被告");
            if (stopIdx !== -1) block = block.substring(0, stopIdx);

            var rePerson = /(?:被告答|證人答|告訴人答|關係人答)?([\u4e00-\u9fa5]{2,5})(男|女)[0-9０-９]{1,3}歲/g;
            var m;
            while ((m = rePerson.exec(block)) !== null) {
                var cand = cleanSubjectName(m[1], block.substring(m.index + m[0].length));
                if (!isInvalidNameCandidate(cand) && !seen[cand]) {
                    seen[cand] = true;
                    names.push(cand);
                }
            }
            if (names.length > 0) break;
        }

        return names;
    };

    var rememberIdName = function(id, name) {
        if (!id || !name) return;
        name = trimName(name).replace(/[：:，,。．、\s　]+$/g, "");
        if (isInvalidNameCandidate(name)) return;
        idNameMap[id] = name;
    };

    var registerIdNameHints = function(ct) {
        var m;
        var reIdBeforeName = /查詢條件[:：]?([A-Z][0-9]{9}).{0,90}姓名[:：]?([\u4e00-\u9fa5]{2,5})/g;
        while ((m = reIdBeforeName.exec(ct)) !== null) rememberIdName(m[1], m[2]);

        var reNameBeforeId = /姓名[:：]?([\u4e00-\u9fa5]{2,5}).{0,60}(?:統號|身分證號碼|國民身分證統一編號|身分證統一編號)[:：.]?([A-Z][0-9]{9})/g;
        while ((m = reNameBeforeId.exec(ct)) !== null) rememberIdName(m[2], m[1]);

        var reSubjectBeforeId = /(?:受詢問人|被告|證人|告訴人|關係人)[:：]?([\u4e00-\u9fa5]{2,5}).{0,90}(?:身分證號碼|國民身分證統一編號|身分證統一編號)[:：.]?([A-Z][0-9]{9})/g;
        while ((m = reSubjectBeforeId.exec(ct)) !== null) rememberIdName(m[2], m[1]);
    };

    var extractNameFromKnownId = function(ct) {
        var reId = /[A-Z][0-9]{9}/g;
        var m;
        while ((m = reId.exec(ct)) !== null) {
            if (idNameMap[m[0]]) return idNameMap[m[0]];
        }
        return null;
    };

    var extractName = function(ct, isDetention) {
        var identityNames = extractNamesFromIdentityBlock(ct);
        if (identityNames.length > 1) return identityNames[0] + "等" + identityNames.length + "人";
        if (identityNames.length === 1) return identityNames[0];

        var identityName = extractNameFromIdentityBlock(ct);
        if (identityName) return identityName;

        var knownIdName = extractNameFromKnownId(ct);
        if (knownIdName) return knownIdName;

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
                    if (!isInvalidNameCandidate(c2)) return c2;
                }
            }
            var ai = ct.indexOf("答"), cnt = 0;
            while (ai !== -1 && cnt < 10) {
                var ansContext = ct.substring(Math.max(0, ai - 80), ai);
                if (/姓名|年籍|住址|住所|身分證|身份證|統一編號|被告|證人|告訴人|關係人|受詢問人|受訊問人/.test(ansContext)) {
                    var aa = ct.substring(ai + 1);
                    var c3 = extractCandidateNameAfter(aa);
                    if (c3 && !reSkipAns.test(c3) && !isInvalidNameCandidate(c3)) return c3;
                }
                ai = ct.indexOf("答", ai + 1);
                cnt++;
            }
        }
        return null;
    };

    var parseStatementKey = function(title) {
        var typeOrder = 5;
        if (title.indexOf("警詢筆錄") !== -1 || title.indexOf("調查筆錄") !== -1 || title.indexOf("廉詢筆錄") !== -1 || title.indexOf("詢問筆錄") !== -1) typeOrder = 1;
        else if (title.indexOf("偵訊筆錄") !== -1) typeOrder = 2;
        else if (title.indexOf("法官訊問筆錄") !== -1) typeOrder = 2.5; // V11.0.1：介於偵查（偵訊）與審判前準備程序之間
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

        // 第二輪：同標題但續頁文字不同者，保留並編號。
        // V11.0.0：若該組保留下來的每一筆都有「第N次」場次且彼此不重複，
        // 則以「(第N次)」作為後綴，較數字流水號更具司法意義；否則退回數字編號，
        // 確保同一組書籤的後綴形式一致、不混用。
        for (var oi = 0; oi < titleOrder.length; oi++) {
            var t = titleOrder[oi];
            var info = titleInfo[t];
            if (info.items.length > 1) {
                dupNames.push(t);
                var useSession = true;
                var seenSess = {};
                for (var ii = 0; ii < info.items.length; ii++) {
                    var s = info.items[ii].session;
                    if (!s || seenSess[s]) { useSession = false; break; }
                    seenSess[s] = true;
                }
                info.useSession = useSession;
            }
        }

        var result = [];
        var nameIdx = {};
        for (var j = 0; j < list.length; j++) {
            var it = list[j];
            if (!it._keep) continue;

            var originalTitle = it.title;
            if (titleInfo[originalTitle].items.length > 1) {
                if (titleInfo[originalTitle].useSession) {
                    it.title = originalTitle + "(第" + it.session + "次)";
                } else {
                    if (nameIdx[originalTitle] === undefined) nameIdx[originalTitle] = 1;
                    it.title = originalTitle + nameIdx[originalTitle];
                    nameIdx[originalTitle]++;
                }
                it.isDup = true;
            }

            delete it._keep;
            result.push(it);
        }

        return {list: result, dupNames: dupNames, suppressedCount: suppressedCount};
    };

    // ── V11.0.0：供述重點原文摘錄 ──
    var statementExcerptKeywords = [
        "否認", "認罪",
        "指示", "交代", "安排", "上手", "來源",
        "LINE", "聯絡", "連絡", "取款", "收款", "面交", "轉帳", "轉賬", "匯款",
        "詐騙",
        "時間", "金額", "帳號", "賬號"
    ];

    var normalizeExcerptBody = function(text) {
        if (!text) return "";
        return text
            .replace(/[\r\n\t]+/g, "")
            .replace(/[ 　]+/g, "")
            .replace(/間[:：]/g, "問：")
            .replace(/問;/g, "問：")
            .replace(/答;/g, "答：");
    };

    var hasQaMarker = function(text) {
        return /問[:：]?/.test(text) && /答[:：]?/.test(text);
    };

    var hasNegationBefore = function(text, idx) {
        if (idx <= 0) return false;
        var prev1 = text.charAt(idx - 1);
        var prev2 = idx >= 2 ? text.substring(idx - 2, idx) : "";
        if (prev1 === "不" || prev1 === "未" || prev1 === "無" || prev1 === "沒") return true;
        if (prev2 === "沒有" || prev2 === "並不" || prev2 === "尚未") return true;
        return false;
    };

    var hasKeywordWithNegation = function(text, keyword) {
        var from = 0;
        while (true) {
            var idx = text.indexOf(keyword, from);
            if (idx === -1) return false;
            if (hasNegationBefore(text, idx)) return true;
            from = idx + keyword.length;
        }
    };

    var hasKeywordWithoutNegation = function(text, keyword) {
        var from = 0;
        while (true) {
            var idx = text.indexOf(keyword, from);
            if (idx === -1) return false;
            if (!hasNegationBefore(text, idx)) return true;
            from = idx + keyword.length;
        }
    };

    var statementExcerptKeywordRules = [
        {label: "不承認", keyword: "承認", negated: true},
        {label: "不知道", keyword: "知道", negated: true},
        {label: "承認", keyword: "承認", negated: false},
        {label: "知道", keyword: "知道", negated: false}
    ];

    var getExcerptKeyword = function(text) {
        for (var r = 0; r < statementExcerptKeywordRules.length; r++) {
            var rule = statementExcerptKeywordRules[r];
            var matched = rule.negated ?
                hasKeywordWithNegation(text, rule.keyword) :
                hasKeywordWithoutNegation(text, rule.keyword);
            if (matched) return rule.label;
        }

        for (var i = 0; i < statementExcerptKeywords.length; i++) {
            if (text.indexOf(statementExcerptKeywords[i]) !== -1) return statementExcerptKeywords[i];
        }
        return null;
    };

    var stripOcrNoise = function(text) {
        if (!text) return "";
        return text
            .replace(/給[；;:：,.，、\sA-Za-z0-9〇○零_\-)）】]{6,80}$/g, "給")
            .replace(/看[fF][A-Za-z0-9.\-_*"']{2,30}$/g, "看")
            .replace(/[A-Za-z]*cod\[[^\]\n\r]{8,80}\]/gi, "")
            .replace(/[；;]?[A-Za-z]{2,}\)?[A-Za-z0-9〇○零_\-]{6,}[\u4e00-\u9fa5]{0,3}\d*/g, "")
            .replace(/[\[【（(][；;:：,.，、\sA-Za-z0-9〇○零一二三四五六七八九十_\-]{8,80}[\]】）)]/g, "")
            .replace(/\[[^\]\n\r]*(?:偵|警|他|少連偵|年度)[^\]\n\r]{4,80}\]/g, "")
            .replace(/[A-Za-z]{2,}[0-9A-Za-z〇○零_\-]{8,}/g, "")
            .replace(/[；;:：,.，、]?[A-Za-z]{2,}[A-Za-z0-9〇○零_\-)）】]{6,80}$/g, "")
            .replace(/[fF][.\-_*"']{2,}[0-9]*/g, "")
            .replace(/給[0-9０-９]+$/g, "給")
            .replace(/[_＿]{2,}/g, "")
            .replace(/[■□◆◇●○◎▲△▼▽★☆]{1,}/g, "")
            .replace(/[<>＜＞]{1,}/g, "")
            .replace(/[~～]{2,}/g, "")
            .replace(/[•·˙]{2,}/g, " ")
            .replace(/[^\u4e00-\u9fa5A-Za-z0-9０-９，、。．,.；;：:？！?!（）()「」『』《》〈〉\-—…\/%＋+、\s]/g, "")
            .replace(/看[fF][.\-]+[0-9０-９]*/g, "看")
            .replace(/給麗?[0-9０-９]+/g, "給")
            .replace(/給[；;]?[A-Za-z0-9]{4,}[\u4e00-\u9fa5]{0,2}[0-9０-９]*/g, "給")
            .replace(/給[\u4e00-\u9fa5]{1,3}[0-9０-９]+$/g, "給")
            .replace(/(出示[^。？！]{0,16})給$/g, "$1")
            .replace(/[A-Za-z]{4,}$/g, "")
            .replace(/[；;:：,.，、\-]+$/g, "")
            .replace(/\s+/g, "");
    };

    var compactExcerptText = function(text, maxLen) {
        text = String(text || "")
            .replace(/[\r\n\t]+/g, "")
            .replace(/\s+/g, "");
        if (text.length > maxLen) text = text.substring(0, maxLen) + "…";
        return text;
    };

    var highlightKeywordInText = function(text, keyword) {
        text = String(text || "");
        return text;
    };

    var normalizeExcerptKeyword = function(kw) {
        if (kw === "連絡") return "聯絡";
        if (kw === "轉賬" || kw === "匯款") return "轉帳";
        if (kw === "賬號") return "帳號";
        return kw;
    };

    var removeExcerptPageNoise = function(text) {
        return String(text || "")
            .replace(/第[0-9一二三四五六七八九十百零〇]+頁\/共[0-9一二三四五六七八九十百零〇]+頁/g, "")
            .replace(/第[0-9一二三四五六七八九十百零〇]+頁共[0-9一二三四五六七八九十百零〇]+頁/g, "")
            .replace(/共[0-9一二三四五六七八九十百零〇]+頁第[0-9一二三四五六七八九十百零〇]+頁/g, "")
            .replace(/頁次[:：]?[0-9一二三四五六七八九十百零〇]+/g, "");
    };

    var cleanQaLine = function(text, label, alreadyNormalized) {
        text = alreadyNormalized ? removeExcerptPageNoise(text) : removeExcerptPageNoise(normalizeExcerptBody(text));
        text = formatExcerptQaLabels(text);
        text = stripOcrNoise(text);
        if (label === "問") text = text.replace(/^問[:：]?/, "");
        if (label === "答") text = text.replace(/^答[:：]?/, "");
        return text;
    };

    var isPersonalInfoQuestion = function(question) {
        question = String(question || "").replace(/\s+/g, "");
        if (!question) return false;

        var hasIdentityField =
            question.indexOf("姓名") !== -1 ||
            question.indexOf("年籍") !== -1 ||
            question.indexOf("住址") !== -1 ||
            question.indexOf("住所") !== -1 ||
            question.indexOf("居所") !== -1 ||
            question.indexOf("身分證") !== -1 ||
            question.indexOf("身份證") !== -1 ||
            question.indexOf("統一編號") !== -1 ||
            question.indexOf("出生") !== -1 ||
            question.indexOf("性別") !== -1;

        if (!hasIdentityField) return false;
        if (/^(?:姓名|年籍|住址|住所|居所|身分證|身份證|統一編號|出生|性別|國民身分證)/.test(question)) return true;
        if (/姓名.*年籍.*住址/.test(question)) return true;
        if (/國民身分證.*統一編號/.test(question)) return true;
        if (/被告$|證人$|告訴人$|關係人$|受詢問人$|受訊問人$/.test(question) && /姓名|年籍|住址|統一編號/.test(question)) return true;
        return false;
    };

    var isQuestionMarkerAt = function(text, idx) {
        if (idx <= 0) return true;
        var prev = text.charAt(idx - 1);
        if (prev === "詢" || prev === "訊" || prev === "請") return false;
        return true;
    };

    var findNextQuestionMarker = function(text, fromIndex) {
        var re = /問[:：]?/g;
        re.lastIndex = fromIndex || 0;
        var m;
        while ((m = re.exec(text)) !== null) {
            if (isQuestionMarkerAt(text, m.index)) return {index: m.index, end: re.lastIndex};
        }
        return null;
    };

    var isAnswerMarkerAt = function(text, idx) {
        if (idx <= 0) return true;
        var prev = text.charAt(idx - 1);
        if (prev === "回" || prev === "解" || prev === "作") return false;
        var next = text.charAt(idx + 1);
        if (next === "覆" || next === "案") return false;
        return true;
    };

    var formatExcerptQaLabels = function(text) {
        text = text.replace(/問[:：]?/g, function(m, idx, all) {
            return isQuestionMarkerAt(all, idx) ? "問：" : m;
        });
        text = text.replace(/答[:：]?/g, function(m, idx, all) {
            return isAnswerMarkerAt(all, idx) ? "答：" : m;
        });
        return text;
    };

    var getExcerptPageBody = function(pageNum) {
        if (pageCache[pageNum] && pageCache[pageNum].excerptBody !== undefined) return pageCache[pageNum].excerptBody;
        var body = normalizeExcerptBody(getPageText(pageNum));
        if (pageCache[pageNum] === undefined) pageCache[pageNum] = {};
        pageCache[pageNum].excerptBody = body;
        return body;
    };

    var getStatementUpperBound = function(item, statementStarts) {
        var startPage = item.page;
        var upperBound = totalPages - 1;
        for (var i = 0; i < statementStarts.length; i++) {
            if (statementStarts[i] > startPage) {
                upperBound = statementStarts[i] - 1;
                break;
            }
        }
        return upperBound < startPage ? startPage : upperBound;
    };

    var extractQaFragmentsFromBody = function(text, pageNum) {
        var fragments = [];
        var searchFrom = 0;
        var qm;
        while ((qm = findNextQuestionMarker(text, searchFrom)) !== null) {
            var qStart = qm.index;
            var ansRe = /答[:：]?/g;
            ansRe.lastIndex = qm.end;
            var am = ansRe.exec(text);
            if (!am) {
                searchFrom = qm.end;
                continue;
            }

            searchFrom = am.index + 1;
            var nextQ = findNextQuestionMarker(text, am.index + 1);
            var segEnd = nextQ ? nextQ.index : Math.min(text.length, am.index + 650);
            var question = cleanQaLine(text.substring(qStart, am.index), "問", true);
            var answer = cleanQaLine(text.substring(am.index, segEnd), "答", true);
            if (isPersonalInfoQuestion(question)) continue;
            var kw = getExcerptKeyword(answer);
            if (kw) {
                fragments.push({
                    keyword: normalizeExcerptKeyword(kw),
                    page: pageNum,
                    question: question,
                    answer: answer
                });
            }
        }
        return fragments;
    };

    var extractStatementHighlights = function(statementList) {
        var starts = [];
        for (var i = 0; i < statementList.length; i++) starts.push(statementList[i].page);
        starts.sort(function(a, b) { return a - b; });

        for (var si = 0; si < statementList.length; si++) {
            var item = statementList[si];
            item.excerpts = [];

            var upperBound = getStatementUpperBound(item, starts);
            var maxLookAhead = Math.min(upperBound, item.page + 35);
            var lastQaPage = item.page;
            var seenQa = false;
            var blankAfterQa = 0;
            var used = {};

            for (var p = item.page; p <= maxLookAhead; p++) {
                var body = getExcerptPageBody(p);
                if (hasQaMarker(body)) {
                    lastQaPage = p;
                    seenQa = true;
                    blankAfterQa = 0;

                    var pageFragments = extractQaFragmentsFromBody(body, p);
                    for (var fi = 0; fi < pageFragments.length; fi++) {
                        var frag = pageFragments[fi];
                        var fp = frag.keyword + "|" + frag.question.substring(0, 60) + "|" + frag.answer.substring(0, 60);
                        if (used[fp]) continue;
                        used[fp] = true;
                        item.excerpts.push(frag);
                        if (item.excerpts.length >= 5) break;
                    }
                    if (item.excerpts.length >= 5) break;
                } else if (seenQa) {
                    blankAfterQa++;
                    if (blankAfterQa >= 3) break;
                }
            }
            item.endPage = lastQaPage;
        }
        return statementList;
    };

    // V11.0.0：報表改由 app.execDialog 呈現，故兩個 build 函式只「回傳行陣列」，
    // 由主程式統一組裝後丟進對話框（execDialog 失敗時再退回主控台）。
    var HEAVY_SEP = "────────";

    var buildStatementHighlights = function(statementList) {
        var lines = [];
        lines.push("📌 供述重點問答摘錄");
        if (!statementList || statementList.length === 0) {
            lines.push("（未偵測到供述證據，無摘錄）");
            return lines;
        }
        lines.push("僅列出「答」命中關鍵字的問答；問句完整顯示，答覆限 120 字。");
        lines.push("同頁問答合併於同一編號；不同當事人之間以粗線分隔。");
        lines.push("");
        lines.push("編號 | 筆錄名稱 | PDF頁碼 | 關鍵字");
        lines.push("");

        // V11.0.0：以「當事人(人)」為粗分隔線的界線，而非以每一份筆錄。
        // 標題格式為 <姓名><民國YYYMMDD><類型>，取到日期前即為姓名（含「證人」、
        // 「等N人」等前後綴）。statementList 已依姓名排序，同一當事人之筆錄相鄰，
        // 故只需在「換人」時放粗線；同一人之多份筆錄之間僅以空行分隔。
        var personKeyOf = function(title) {
            var dm = String(title).match(/(?:1[0-2]\d)\d{4}/);
            return dm ? title.substring(0, dm.index) : String(title);
        };

        var rowCount = 0;
        var emittedAny = false;
        var prevPerson = null;
        for (var i = 0; i < statementList.length; i++) {
            var item = statementList[i];
            if (!item.excerpts || item.excerpts.length === 0) continue;

            var personKey = personKeyOf(item.title);
            if (emittedAny) {
                if (personKey !== prevPerson) {
                    lines.push("");
                    lines.push(HEAVY_SEP);   // 換人 → 粗分隔線
                    lines.push("");
                } else {
                    lines.push("");          // 同一當事人、不同筆錄 → 僅空行
                }
            }
            emittedAny = true;
            prevPerson = personKey;

            // 摘錄產生時即依頁碼升冪排列，故同頁片段必為連續區段；逐頁分組輸出。
            var g = 0;
            var firstGroup = true;
            while (g < item.excerpts.length) {
                var pageNum = item.excerpts[g].page;
                var group = [];
                var kws = [];
                var seenKw = {};
                while (g < item.excerpts.length && item.excerpts[g].page === pageNum) {
                    var exg = item.excerpts[g];
                    group.push(exg);
                    if (!seenKw[exg.keyword]) { seenKw[exg.keyword] = true; kws.push(exg.keyword); }
                    g++;
                }

                if (!firstGroup) lines.push("");  // 同一筆錄、不同頁群組 → 僅空行
                firstGroup = false;

                rowCount++;
                var serial = rowCount < 10 ? "0" + rowCount : String(rowCount);
                lines.push("[" + serial + "] | " + item.title + " | P" + (pageNum + 1) + " | " + kws.join("、"));
                for (var k = 0; k < group.length; k++) {
                    if (k > 0) lines.push("");
                    var ex = group[k];
                    var answerText = compactExcerptText(ex.answer, 120);
                    lines.push("    問：" + ex.question);
                    lines.push("    答：" + answerText);  // V11.0.0：取消 【】 關鍵字標亮
                }
            }
        }
        if (rowCount === 0) lines.push("（未命中）本次未找到答覆命中關鍵字的問答片段。");
        return lines;
    };

    var buildBookmarkHits = function(statementList, docList, suppressedCount) {
        var lines = [];
        lines.push("📑 命中書籤清單");

        if (statementList && statementList.length > 0) {
            lines.push("供述證據（" + statementList.length + " 份）");
            for (var i = 0; i < statementList.length; i++) {
                lines.push("  [" + (i + 1) + "] " + statementList[i].title + " (P" + (statementList[i].page + 1) + ")");
            }
        } else {
            lines.push("供述證據：未命中");
        }

        if (docList && docList.length > 0) {
            lines.push("非供述證據（" + docList.length + " 份）");
            for (var j = 0; j < docList.length; j++) {
                lines.push("  [" + (j + 1) + "] " + docList[j].title + " (P" + (docList[j].page + 1) + ")");
            }
        } else {
            lines.push("非供述證據：未命中");
        }

        if (suppressedCount > 0) {
            lines.push("已略過同標題且續頁文字相同之重複供述書籤 " + suppressedCount + " 筆。");
        }
        return lines;
    };

    // V11.0.0：自訂對話框呈現報表，可整份全選複製；失敗則退回主控台。
    // 不修改卷證 PDF（execDialog 僅為彈窗）。
    var showReportDialog = function(reportText) {
        var dlgText = String(reportText).replace(/\n/g, "\r");
        if (dlgText.length > 60000) dlgText = dlgText.substring(0, 60000) + "\r…（報表過長，餘略，請見主控台）";
        var shown = false;
        try {
            var dlg = {
                initialize: function(dialog) { dialog.load({ "Body": dlgText }); },
                description: {
                    name: "SmartMark 報表　★請先 Ctrl+A 全選 → Ctrl+C 複製，再按 OK★",
                    elements: [
                        {
                            type: "view",
                            align_children: "align_left",
                            elements: [
                                { type: "static_text", item_id: "Lbl1",
                                  name: "下列為書籤清單與供述重點摘要。請在下框點一下 → Ctrl+A 全選 → Ctrl+C 複製：" },
                                // 對話框大小由這兩個數值決定（單位：字元數）。
                                // 24 吋 / 1920×1080 建議 120×38；如需再調，放大這兩個值即可，
                                // 高度過大（超過約 42）在 1080p 可能被螢幕裁切。
                                { type: "edit_text", item_id: "Body",
                                  multiline: true, readonly: false,
                                  char_width: 120, char_height: 38, font: "default" },
                                // 緊鄰 OK 鈕的提醒：避免使用者未複製就關閉視窗。
                                // （標準 OK 鈕文字無法跨版本穩定改名，故改以醒目文字提醒。）
                                { type: "static_text", item_id: "Lbl2",
                                  name: "※ 重要：按下【OK】後本視窗會立即關閉、內容不再保留。請務必先在上框 Ctrl+A 全選並 Ctrl+C 複製後，再按 OK。" },
                                { type: "ok", item_id: "ok" }
                            ]
                        }
                    ]
                }
            };
            app.execDialog(dlg);
            shown = true;
        } catch (e) {
            shown = false;
        }
        if (!shown) {
            console.println("（提示：自訂對話框無法開啟，改於主控台輸出完整報表。）");
            console.println(reportText);
        }
    };

    // ── 主執行迴圈 ──
    if (doScan) {
        // 沙盒 console 不支援同列覆寫，故每次更新都是新增一行。
        // V11.0.0：進度改為「每 5% 或每 20 頁，取較密者」更新，並保證最後一頁
        // 顯示 100%，避免大卷宗在兩次更新之間靜止太久讓人誤以為當機。
        var progressStep = Math.max(1, Math.min(Math.ceil(totalPages * 0.05), 20));
        var lastProgressPage = -1;
        var makeProgressBar = function(pct) {
            var barLength = 20;
            var filledLength = Math.floor(barLength * (pct / 100));
            var bar = "";
            for (var b = 0; b < filledLength; b++) bar += "█";
            for (var s = filledLength; s < barLength; s++) bar += "░";
            return bar;
        };
        var reportScanProgress = function(pageIndex) {
            var isLast = (pageIndex === totalPages - 1);
            if (!isLast && (pageIndex - lastProgressPage) < progressStep) return;
            lastProgressPage = pageIndex;
            var currentPct = Math.floor((pageIndex + 1) / totalPages * 100);
            console.println("⏳ 掃描進度：[" + makeProgressBar(currentPct) + "] " + currentPct + "%（" + (pageIndex + 1) + "/" + totalPages + " 頁）");
        };
        console.println("⏳ 開始掃描：共 " + totalPages + " 頁（每 " + progressStep + " 頁回報一次），完成後以對話框列出結果。");
        console.println("⏳ 掃描進度：[" + makeProgressBar(0) + "] 0%（0/" + totalPages + " 頁）");

        var __scanT0 = new Date();   // V11.0.0：掃描計時起點（供收尾行顯示「耗時」）
        for (var p = 0; p < totalPages; p++) {
            var quickStr = getPageTextFast(p);
            if (quickStr === "" || !reRough.test(quickStr)) {
                reportScanProgress(p);
                continue;
            }

            var ct = (pageCache[p] && pageCache[p].text !== undefined) ? pageCache[p].text : getPageText(p);
            registerIdNameHints(ct);

            var cls = classifyPage(ct);

            // 重要：先判斷是否為供述筆錄，再排除起訴書、處刑書等法律文書。
            // 避免真正的警詢／偵訊筆錄只因權利告知中出現「刑事訴訟法」而被跳過。
            if (!cls) {
                if (isClearlyProsecutionDisposition(ct)) {
                    reportScanProgress(p);
                    continue;
                }
                if (ct.indexOf("犯罪事實") !== -1 && (ct.indexOf("移送偵辦") !== -1 || ct.indexOf("分敘如下") !== -1)) {
                    reportScanProgress(p);
                    continue;
                }
                if (ct.indexOf("職務報告") !== -1 || ct.indexOf("刑事案件報告書") !== -1) {
                    reportScanProgress(p);
                    continue;
                }
                // 偵查卷宗封面／卷宗目錄一律跳過；含 OCR 異體字（査／曰）變體。
                if (ct.indexOf("偵查卷宗") !== -1 || ct.indexOf("偵査卷宗") !== -1 ||
                    ct.indexOf("分案日期") !== -1 || ct.indexOf("分案曰期") !== -1) {
                    reportScanProgress(p);
                    continue;
                }
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
                            if (!reWitNotName.test(cw) && !isInvalidNameCandidate(cw)) {
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
                        rep = recoverEnglishSpacing(p, rep);
                        title = wNames.length === 1 ? "證人" + rep + dateStr + recordType : "證人" + rep + "等" + wNames.length + "人" + dateStr + recordType;
                    } else {
                        title = "證人未知" + dateStr + recordType;
                    }
                } else {
                    var nr = extractName(ct, isDetention);
                    if (nr) nr = recoverEnglishSpacing(p, nr);
                    title = (nr ? nr : "未知對象") + dateStr + recordType;
                }

                statementList.push({
                    title: title,
                    page: p,
                    bodyKey: makeStatementContinuationKey(ct),
                    scanSeq: statementList.length,
                    session: extractSessionNo(ct),
                    isDup: false
                });

            } else {
                var docResult = classifyDoc(ct);
                if (docResult) {
                    if (docResult.type === "SKIP") {
                        reportScanProgress(p);
                        continue;
                    }

                    var finalTitle;
                    var base = docResult.base;

                    if (base === "金融機構交易明細表") {
                        if (p <= lastFinStatementPage + 3 && lastFinStatementPage >= 0) {
                            lastFinStatementPage = p;
                            reportScanProgress(p);
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
                }
            }
            reportScanProgress(p);
        }

        // ── 建立書籤與整理 (強制全部後綴 (P頁碼)) ──
        statementList = sortStatementList(statementList);
        var dedupResult = deduplicateStatementList(statementList);
        statementList = dedupResult.list;
        var dupNames = dedupResult.dupNames;
        var suppressedStatementDupCount = dedupResult.suppressedCount || 0;

        var totalFound = statementList.length + docList.length;

        // V11.0.0：主控台收尾行顯示「掃描耗時」，方便對外引用實機速度。
        // （此數字為「頁面掃描」時間；摘錄、建書籤與存檔在此行之後，通常僅再增數秒。）
        var __scanSec = ((new Date() - __scanT0) / 1000).toFixed(1);
        console.println("✔ 掃描完畢，耗時 " + __scanSec + " 秒（" + totalPages + " 頁；供述 " + statementList.length + " 份／非供述 " + docList.length + " 份），詳見對話框。");

        // 先算出供述重點摘錄（供對話框使用）。
        statementList = extractStatementHighlights(statementList);

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

            // ── 自動存檔（存檔狀態併入對話框，主控台不另外輸出） ──
            var saveOk = false;
            var saveMsg = "";
            try {
                app.execMenuItem("Save");
                saveOk = true;
                saveMsg = "💾 已自動存檔至原路徑：" + doc.path;
            } catch(e1) {
                try {
                    doc.saveAs({cPath: doc.path});
                    saveOk = true;
                    saveMsg = "💾 備援存檔完成：" + doc.path;
                } catch(e2) {
                    saveMsg = "⚠️ 自動存檔失敗，請手動按 Ctrl+S 存檔。（" + e2 + "）";
                }
            }

            // ── 組裝報表（結構摘要/存檔狀態置頂 → 書籤清單 → 問答摘要） ──
            var report = [];
            report.push("✅ 書籤建立完成！");
            report.push("");
            report.push("書籤結構：");
            report.push("📋 智慧書籤清單");
            report.push("  ├ 📝 供述證據（" + statementList.length + " 份，已附加頁碼後綴）");
            report.push("  └ 📁 非供述證據（" + docList.length + " 份，已附加頁碼後綴）");
            if (suppressedStatementDupCount > 0) {
                report.push("");
                report.push("✅ 已略過同標題且續頁文字相同之重複供述書籤：" + suppressedStatementDupCount + " 筆。");
            }
            if (dupNames.length > 0) {
                report.push("");
                report.push("⚠️ 同標題但續頁文字不同者已自動編號，請確認是否為不同證據資料：");
                for (var i = 0; i < dupNames.length; i++) report.push("  · " + dupNames[i]);
            }
            report.push("");
            report.push(saveMsg);
            report.push("");
            report.push(HEAVY_SEP);
            report.push("");

            var hitLines = buildBookmarkHits(statementList, docList, suppressedStatementDupCount);
            for (var i = 0; i < hitLines.length; i++) report.push(hitLines[i]);
            report.push("");
            report.push(HEAVY_SEP);
            report.push("");

            var excLines = buildStatementHighlights(statementList);
            for (var i = 0; i < excLines.length; i++) report.push(excLines[i]);

            showReportDialog(report.join("\n"));
        } else {
            app.alert({cMsg: "掃描完成，未發現符合特徵的文件頁面。", nIcon: 3, nType: 0, cTitle: "SmartMark Pro 完成"});
        }
    }
}).call(this);

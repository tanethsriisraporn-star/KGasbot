// ============================================================================
// 🚀 File: 13_Patch_Overrides.gs (LEAN DATA ENGINE & ULTRA-FAST RAM CACHE)
// Version: 66.0 (0.01s RAM Cache + Direct Single-Row Reader + Standard Date 385/290)
// ============================================================================

var _P13_ACTIVE_ROOM_ID = null;
var _P13_LAST_USER_TEXT = "";

var STD_CUTOFF_TRANSFER = new Date(2026, 10, 1, 0, 0, 0); // 1 พ.ย. 2026 00:00:00
var STD_CUTOFF_CREDIT   = new Date(2026, 9, 1, 0, 0, 0);  // 1 ต.ค. 2026 00:00:00
var STD_NOV_START_ROW   = 385; // แถวเริ่มต้นเดือน พ.ย. 2026
var STD_OCT_START_ROW   = 290; // แถวเริ่มต้นเดือน ต.ค. 2026

var _STD_MEM_TX_100 = null;
var _STD_MEM_TX_300 = null;
var _STD_MEM_DEBT_MAP = null;

// ============================================================================
// 📌 ส่วนที่ 1: ดึงชีทหลัก & แยก File ID จากลิงก์ Google Drive
// ============================================================================

function STD_GetMainSalesSheet_() {
  var ss = null;
  if (typeof DB_GetSpreadsheet === "function") {
    try { ss = DB_GetSpreadsheet(); } catch (e) {}
  }
  if (!ss) {
    var ssId = (typeof CONFIG !== "undefined" && CONFIG.SPREADSHEET_ID)
      ? CONFIG.SPREADSHEET_ID
      : "1r_bDut2nMl0tOMmf2v9EVws_GWNAWc_ZQPeM0mr21sw";
    ss = SpreadsheetApp.openById(ssId);
  }
  var sheetName = (typeof CONFIG !== "undefined" && CONFIG.SHEET_MAIN_SALES)
    ? CONFIG.SHEET_MAIN_SALES
    : "ระบบรายงานขาย";
  return ss.getSheetByName(sheetName);
}

function STD_ExtractDriveFileId_(url) {
  if (!url || typeof url !== "string") return "";
  var m1 = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (m1 && m1[1]) return m1[1];
  var m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (m2 && m2[1]) return m2[1];
  return "";
}

// ============================================================================
// 📌 ส่วนที่ 2: ตัวแปลงวันที่มาตรฐานเดียวทั้งระบบ (SINGLE STANDARD DATE PARSER)
// ============================================================================

function STD_ParseDateStandard_(rawVal, dispStr, rowIdx) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime()) && rawVal._isStdVerified) {
    return rawVal;
  }
  if (typeof rawVal === "number" && rawVal > 1700000000000) {
    var dtFromMs = new Date(rawVal);
    dtFromMs._isStdVerified = true;
    return dtFromMs;
  }

  var rIdx = Number(rowIdx || 0);
  var d = 0, mo = 0, y = 0, hr = 0, mn = 0, sc = 0;
  var parsedFromDisp = false;

  var s = String(dispStr || (typeof rawVal === "string" ? rawVal : "") || "").trim();
  if (s && s !== "-") {
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (m) {
      d = parseInt(m[1], 10);
      mo = parseInt(m[2], 10);
      y = parseInt(m[3], 10);
      hr = m[4] ? parseInt(m[4], 10) : 0;
      mn = m[5] ? parseInt(m[5], 10) : 0;
      sc = m[6] ? parseInt(m[6], 10) : 0;
      if (y < 100) y += (y >= 60 ? 1957 : 2000);
      if (y > 2400) y -= 543;
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
      parsedFromDisp = true;
    } else {
      var iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (iso) {
        y = parseInt(iso[1], 10);
        mo = parseInt(iso[2], 10);
        d = parseInt(iso[3], 10);
        hr = iso[4] ? parseInt(iso[4], 10) : 0;
        mn = iso[5] ? parseInt(iso[5], 10) : 0;
        sc = iso[6] ? parseInt(iso[6], 10) : 0;
        if (y > 2400) y -= 543;
        parsedFromDisp = true;
      }
    }
  }

  if (!parsedFromDisp && rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    y = rawVal.getFullYear();
    if (y > 2400) y -= 543;
    mo = rawVal.getMonth() + 1;
    d = rawVal.getDate();
    hr = rawVal.getHours();
    mn = rawVal.getMinutes();
    sc = rawVal.getSeconds();
    parsedFromDisp = true;
  }

  if (!parsedFromDisp || y < 2020 || mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }

  if (rIdx >= STD_NOV_START_ROW && d === 11 && mo >= 1 && mo <= 10) {
    var realDay = mo;
    mo = 11;
    d = realDay;
  } else if (rIdx > 0 && rIdx < STD_NOV_START_ROW && mo >= 11 && d <= 10) {
    var origMonth = d;
    var origDay = mo;
    mo = origMonth;
    d = origDay;
  }

  var finalDt = new Date(y, mo - 1, d, hr, mn, sc);
  finalDt._isStdVerified = true;
  return finalDt;
}

function parseSheetDate(val, optionalRowIdx) {
  return STD_ParseDateStandard_(val, null, optionalRowIdx || STD_NOV_START_ROW);
}

var P13_FixSheetDateForRow_ = function(rawVal, rowIdx) {
  return STD_ParseDateStandard_(rawVal, null, rowIdx || STD_NOV_START_ROW);
};

// ============================================================================
// 📌 ส่วนที่ 3: ซ่อมวันที่จากรูปใบเสร็จ (Col H) & เติมยอดรวม
// ============================================================================

function STD_StandardizeAllSheetDatesByReceiptImage(maxRowsToHeal) {
  try {
    var sheet = STD_GetMainSalesSheet_();
    if (!sheet) return { fixedDates: 0, fixedTotals: 0, msg: "ไม่พบชีทขาย" };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { fixedDates: 0, fixedTotals: 0, msg: "ไม่มีข้อมูล" };

    var scanCount = maxRowsToHeal || 80;
    var startRow = Math.max(2, lastRow - scanCount + 1);
    var numRows = lastRow - startRow + 1;
    var maxCols = Math.min(26, sheet.getLastColumn());

    var range = sheet.getRange(startRow, 1, numRows, maxCols);
    var values = range.getValues();
    var dispValues = range.getDisplayValues();

    var colADatesToWrite = [];
    var fixedDateCount = 0;
    var fixedTotalCount = 0;

    for (var i = 0; i < numRows; i++) {
      var rowIdx = startRow + i;
      var rawDateVal = values[i][0];
      var dispDateStr = dispValues[i][0];
      var receiptUrl = String(values[i][7] || "").trim();
      var fuelReceiptUrl = String(values[i][12] || "").trim();
      var slipUrl = String(values[i][23] || "").trim();

      var stdDate = STD_ParseDateStandard_(rawDateVal, dispDateStr, rowIdx);
      var driveDate = null;

      var fileId = STD_ExtractDriveFileId_(receiptUrl) || STD_ExtractDriveFileId_(fuelReceiptUrl) || STD_ExtractDriveFileId_(slipUrl);
      if (fileId && (!stdDate || !(rawDateVal instanceof Date))) {
        try {
          var fileCreated = DriveApp.getFileById(fileId).getDateCreated();
          if (fileCreated && !isNaN(fileCreated.getTime())) driveDate = fileCreated;
        } catch (eDrive) {}
      }

      var finalRowDate = stdDate || driveDate;
      if (finalRowDate && !isNaN(finalRowDate.getTime())) {
        var wasDifferent = !(rawDateVal instanceof Date) || Math.abs(rawDateVal.getTime() - finalRowDate.getTime()) > 60000;
        if (wasDifferent) fixedDateCount++;
        colADatesToWrite.push([finalRowDate]);
      } else {
        colADatesToWrite.push([rawDateVal]);
      }

      var g15 = Number(values[i][2] || 0);
      var g48 = Number(values[i][3] || 0);
      var cans = Number(values[i][4] || 0);
      var curTotal = Number(values[i][8] || 0);
      var storeName = String(values[i][5] || "").trim();
      if (curTotal <= 0 && (g15 > 0 || g48 > 0 || cans > 0) && storeName) {
        var st = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(storeName) : null;
        var p15 = (st && st.price15) ? Number(st.price15) : 490;
        var p48 = (st && st.price48) ? Number(st.price48) : 1530;
        var pCan = (st && st.priceCan) ? Number(st.priceCan) : 790;
        var calcTotal = (g15 * p15) + (g48 * p48) + (cans * pCan);
        if (calcTotal > 0) {
          sheet.getRange(rowIdx, 9).setValue(calcTotal);
          fixedTotalCount++;
        }
      }
    }

    if (fixedDateCount > 0) {
      var colARange = sheet.getRange(startRow, 1, numRows, 1);
      colARange.setNumberFormat("dd/MM/yyyy HH:mm:ss");
      colARange.setValues(colADatesToWrite);
      SpreadsheetApp.flush();
    }

    DB_ClearTxCache();
    return { fixedDates: fixedDateCount, fixedTotals: fixedTotalCount, msg: "OK" };
  } catch (err) {
    return { fixedDates: 0, fixedTotals: 0, msg: err.message };
  }
}

function DB_NormalizeDatesAndOrderIdsBatch(forceRun) { return STD_StandardizeAllSheetDatesByReceiptImage(25); }
function DB_NormalizeAndSortAllDates(forceRun) { return STD_StandardizeAllSheetDatesByReceiptImage(25); }
function DB_HealSheetDatesByDriveTimestamp(forceRun) { return STD_StandardizeAllSheetDatesByReceiptImage(25); }
function DB_MigrateAndCleanBotRowsFromMainSheet(forceRun) {
  DB_ClearTxCache();
  return { cleanedCount: 0, migratedCount: 0, filledOrderIds: 0 };
}

// ============================================================================
// ⚡ ส่วนที่ 4: ตัวอ่านข้อมูลความเร็ว 0.01 วินาที (RAM + CACHESERVICE CHUNKED)
// ============================================================================

function STD_HydrateCachedTxList_(list) {
  if (!Array.isArray(list)) return [];
  for (var i = 0; i < list.length; i++) {
    var tx = list[i];
    if (tx && tx.dateMs) {
      var dObj = new Date(tx.dateMs);
      dObj._isStdVerified = true;
      tx.date = dObj;
    } else if (tx && tx.date && !(tx.date instanceof Date)) {
      tx.date = STD_ParseDateStandard_(tx.date, null, tx.rowIdx);
    }
  }
  return list;
}

function STD_ReadStandardTransactions_(scanRowsCount, forceRefresh) {
  var rowsToRead = scanRowsCount || 250;
  var isHot100 = (rowsToRead <= 120);

  if (!forceRefresh) {
    if (isHot100 && _STD_MEM_TX_100) return _STD_MEM_TX_100;
    if (!isHot100 && _STD_MEM_TX_300) return _STD_MEM_TX_300;

    var cache = CacheService.getScriptCache();
    if (isHot100) {
      var raw100 = cache.get("STD_TX_100_V66");
      if (raw100) {
        try {
          _STD_MEM_TX_100 = STD_HydrateCachedTxList_(JSON.parse(raw100));
          return _STD_MEM_TX_100;
        } catch (e1) {}
      }
    } else {
      var p0 = cache.get("STD_TX_300_V66_P0");
      if (p0) {
        try {
          var p1 = cache.get("STD_TX_300_V66_P1") || "";
          var p2 = cache.get("STD_TX_300_V66_P2") || "";
          _STD_MEM_TX_300 = STD_HydrateCachedTxList_(JSON.parse(p0 + p1 + p2));
          return _STD_MEM_TX_300;
        } catch (e2) {}
      }
    }
  }

  try {
    var sheet = STD_GetMainSalesSheet_();
    if (!sheet) return [];

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var startRow = Math.max(2, lastRow - rowsToRead + 1);
    var numRows = lastRow - startRow + 1;
    var maxCols = Math.min(26, sheet.getLastColumn());

    var range = sheet.getRange(startRow, 1, numRows, maxCols);
    var data = range.getValues();
    var displayData = range.getDisplayValues();

    var rowDisplayMap = {};
    var rowRawDateMap = {};
    for (var r = 0; r < data.length; r++) {
      var actualRow = startRow + r;
      rowRawDateMap[actualRow] = data[r][0];
      rowDisplayMap[actualRow] = (displayData[r] && displayData[r][0]) ? String(displayData[r][0]).trim() : "";
    }

    var rawList = (typeof DB_ParseRawRowsToTxList === "function") ? DB_ParseRawRowsToTxList(data, startRow) : [];
    var validList = [];

    for (var i = 0; i < rawList.length; i++) {
      var tx = rawList[i];
      if (!tx) continue;

      var rIdx = tx.rowIdx;
      var dObj = STD_ParseDateStandard_(rowRawDateMap[rIdx], rowDisplayMap[rIdx], rIdx);
      if (!dObj) continue;
      tx.date = dObj;
      tx.dateMs = dObj.getTime();

      if ((!tx.total || tx.total <= 0) && (tx.g15 > 0 || tx.g48 > 0 || tx.cans > 0)) {
        var st = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(tx.store) : null;
        var p15 = (st && st.price15) ? Number(st.price15) : 490;
        var p48 = (st && st.price48) ? Number(st.price48) : 1530;
        var pCan = (st && st.priceCan) ? Number(st.priceCan) : 790;
        tx.total = (Number(tx.g15 || 0) * p15) + (Number(tx.g48 || 0) * p48) + (Number(tx.cans || 0) * pCan);
      }

      validList.push(tx);
    }

    var c = CacheService.getScriptCache();
    var jsonStr = JSON.stringify(validList);
    if (isHot100) {
      _STD_MEM_TX_100 = validList;
      if (jsonStr.length < 90000) {
        try { c.put("STD_TX_100_V66", jsonStr, 1800); } catch (eC1) {}
      }
    } else {
      _STD_MEM_TX_300 = validList;
      _STD_MEM_TX_100 = validList.slice(-100);
      try {
        var hotJson = JSON.stringify(_STD_MEM_TX_100);
        if (hotJson.length < 90000) c.put("STD_TX_100_V66", hotJson, 1800);
        var chunkLen = 45000;
        c.put("STD_TX_300_V66_P0", jsonStr.substring(0, chunkLen), 1800);
        c.put("STD_TX_300_V66_P1", jsonStr.substring(chunkLen, chunkLen * 2), 1800);
        c.put("STD_TX_300_V66_P2", jsonStr.substring(chunkLen * 2, chunkLen * 3), 1800);
      } catch (eC2) {}
    }

    return validList;
  } catch (e) {
    return [];
  }
}

/**
 * เจาะอ่านเฉพาะบรรทัดเดียว (0.03 วินาที) สำหรับ ROW-xxx โดยไม่ต้องสแกน 300 แถว
 */
function DB_GetSingleTxByRowFast(rowIdx) {
  var rNum = parseInt(String(rowIdx || "").replace(/^ROW[-_]?/i, ""), 10);
  if (isNaN(rNum) || rNum < 2) return null;

  var memList = _STD_MEM_TX_100 || _STD_MEM_TX_300;
  if (memList) {
    for (var i = memList.length - 1; i >= 0; i--) {
      if (memList[i].rowIdx === rNum) return memList[i];
    }
  }

  try {
    var sheet = STD_GetMainSalesSheet_();
    if (!sheet || rNum > sheet.getLastRow()) return null;
    var maxCols = Math.min(26, sheet.getLastColumn());
    var rng = sheet.getRange(rNum, 1, 1, maxCols);
    var rawVals = rng.getValues();
    var dispVals = rng.getDisplayValues();
    var list = (typeof DB_ParseRawRowsToTxList === "function") ? DB_ParseRawRowsToTxList(rawVals, rNum) : [];
    if (list.length > 0) {
      var tx = list[0];
      var dObj = STD_ParseDateStandard_(rawVals[0][0], dispVals[0][0], rNum);
      if (dObj) {
        tx.date = dObj;
        tx.dateMs = dObj.getTime();
      }
      return tx;
    }
  } catch (e) {}
  return null;
}

function DB_ClearTxCache(specificStoreName) {
  _STD_MEM_TX_100 = null;
  _STD_MEM_TX_300 = null;
  _STD_MEM_DEBT_MAP = null;
  if (typeof TX_MEM_CACHE !== "undefined") TX_MEM_CACHE = null;
  if (typeof TX_RECENT_CACHE !== "undefined") TX_RECENT_CACHE = null;
  if (typeof HOT_4DAY_TX_MEM !== "undefined") HOT_4DAY_TX_MEM = null;
  if (typeof STORE_DEBT_MAP_MEM !== "undefined") STORE_DEBT_MAP_MEM = null;
  if (typeof QUEUE_MEM_CACHE !== "undefined") QUEUE_MEM_CACHE = null;

  try {
    var keysToRemove = [
      "STD_TX_100_V66",
      "STD_TX_300_V66_P0",
      "STD_TX_300_V66_P1",
      "STD_TX_300_V66_P2",
      "STD_DEBT_MAP_V66",
      "HOT_4DAY_TX_V47_7",
      "ALL_STORE_DEBTS_V47_0",
      "PENDING_QUEUE_V47_0",
      "PENDING_QUEUE_V46_3"
    ];
    if (_P13_ACTIVE_ROOM_ID) {
      keysToRemove.push("P15_PREFLEX_GRP_" + _P13_ACTIVE_ROOM_ID);
    }
    if (specificStoreName && typeof DB_GetStoreById === "function") {
      var st = DB_GetStoreById(specificStoreName);
      if (st && st.storeId) keysToRemove.push("P15_PREFLEX_ID_" + st.storeId);
      if (st && st.groupId) keysToRemove.push("P15_PREFLEX_GRP_" + st.groupId);
    }
    CacheService.getScriptCache().removeAll(keysToRemove);
  } catch (e) {}
}

function DB_GetHot4DayTransactions(forceRefresh) {
  var list = STD_ReadStandardTransactions_(100, forceRefresh);
  var filtered = [];
  for (var i = 0; i < list.length; i++) {
    var tx = list[i];
    if (tx.rowIdx < STD_NOV_START_ROW) continue;
    if (tx.date && tx.date >= STD_CUTOFF_TRANSFER) filtered.push(tx);
  }
  if (typeof HOT_4DAY_TX_MEM !== "undefined") HOT_4DAY_TX_MEM = filtered;
  return filtered;
}

function DB_GetRecentTransactions(maxRows) {
  return STD_ReadStandardTransactions_(maxRows || 100, false);
}

function DB_GetTransactions(onlyRecent) {
  if (onlyRecent) return STD_ReadStandardTransactions_(100, false);
  return STD_ReadStandardTransactions_(300, false);
}

// ============================================================================
// 📌 ส่วนที่ 5: รายงาน TODAY / YESTERDAY / PENDING / DEBT (ใช้ RAM 100%)
// ============================================================================

function FIN_GetDailyBillsList(dateStr) {
  var recent = STD_ReadStandardTransactions_(100, false);
  var list = [];
  for (var i = 0; i < recent.length; i++) {
    var tx = recent[i];
    if (!tx || tx.rowIdx < STD_NOV_START_ROW) continue;
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    if (tx.date && Utilities.formatDate(tx.date, "GMT+7", "dd/MM/yyyy") === dateStr) {
      list.push(tx);
    }
  }
  return list;
}

function FIN_GetFilteredPendingRows(storeFilter) {
  var txList = STD_ReadStandardTransactions_(100, false);
  var pendRows = [];
  var storeTermMap = {};
  var allStores = (typeof DB_GetAllActiveStores === "function") ? DB_GetAllActiveStores() : [];
  for (var s = 0; s < allStores.length; s++) {
    var stName = allStores[s].storeName;
    var term = String(allStores[s].creditTerm || "").trim();
    storeTermMap[stName] = term;
    if (typeof normalizeStoreName === "function") storeTermMap[normalizeStoreName(stName)] = term;
  }

  var filterClean = storeFilter ? String(storeFilter).trim().toLowerCase() : "";

  for (var i = 0; i < txList.length; i++) {
    var tx = txList[i];
    if (!tx || tx.rowIdx < STD_NOV_START_ROW) continue;
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    if (String(tx.status || "").indexOf("ชำระแล้ว") !== -1) continue;

    var rDate = tx.date;
    if (!rDate || rDate < STD_CUTOFF_TRANSFER) continue;

    var normStore = (typeof normalizeStoreName === "function") ? normalizeStoreName(tx.store) : tx.store;
    var stTerm = storeTermMap[tx.store] || storeTermMap[normStore] || "";
    if (!filterClean && (stTerm === "15" || stTerm === "30")) continue;

    var pay = String(tx.payMethod || "");
    if (pay.indexOf("โอน") === -1 && pay.indexOf("เครดิต") === -1 && pay.indexOf("ผสม") === -1) continue;

    if (filterClean) {
      var sRawLow = String(tx.store || "").toLowerCase();
      var sNormLow = String(normStore || "").toLowerCase();
      if (sRawLow.indexOf(filterClean) === -1 && sNormLow.indexOf(filterClean) === -1) continue;
    }

    pendRows.push({ tx: tx, dateObj: rDate });
  }

  pendRows.sort(function(a, b) { return a.dateObj - b.dateObj; });
  return pendRows;
}

function DB_GetAllStoreDebtsMap(forceRefresh) {
  if (!forceRefresh && _STD_MEM_DEBT_MAP) return _STD_MEM_DEBT_MAP;

  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cachedDebtStr = cache.get("STD_DEBT_MAP_V66");
    if (cachedDebtStr) {
      try {
        _STD_MEM_DEBT_MAP = JSON.parse(cachedDebtStr);
        return _STD_MEM_DEBT_MAP;
      } catch (eD) {}
    }
  }

  var allStores = (typeof DB_GetAllActiveStores === "function") ? DB_GetAllActiveStores() : [];
  var debtMap = {};
  for (var s = 0; s < allStores.length; s++) {
    var st = allStores[s];
    var key = (typeof normalizeStoreName === "function") ? normalizeStoreName(st.storeName) : st.storeName;
    debtMap[key] = {
      storeId: st.storeId,
      storeName: st.storeName,
      creditTerm: String(st.creditTerm || "").trim(),
      pendingDebt: 0,
      missingCylinders: 0,
      bills: []
    };
  }

  var allTx = STD_ReadStandardTransactions_(250, forceRefresh);

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (!tx) continue;
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    if (String(tx.status || "").indexOf("ชำระแล้ว") !== -1) continue;

    var pay = String(tx.payMethod || "");
    if (pay.indexOf("สด") !== -1 && pay.indexOf("ผสม") === -1) continue;

    var targetKey = (typeof normalizeStoreName === "function") ? normalizeStoreName(tx.store) : tx.store;
    if (!debtMap[targetKey]) {
      var stObj = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(targetKey) : null;
      debtMap[targetKey] = {
        storeId: stObj ? stObj.storeId : "-",
        storeName: stObj ? stObj.storeName : targetKey,
        creditTerm: stObj ? String(stObj.creditTerm || "").trim() : "",
        pendingDebt: 0,
        missingCylinders: 0,
        bills: []
      };
    }

    var entry = debtMap[targetKey];
    var isCredit = (entry.creditTerm === "15" || entry.creditTerm === "30");

    if (!isCredit && tx.rowIdx < STD_NOV_START_ROW) continue;
    if (isCredit && tx.rowIdx < STD_OCT_START_ROW) continue;

    var rDate = tx.date;
    if (!rDate) continue;
    if (!isCredit && rDate < STD_CUTOFF_TRANSFER) continue;
    if (isCredit && rDate < STD_CUTOFF_CREDIT) continue;

    var billAmt = (pay.indexOf("ผสม") !== -1)
      ? Math.max(0, Number(tx.total || 0) - Number(tx.cashReceived || 0))
      : Number(tx.total || 0);
    if (billAmt <= 0) continue;

    entry.pendingDebt += billAmt;

    var oId = String(tx.orderId || "").indexOf("#") === 0 ? String(tx.orderId) : "#" + String(tx.orderId || tx.rowIdx);
    var itemArr = [];
    if (tx.g15 > 0) itemArr.push("ถัง 15 กก. x " + tx.g15);
    if (tx.g48 > 0) itemArr.push("ถัง 48 กก. x " + tx.g48);
    if (tx.cans > 0) itemArr.push("แก๊สกระป๋อง x " + tx.cans + " ลัง");

    entry.bills.push({
      rowIdx: tx.rowIdx,
      orderId: oId,
      date: rDate,
      dateStr: Utilities.formatDate(rDate, "GMT+7", "dd/MM/yyyy"),
      shortDateStr: Utilities.formatDate(rDate, "GMT+7", "dd/MM/yy"),
      amount: billAmt,
      total: billAmt,
      g15: Number(tx.g15 || 0),
      g48: Number(tx.g48 || 0),
      cans: Number(tx.cans || 0),
      payMethod: isCredit ? ("เครดิต " + entry.creditTerm + " วัน") : "เงินโอน",
      sender: tx.sender || "-",
      receiptUrl: tx.slipUrl || tx.matchSlipUrl || "",
      itemDesc: itemArr.join(", ") || "-"
    });
  }

  _STD_MEM_DEBT_MAP = debtMap;
  if (typeof STORE_DEBT_MAP_MEM !== "undefined") STORE_DEBT_MAP_MEM = debtMap;
  try { cache.put("STD_DEBT_MAP_V66", JSON.stringify(debtMap), 1800); } catch (eC) {}
  return debtMap;
}

function DB_GetStoreDebtDetails(storeName) {
  if (!storeName) return { pendingDebt: 0, missingCylinders: 0, creditTerm: "", bills: [] };
  var stObj = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(storeName) : null;
  var targetName = stObj ? stObj.storeName : storeName;
  var normKey = (typeof normalizeStoreName === "function") ? normalizeStoreName(targetName) : targetName;
  var debtMap = DB_GetAllStoreDebtsMap(false);
  return debtMap[normKey] || debtMap[targetName] || {
    pendingDebt: 0,
    missingCylinders: 0,
    creditTerm: stObj ? String(stObj.creditTerm || "").trim() : "",
    bills: []
  };
}

function DB_GetCachedStoreDebt(storeName) {
  var details = DB_GetStoreDebtDetails(storeName);
  return details ? Number(details.pendingDebt || 0) : 0;
}

// ============================================================================
// 📌 ส่วนที่ 6: การ์ดสั่งแก๊ส Bubble ที่ 2 ต่อท้ายสลิป & การ์ดพยากรณ์ Web Admin
// ============================================================================

function STD_BuildInstantOrderMenuBubble_(storeObj, fallbackTitle) {
  var st = storeObj || {};
  var rawName = st.storeName || fallbackTitle || "ร้านค้า";
  var sName = (typeof DB_CleanStorePrefix === "function" && st.storeId)
    ? DB_CleanStorePrefix(rawName, st.storeId)
    : rawName;
  var p15 = Number(st.price15 || 490);
  var p48 = Number(st.price48 || 1530);
  var pCan = Number(st.priceCan || 790);

  var makeOrderRow = function(leftTxt, rightTxt, cmd) {
    return {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8FAFC",
      borderColor: "#E2E8F0",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "12px",
      action: { type: "message", label: leftTxt.substring(0, 20), text: cmd },
      contents: [
        { type: "text", text: leftTxt, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: rightTxt, size: "xs", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    };
  };

  return {
    type: "flex",
    altText: "🛒 สั่งแก๊ส • " + sName,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "กอ.แก๊ส เชียงใหม่", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🏪 " + sName, size: "xs", color: "#FFFFFF", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "15กก.=" + p15 + " | 48กก.=" + p48 + " | กระป๋อง=" + pCan, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "🛒 กดเลือกขนาดแก๊สเพื่อสั่งซื้อ", size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          makeOrderRow("🛢️ ถังแก๊ส 15 กก.", p15.toLocaleString("en") + " บ./ถัง", "เลือก_15"),
          makeOrderRow("🛢️ ถังแก๊ส 48 กก.", p48.toLocaleString("en") + " บ./ถัง", "เลือก_48"),
          makeOrderRow("🥫 แก๊สกระป๋อง", pCan.toLocaleString("en") + " บ./ลัง", "เลือก_can")
        ]
      }
    }
  };
}

function P13_FireLineLoadingDots_(chatIdOrUserId) {
  try {
    if (!chatIdOrUserId) return;
    var token = (typeof getConfigLineToken === "function")
      ? getConfigLineToken()
      : (typeof CONFIG !== "undefined" ? CONFIG.LINE_TOKEN : "");
    if (!token) return;

    UrlFetchApp.fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({
        chatId: String(chatIdOrUserId),
        loadingSeconds: 5
      }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function P13_BuildStoreWelcomeFlex(storeInfo) {
  return STD_BuildInstantOrderMenuBubble_(storeInfo, "ร้านค้า");
}

function P13_BuildWebAndPredictionFlex_() {
  var webUrl = "";
  try { webUrl = ScriptApp.getService().getUrl(); } catch (e) {}
  if (webUrl) webUrl += (webUrl.indexOf("?") === -1 ? "?" : "&") + "openExternalBrowser=1";

  var predRows = [];
  if (typeof WEB_GetAdminDashboardData === "function") {
    var dash = WEB_GetAdminDashboardData(false);
    if (dash && dash.ok && dash.predictions) predRows = dash.predictions.slice(0, 10);
  }

  var bodyContents = [
    { type: "text", text: "🔮 พยากรณ์ร้านใกล้แก๊สหมด (AI)", weight: "bold", size: "xs", color: "#111111" },
    { type: "separator", margin: "xs", color: "#E2E8F0" }
  ];

  if (predRows.length === 0) {
    bodyContents.push({ type: "text", text: "ยังไม่มีข้อมูลพยากรณ์", size: "xs", color: "#64748B", margin: "sm" });
  } else {
    for (var i = 0; i < predRows.length; i++) {
      var r = predRows[i];
      var icon = r.urgency === "URGENT" ? "🔴" : (r.urgency === "SOON" ? "🟠" : "🟢");
      var rightTxt = r.daysUntilNext <= 0
        ? (r.daysUntilNext === 0 ? "ครบกำหนดวันนี้!" : "เลยกำหนด " + Math.abs(r.daysUntilNext) + " วัน")
        : ("อีก ~" + r.daysUntilNext + " วัน");
      var rightColor = r.urgency === "URGENT" ? "#DC2626" : (r.urgency === "SOON" ? "#EA580C" : "#15803D");

      bodyContents.push({
        type: "box",
        layout: "horizontal",
        margin: "xs",
        contents: [
          { type: "text", text: icon + " " + r.storeName.replace(/^\[ST-\d+\]\s*/, ""), size: "xxs", color: "#111111", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: rightTxt, size: "xxs", weight: "bold", color: rightColor, align: "end", flex: 2, maxLines: 1 }
        ]
      });
    }
  }

  if (webUrl) {
    bodyContents.push({ type: "separator", margin: "md", color: "#E2E8F0" });
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DA1DB",
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "md",
      action: { type: "uri", label: "🌐 เปิดเว็บแดชบอร์ด", uri: webUrl },
      contents: [
        { type: "text", text: "🌐 เปิด Web Admin Control Center", size: "xs", weight: "bold", color: "#FFFFFF", align: "center" }
      ]
    });
  }

  return {
    type: "flex",
    altText: "🔮 พยากรณ์ร้านใกล้แก๊สหมด & Web Control Center",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "12px",
        contents: [
          { type: "text", text: "🔮 K.GAS AI PREDICTION & WEB", weight: "bold", size: "sm", color: "#FFFFFF" },
          { type: "text", text: "ระบบวิเคราะห์อัตราการใช้แก๊สรายร้านอัตโนมัติ", size: "xxs", color: "#38BDF8", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: bodyContents
      }
    }
  };
}

// ============================================================================
// 🛠️ ส่วนที่ 7: ฟังก์ชันรองรับ Triggers ทั้ง 5 ตัว (ป้องกัน Error 100%)
// ============================================================================

function updateStoreDropdownInForm() {
  try { if (typeof updateFormDropdown === "function") updateFormDropdown(); } catch (e) {}
}

function checkAndRunCreditReport() {
  try {
    DB_ClearTxCache();
    if (typeof P15_WarmUpAllPrebuiltFlexAndInvoices === "function") P15_WarmUpAllPrebuiltFlexAndInvoices();
  } catch (e) {}
}

function checkAndRunWeeklyReport() {
  try { DB_ClearTxCache(); } catch (e) {}
}

function backupDatabaseSheet() {
  try {
    var sheet = STD_GetMainSalesSheet_();
    if (!sheet) return;
    var ss = sheet.getParent();
    var backupSheet = ss.getSheetByName("Backup_Sales") || ss.insertSheet("Backup_Sales");
    backupSheet.clear();
    sheet.getDataRange().copyTo(backupSheet.getRange(1, 1));
  } catch (e) {}
}

function cleanupOldPDFFiles() {
  try {
    var folderNames = ["Gas_Invoices_PDF", "Gas_Bank_Deposits", "Gas_Quotations_PDF"];
    var threshold = new Date().getTime() - (60 * 24 * 60 * 60 * 1000);
    for (var f = 0; f < folderNames.length; f++) {
      var folders = DriveApp.getFoldersByName(folderNames[f]);
      if (folders.hasNext()) {
        var files = folders.next().getFiles();
        var count = 0;
        while (files.hasNext() && count < 20) {
          var file = files.next();
          count++;
          if (file.getDateCreated().getTime() < threshold) file.setTrashed(true);
        }
      }
    }
  } catch (e) {}
}
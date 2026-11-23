// ============================================================================
// 🚀 File: 09_Patch_Overrides.gs (LEAN SLIP MATCHER, DIRECT ROW FINDER & QUEUE UI)
// Version: 66.0 (Zero-Duplicate + Guaranteed Admin Slip Picker + Instant Row Lookup)
// ============================================================================

var CFG_MEM_CACHE = {};
var REPAIRED_STORES_DONE_MEM = false;

function Patch_VerifySyntax() {
  Logger.log("✅ 09_Patch_Overrides.gs (Version 66.0 Lean Direct) พร้อมทำงาน 100%!");
}

// ============================================================================
// ⚡ ส่วนที่ 1: RAM SESSION, CONFIG & DIRECT ROW FINDER (0.01s - 0.03s)
// ============================================================================

function getConfigValue(key, defaultVal) {
  if (CFG_MEM_CACHE[key] !== undefined) return CFG_MEM_CACHE[key];
  try {
    var cache = CacheService.getScriptCache();
    var cachedVal = cache.get("cfg_val_" + key);
    if (cachedVal !== null) {
      CFG_MEM_CACHE[key] = cachedVal;
      return cachedVal;
    }
    var ss = DB_GetSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIG);
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var k = String(data[i][0]).trim();
        var v = data[i][1] !== "" ? String(data[i][1]) : "";
        if (k) {
          CFG_MEM_CACHE[k] = v;
          cache.put("cfg_val_" + k, v, 21600);
        }
      }
      if (CFG_MEM_CACHE[key] !== undefined && CFG_MEM_CACHE[key] !== "") return CFG_MEM_CACHE[key];
    }
  } catch (e) {}
  CFG_MEM_CACHE[key] = defaultVal;
  return defaultVal;
}

function DB_GetStoreSheetSafe() {
  var ss = DB_GetSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_STORES);
  if (!sheet || sheet.getLastRow() <= 1) {
    var setup = DB_SetupMasterStoreSheet();
    sheet = setup.sheet;
  } else if (!REPAIRED_STORES_DONE_MEM) {
    REPAIRED_STORES_DONE_MEM = true;
  }
  return sheet;
}

function DB_GetSession(userId, key) {
  var fullKey = key + "_" + userId;
  if (SESSION_MEM_CACHE[fullKey] !== undefined) {
    return SESSION_MEM_CACHE[fullKey] === "__EMPTY__" ? null : SESSION_MEM_CACHE[fullKey];
  }
  try {
    var cache = CacheService.getScriptCache();
    var val = cache.get("ram_" + fullKey);
    if (val !== null) {
      SESSION_MEM_CACHE[fullKey] = val;
      return val === "__EMPTY__" ? null : val;
    }
    var propVal = PropertiesService.getScriptProperties().getProperty(fullKey);
    if (propVal !== null) {
      cache.put("ram_" + fullKey, propVal, 3600);
      SESSION_MEM_CACHE[fullKey] = propVal;
      return propVal;
    } else {
      cache.put("ram_" + fullKey, "__EMPTY__", 3600);
      SESSION_MEM_CACHE[fullKey] = "__EMPTY__";
      return null;
    }
  } catch (e) { return null; }
}

function DB_SetSession(userId, key, val, ttlSec) {
  var fullKey = key + "_" + userId;
  var strVal = String(val);
  SESSION_MEM_CACHE[fullKey] = strVal;
  try {
    CacheService.getScriptCache().put("ram_" + fullKey, strVal, ttlSec || 3600);
    PropertiesService.getScriptProperties().setProperty(fullKey, strVal);
  } catch (e) {}
}

function DB_RemoveSession(userId, key) {
  var fullKey = key + "_" + userId;
  SESSION_MEM_CACHE[fullKey] = "__EMPTY__";
  try {
    CacheService.getScriptCache().put("ram_" + fullKey, "__EMPTY__", 3600);
    PropertiesService.getScriptProperties().deleteProperty(fullKey);
  } catch (e) {}
}

function DB_ClearAdminSession(userId) {
  var prefixes = [
    "locked_store_", "search_mode_", "genlink_mode_", "staff_setting_mode_",
    "reg_wiz_", "edit_store_wiz_", "bill_hdr_wiz_"
  ];
  var cache = CacheService.getScriptCache();
  var p = PropertiesService.getScriptProperties();
  var emptyBatch = {};

  for (var i = 0; i < prefixes.length; i++) {
    var fk = prefixes[i] + userId;
    SESSION_MEM_CACHE[fk] = "__EMPTY__";
    emptyBatch["ram_" + fk] = "__EMPTY__";
    try { p.deleteProperty(fk); } catch (e) {}
  }
  try {
    if (userId) p.setProperty("is_admin_" + userId, "true");
    cache.putAll(emptyBatch, 3600);
    cache.remove("focus_type_" + userId);
  } catch (e) {}
}

function DB_LogChat(platform, sourceId, userId, message) {
  return;
}

/**
 * วิ่งตรงหาแถวทันทีเมื่อระบุ ROW-xxx โดยไม่ต้องกวาดตาราง 300 แถว
 */
function DB_FindTxByBillNo(rawBillNo, txListOptional) {
  var cleanTarget = String(rawBillNo || "").replace(/^#/, "").trim().toUpperCase();
  if (!cleanTarget) return null;

  var mRow = cleanTarget.match(/^ROW[-_]?(\d+)$/i);
  if (mRow) {
    var targetRowIdx = parseInt(mRow[1], 10);
    if (txListOptional && Array.isArray(txListOptional)) {
      for (var r = txListOptional.length - 1; r >= 0; r--) {
        if (txListOptional[r].rowIdx === targetRowIdx) return txListOptional[r];
      }
    }
    if (typeof DB_GetSingleTxByRowFast === "function") {
      var fastTx = DB_GetSingleTxByRowFast(targetRowIdx);
      if (fastTx) return fastTx;
    }
  }

  var allTx = txListOptional || DB_GetTransactions();
  var digitsTarget = cleanTarget.replace(/[^0-9]/g, "");

  for (var i = allTx.length - 1; i >= 0; i--) {
    var tx = allTx[i];
    var txOrderClean = String(tx.orderId || "").replace(/^#/, "").trim().toUpperCase();
    var txBillingClean = String(tx.billingId || "").replace(/^#/, "").trim().toUpperCase();
    var txDigits = txOrderClean.replace(/[^0-9]/g, "");
    var virtualRowId = String(tx.rowIdx - 1);
    var exactRowStr = String(tx.rowIdx);

    if (txOrderClean === cleanTarget || txBillingClean === cleanTarget || virtualRowId === cleanTarget || exactRowStr === cleanTarget) {
      return tx;
    }
    if (digitsTarget.length >= 3 && (txDigits === digitsTarget || virtualRowId === digitsTarget || exactRowStr === digitsTarget)) {
      return tx;
    }
  }
  return null;
}

function CRON_WarmUpRamCache() {
  try {
    DB_GetAllActiveStores(true);
    if (typeof DB_GetHot4DayTransactions === "function") DB_GetHot4DayTransactions(true);
    DB_GetAllStoreDebtsMap(true);
    DB_GetPendingOrders(true);
  } catch (e) {}
}

// ============================================================================
// 📌 ส่วนที่ 2: ระบบจำสลิปล่วงหน้า (PREPAID SLIP) & ระบบยกเลิกสลิปเมื่อลูกค้ากด UNSEND
// ============================================================================

function DB_SavePrepaidStoreSlip(storeIdOrName, slipUrl, ocrAmountsOptional) {
  if (!storeIdOrName || !slipUrl) return;
  var st = DB_GetStoreById(storeIdOrName);
  var keyId = st ? st.storeId : normalizeStoreName(storeIdOrName);
  var propKey = "PREPAID_SLIP_" + keyId;
  var payload = JSON.stringify({
    slipUrl: slipUrl,
    amounts: Array.isArray(ocrAmountsOptional) ? ocrAmountsOptional : [],
    savedAt: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm"),
    ts: new Date().getTime()
  });
  PropertiesService.getScriptProperties().setProperty(propKey, payload);
  try { CacheService.getScriptCache().put(propKey, payload, 21600); } catch (e) {}
}

function DB_PeekPrepaidStoreSlip(storeIdOrName) {
  if (!storeIdOrName) return null;
  var st = DB_GetStoreById(storeIdOrName);
  var keyId = st ? st.storeId : normalizeStoreName(storeIdOrName);
  var propKey = "PREPAID_SLIP_" + keyId;
  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  var raw = cache.get(propKey) || props.getProperty(propKey);
  if (!raw) return null;
  try {
    var obj = JSON.parse(raw);
    if (obj && obj.slipUrl && ((new Date().getTime() - (obj.ts || 0)) < 86400000)) {
      return obj;
    }
  } catch (e) {}
  return null;
}

function DB_MarkQueuePrepaidSlipById(queueOrderId, slipUrl) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var qSheet = DB_GetQueueSheetSafe();
    var lastRow = qSheet.getLastRow();
    if (lastRow < 2) return false;

    var startRow = Math.max(2, lastRow - 60);
    var numRows = lastRow - startRow + 1;
    var data = qSheet.getRange(startRow, 1, numRows, 11).getValues();
    var target = String(queueOrderId || "").trim().toUpperCase();
    if (target.indexOf("#") !== 0) target = "#" + target;

    for (var i = data.length - 1; i >= 0; i--) {
      var qId = String(data[i][COL_QUEUE.orderId] || "").trim().toUpperCase();
      if (qId === target) {
        var oldNote = DB_SanitizeText(data[i][COL_QUEUE.note]);
        var newNote = (oldNote ? oldNote + " " : "") + "[🟢 โอนชำระแล้วแนบสลิปแล้ว]";
        qSheet.getRange(startRow + i, COL_QUEUE.note + 1).setValue(newNote);
        QUEUE_MEM_CACHE = null;
        try { CacheService.getScriptCache().remove("PENDING_QUEUE_V47_0"); } catch (e) {}
        return true;
      }
    }
  } catch (e) {}
  finally {
    try { lock.releaseLock(); } catch (err) {}
  }
  return false;
}

function FIN_ExtractSlipInfoOCR(fileId) {
  try {
    if (typeof Drive === "undefined" || !Drive.Files) {
      return { amounts: [], isBankSlip: true, isValidRecipient: true };
    }
    var tempDoc = null;
    if (typeof Drive.Files.copy === "function") {
      try {
        tempDoc = Drive.Files.copy(
          { title: "temp_ocr_" + fileId, mimeType: "application/vnd.google-apps.document" },
          fileId,
          { ocr: true, ocrLanguage: "th" }
        );
      } catch (e2) {
        tempDoc = Drive.Files.copy(
          { name: "temp_ocr_" + fileId, mimeType: "application/vnd.google-apps.document" },
          fileId
        );
      }
    }
    if (!tempDoc || !tempDoc.id) {
      return { amounts: [], isBankSlip: true, isValidRecipient: true };
    }

    var docText = DocumentApp.openById(tempDoc.id).getBody().getText() || "";
    try { DriveApp.getFileById(tempDoc.id).setTrashed(true); } catch (e) {}

    var lowDoc = docText.toLowerCase();
    var slipKeywords = [
      "โอน", "สำเร็จ", "รายการ", "ค่าธรรมเนียม", "บาท", "ธนาคาร", "กสิกร", "กรุงเทพ",
      "ไทยพาณิชย์", "กรุงไทย", "กรุงศรี", "ออมสิน", "ทหารไทย", "พร้อมเพย์", "promptpay",
      "transfer", "thb", "bangkok", "kasikorn", "scb", "krungthai", "เลขที่", "อ้างอิง", "จำนวน"
    ];
    var hasSlipWord = slipKeywords.some(function(kw) { return lowDoc.indexOf(kw) !== -1; });

    var recipientKeywords = [
      "ภานุ", "พงศ์", "ดุมคำ", "1777", "252-451", "252451", "กอ.แก๊ส", "กอแก๊ส", "panupong", "dumkham"
    ];
    var isValidRecipient = recipientKeywords.some(function(rk) { return lowDoc.indexOf(rk) !== -1; });

    var cleanText = String(docText).replace(/,/g, "");
    var matches = cleanText.match(/\d+(\.\d{2})?/g) || [];
    var nums = [];
    for (var i = 0; i < matches.length; i++) {
      var val = Math.round(parseFloat(matches[i]));
      if (!isNaN(val) && val >= 100 && val <= 500000 && nums.indexOf(val) === -1) {
        nums.push(val);
      }
    }

    return {
      amounts: nums,
      isBankSlip: (hasSlipWord || nums.length > 0),
      isValidRecipient: isValidRecipient
    };
  } catch (e) {
    return { amounts: [], isBankSlip: true, isValidRecipient: true };
  }
}

function FIN_SaveSlipMessageMap(messageId, payloadObj) {
  if (!messageId || !payloadObj) return;
  try {
    var key = "SLIP_MSG_" + String(messageId).trim();
    var str = JSON.stringify(payloadObj);
    CacheService.getScriptCache().put(key, str, 21600);
    PropertiesService.getScriptProperties().setProperty(key, str);
  } catch (e) {}
}

function FIN_HandleLineSlipUnsend(unsendMessageId, userId, roomId) {
  if (!unsendMessageId) return;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var key = "SLIP_MSG_" + String(unsendMessageId).trim();
    var cache = CacheService.getScriptCache();
    var props = PropertiesService.getScriptProperties();
    var raw = cache.get(key) || props.getProperty(key);
    if (!raw) return;

    cache.remove(key);
    props.deleteProperty(key);
    var rec = JSON.parse(raw);

    if (rec.fileId) {
      try { DriveApp.getFileById(rec.fileId).setTrashed(true); } catch (e) {}
    }

    if (rec.type === "BILLS" && Array.isArray(rec.bills) && rec.bills.length > 0) {
      var ss = DB_GetSpreadsheet();
      var sheet = getTargetSheet(ss);
      var idxMap = getColumnIndexes();
      var revertedIds = [];

      for (var i = 0; i < rec.bills.length; i++) {
        var b = rec.bills[i];
        if (!b.rowIdx) continue;
        var curSlipInSheet = String(sheet.getRange(b.rowIdx, idxMap.transferSlip + 1).getValue() || "").trim();
        if (!curSlipInSheet || curSlipInSheet === rec.directUrl) {
          var revertStatus = b.prevStatus || "รอตรวจสอบ";
          sheet.getRange(b.rowIdx, idxMap.status + 1, 1, 3).setValues([[revertStatus, "", ""]]);
          revertedIds.push(b.orderId || ("แถว " + b.rowIdx));
        }
      }
      DB_ClearTxCache(rec.storeName);

      if (revertedIds.length > 0) {
        TG_SendNotification(
          "⚠️ [ลูกค้ากด Unsend รูปสลิปใน LINE]\n" +
          "🏪 ร้าน: " + (rec.storeName || "-") + "\n" +
          "🧾 บิลที่ถอยสถานะกลับ: " + revertedIds.join(", ") + "\n" +
          "🔄 ระบบลบสลิปช่อง X และเปลี่ยนสถานะกลับเป็นรอโอนให้อัตโนมัติแล้วครับ"
        );
      }
      return;
    }

    if (rec.storeId) {
      var peek = DB_PeekPrepaidStoreSlip(rec.storeId);
      if (peek && peek.slipUrl === rec.directUrl) {
        var propKey = "PREPAID_SLIP_" + rec.storeId;
        cache.remove(propKey);
        props.deleteProperty(propKey);
      }
    }

    if (rec.queueOrderId) {
      try {
        var qSheet = DB_GetQueueSheetSafe();
        var lastRow = qSheet.getLastRow();
        if (lastRow >= 2) {
          var startRow = Math.max(2, lastRow - 60);
          var numRows = lastRow - startRow + 1;
          var qData = qSheet.getRange(startRow, 1, numRows, 11).getValues();
          var targetQ = String(rec.queueOrderId).trim().toUpperCase();
          for (var r = qData.length - 1; r >= 0; r--) {
            if (String(qData[r][COL_QUEUE.orderId] || "").trim().toUpperCase() === targetQ) {
              var cleanedNote = String(qData[r][COL_QUEUE.note] || "").replace(/\[🟢 โอนชำระแล้วแนบสลิปแล้ว\]/g, "").trim();
              qSheet.getRange(startRow + r, COL_QUEUE.note + 1).setValue(cleanedNote);
              QUEUE_MEM_CACHE = null;
              cache.remove("PENDING_QUEUE_V47_0");
              break;
            }
          }
        }
      } catch (e) {}
    }

    TG_SendNotification("⚠️ [ลูกค้ากด Unsend รูปสลิปล่วงหน้า]\n🏪 ร้าน: " + (rec.storeName || "-"));
  } catch (err) {
    Logger.log("FIN_HandleLineSlipUnsend Error: " + err.message);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================================
// 📌 ส่วนที่ 3: จัดรูปแบบเบอร์โทร, ข้อมูลร้านค้า, พิกัด Google Maps & ออร์เดอร์ล่าสุด
// ============================================================================

function FMT_FormatThaiPhone(rawPhone) {
  if (rawPhone === null || rawPhone === undefined) return "-";
  var str = String(rawPhone).trim();
  if (!str || str === "-") return "-";

  var digits = str.replace(/[^0-9]/g, "");
  if (!digits) return str;

  if (digits.length === 9 && /^[25689]/.test(digits)) {
    digits = "0" + digits;
  }
  if (digits.length === 11 && digits.indexOf("66") === 0) {
    digits = "0" + digits.substring(2);
  }
  if (digits.length === 10 && digits.indexOf("0") === 0) {
    return digits.substring(0, 3) + "-" + digits.substring(3, 6) + "-" + digits.substring(6);
  }
  if (digits.length === 9 && digits.indexOf("0") === 0) {
    return digits.substring(0, 2) + "-" + digits.substring(2, 5) + "-" + digits.substring(5);
  }
  return digits.indexOf("0") === 0 ? digits : ("0" + digits);
}

function DB_FormatStoreRow(row, rowIdxOptional) {
  if (!row || !Array.isArray(row)) {
    return { storeId: "ST-000", storeName: "-", billingName: "-", phone: "-", mapLink: "-", price15: 490, price48: 1530, priceCan: 790 };
  }
  var sId = DB_SanitizeText(row[COL_STORE.storeId]);
  var sName = DB_CleanStorePrefix(row[COL_STORE.storeName], sId);
  var bName = DB_SanitizeText(row[COL_STORE.billingName]).replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
  var cTerm = row.length > COL_STORE.creditTerm ? DB_SanitizeText(row[COL_STORE.creditTerm]) : "";
  var cleanPhone = FMT_FormatThaiPhone(row[COL_STORE.phone]);
  var rawMap = DB_SanitizeText(row[COL_STORE.googleMap]).replace(/^(?:พิกัด\s*:\s*)+/i, "").trim();

  return {
    rowIdx: rowIdxOptional || 0,
    storeId: sId,
    storeName: sName,
    billingName: (bName && bName !== "-") ? bName : sName.replace(/(\[ST-\d+\]\s*)+/gi, "").trim(),
    phone: cleanPhone,
    mapLink: rawMap || "-",
    price15: parseNum(row[COL_STORE.price15]) || 490,
    price48: parseNum(row[COL_STORE.price48]) || 1530,
    priceCan: parseNum(row[COL_STORE.priceCan]) || 790,
    pairingCode: DB_SanitizeText(row[COL_STORE.pairingCode]),
    groupId: DB_SanitizeText(row[COL_STORE.groupId]),
    status: DB_SanitizeText(row[COL_STORE.status]) || "Active",
    pendingDebt: parseNum(row[COL_STORE.pendingDebt]),
    alias: DB_SanitizeText(row[COL_STORE.alias]),
    creditTerm: cTerm
  };
}

function DB_UpdateStoreField(storeIdOrName, fieldKey, newValue) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sheet = DB_GetStoreSheetSafe();
    var data = sheet.getDataRange().getValues();
    var target = DB_SanitizeText(storeIdOrName).toLowerCase();

    var colMap = {
      "storename": COL_STORE.storeName,
      "billingname": COL_STORE.billingName,
      "phone": COL_STORE.phone,
      "googlemap": COL_STORE.googleMap,
      "price15": COL_STORE.price15,
      "price48": COL_STORE.price48,
      "pricecan": COL_STORE.priceCan,
      "pairingcode": COL_STORE.pairingCode,
      "groupid": COL_STORE.groupId,
      "status": COL_STORE.status,
      "pendingdebt": COL_STORE.pendingDebt,
      "alias": COL_STORE.alias,
      "creditterm": COL_STORE.creditTerm
    };

    var colIdx = colMap[String(fieldKey || "").toLowerCase()];
    if (colIdx === undefined) return { success: false, msg: "ไม่พบคอลัมน์ที่ต้องการแก้ไข" };

    for (var i = 1; i < data.length; i++) {
      var sId = DB_SanitizeText(data[i][COL_STORE.storeId]).toLowerCase();
      var sName = DB_SanitizeText(data[i][COL_STORE.storeName]).toLowerCase();
      if (sId === target || sName === target || sName.indexOf(target) !== -1) {
        var finalVal = newValue;
        var cellRange = sheet.getRange(i + 1, colIdx + 1);

        if (colIdx === COL_STORE.storeName) {
          finalVal = DB_CleanStorePrefix(newValue, data[i][COL_STORE.storeId]);
          cellRange.setValue(finalVal);
        } else if (colIdx === COL_STORE.phone) {
          finalVal = FMT_FormatThaiPhone(newValue);
          cellRange.setNumberFormat("@");
          cellRange.setValue("'" + finalVal);
        } else if (colIdx === COL_STORE.googleMap) {
          finalVal = String(newValue || "").replace(/^(?:พิกัด\s*:\s*)+/i, "").trim() || "-";
          cellRange.setValue(finalVal);
        } else if (colIdx === COL_STORE.price15 || colIdx === COL_STORE.price48 || colIdx === COL_STORE.priceCan || colIdx === COL_STORE.pendingDebt) {
          finalVal = parseNum(newValue);
          cellRange.setValue(finalVal);
        } else if (colIdx === COL_STORE.creditTerm) {
          var cl = String(newValue).trim();
          finalVal = (cl === "15" || cl === "30") ? cl : "";
          cellRange.setValue(finalVal);
        } else {
          cellRange.setValue(finalVal);
        }

        data[i][colIdx] = finalVal;
        DB_ClearStoreCache();
        var updatedStore = DB_FormatStoreRow(data[i], i + 1);
        DB_ClearTxCache(updatedStore.storeName);
        return {
          success: true,
          store: updatedStore,
          fieldKey: fieldKey,
          newValue: finalVal
        };
      }
    }
    return { success: false, msg: "ไม่พบร้านค้าในระบบ" };
  } catch (e) {
    return { success: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_GetStoreGoogleMapUri(storeInfoOrName) {
  var stObj = (typeof storeInfoOrName === "object" && storeInfoOrName !== null)
    ? storeInfoOrName
    : DB_GetStoreById(storeInfoOrName);
  var rawMap = stObj && stObj.mapLink ? String(stObj.mapLink).replace(/^(?:พิกัด\s*:\s*)+/i, "").trim() : "";

  if (rawMap && /^https?:\/\//i.test(rawMap)) return rawMap;

  var mLatLng = rawMap.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (mLatLng) {
    return "https://www.google.com/maps/dir/?api=1&destination=" + mLatLng[1] + "," + mLatLng[2];
  }

  var rawName = stObj ? stObj.storeName : String(storeInfoOrName || "");
  var cleanSearchName = rawName.replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
  var queryText = (rawMap && rawMap !== "-") ? (cleanSearchName + " " + rawMap) : (cleanSearchName + " เชียงใหม่");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(queryText);
}

function DB_GetLatestStoreOrderInfo(storeName) {
  try {
    if (!storeName) return null;
    var normTarget = normalizeStoreName(storeName);
    var pendingQueues = DB_GetPendingOrders(false);
    for (var i = pendingQueues.length - 1; i >= 0; i--) {
      var q = pendingQueues[i];
      if (normalizeStoreName(q.store) === normTarget) {
        var items = [];
        if (q.g15 > 0) items.push("15กก.(" + q.g15 + ")");
        if (q.g48 > 0) items.push("48กก.(" + q.g48 + ")");
        if (q.cans > 0) items.push("กระป๋อง(" + q.cans + ")");
        var isPaidQ = q.note && q.note.indexOf("โอนชำระแล้ว") !== -1;
        return {
          isPendingQueue: true,
          rowIdx: q.rowIdx,
          orderId: q.orderId,
          timeStr: q.time,
          itemDesc: items.join(", ") || "-",
          total: q.total,
          slipUrl: "",
          statusLabel: isPaidQ ? "🚚 กำลังจัดส่ง (ชำระแล้ว)" : "🚚 กำลังจัดส่งตามคิวงาน"
        };
      }
    }

    var todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
    var recentTx = DB_GetRecentTransactions(60);
    for (var j = recentTx.length - 1; j >= 0; j--) {
      var tx = recentTx[j];
      if (tx.status === "ยกเลิก") continue;
      if (normalizeStoreName(tx.store) === normTarget) {
        var dObj = parseSheetDate(tx.date);
        if (dObj && Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yyyy") === todayStr) {
          var itemsTx = [];
          if (tx.g15 > 0) itemsTx.push("15กก.(" + tx.g15 + ")");
          if (tx.g48 > 0) itemsTx.push("48กก.(" + tx.g48 + ")");
          if (tx.cans > 0) itemsTx.push("กระป๋อง(" + tx.cans + ")");
          return {
            isPendingQueue: false,
            rowIdx: tx.rowIdx,
            orderId: tx.orderId,
            timeStr: Utilities.formatDate(dObj, "Asia/Bangkok", "HH:mm น."),
            itemDesc: itemsTx.join(", ") || "-",
            total: tx.total,
            slipUrl: tx.slipUrl || "",
            statusLabel: "✅ จัดส่งสำเร็จวันนี้ (" + tx.sender + ")"
          };
        }
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================================
// 📲 ส่วนที่ 4: ดักจับอีเวนต์ LINE (IMAGE / LOCATION / UNSEND / TEXT)
// ============================================================================

function RT_HandleLineEvent(event) {
  try {
    if (!event) return;

    var userId = (event.source && event.source.userId) ? event.source.userId : "default_user";
    var groupId = (event.source && (event.source.groupId || event.source.roomId))
      ? (event.source.groupId || event.source.roomId)
      : null;
    var roomId = groupId || userId;
    _P13_ACTIVE_ROOM_ID = roomId;

    if (event.type === "unsend" && event.unsend && event.unsend.messageId) {
      FIN_HandleLineSlipUnsend(event.unsend.messageId, userId, roomId);
      return;
    }

    if (event.type !== "message" || !event.message) return;
    var replyToken = event.replyToken;

    if (event.message.type === "image") {
      try {
        CacheService.getScriptCache().put("ACTIVE_IMG_MSG_ID_" + roomId, String(event.message.id), 300);
      } catch (e) {}
      FIN_HandleLineSlipImage(event.message.id, userId, roomId, replyToken);
      return;
    }

    if (event.message.type === "location") {
      RT_HandleLineLocationMessage(event.message, userId, roomId, replyToken);
      return;
    }

    if (event.message.type === "text") {
      var userText = DB_SanitizeText(event.message.text);
      if (!userText) return;

      var mProdPhoto = userText.match(/^(?:ดูรูปสินค้า_|ดูรูปส่งของ\s*)(.+)$/i);
      if (mProdPhoto) {
        RT_ReplyDeliveredProductPhoto("LINE", replyToken, mProdPhoto[1].trim(), roomId);
        return;
      }

      RT_ProcessCommand("LINE", userId, groupId, replyToken, null, userText);
    }
  } catch (err) {
    Logger.log("RT_HandleLineEvent Error: " + err.message);
  }
}

function RT_ReplyDeliveredProductPhoto(platform, tokenOrChat, billRef, roomId) {
  var tx = DB_FindTxByBillNo(billRef);
  if (!tx) {
    var allTx = DB_GetTransactions();
    var targetStoreNorm = normalizeStoreName(billRef);
    for (var i = allTx.length - 1; i >= 0; i--) {
      if (normalizeStoreName(allTx[i].store) === targetStoreNorm && allTx[i].slipUrl) {
        tx = allTx[i];
        break;
      }
    }
  }

  var roomInfo = (platform === "LINE" && roomId) ? DB_GetRoomRole(roomId) : { role: "ADMIN" };
  var homeQr = (roomInfo.role === "STORE") ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr();

  if (!tx || !tx.slipUrl) {
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "⚠️ [ไม่พบรูปถ่ายส่งของ]\nไม่พบรูปถ่ายการส่งสินค้าของรายการนี้ในระบบครับ"
    }], homeQr);
    return;
  }

  var imgUrl = getPublicDirectImageUrl(tx.slipUrl);
  if (!imgUrl) {
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "⚠️ [ไม่สามารถเปิดรูปได้]\nลิงก์รูปภาพไม่ถูกต้องครับ"
    }], homeQr);
    return;
  }

  var oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
  var dObj = parseSheetDate(tx.date);
  var dtStr = dObj ? Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yyyy HH:mm น.") : "-";

  var captionFlex = {
    type: "flex",
    altText: "📸 รูปถ่ายส่งแก๊ส (" + oId + ")",
    fallbackText: "📸 รูปถ่ายส่งแก๊ส บิล " + oId + " (" + tx.store + ")",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1B873F",
        paddingAll: "12px",
        contents: [
          { type: "text", text: "📸 หลักฐานการจัดส่ง (" + oId + ")", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "🏪 " + tx.store, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "🚚 ผู้ส่ง: " + tx.sender + " • 🕒 เวลา: " + dtStr, size: "xxs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [
    { type: "image", originalContentUrl: imgUrl, previewImageUrl: imgUrl },
    captionFlex
  ], homeQr);
}

// ============================================================================
// 💳 ส่วนที่ 5: ระบบรับรูปสลิป แยกห้อง STAFF / STORE / ADMIN (แก้ Admin เงียบ 100%)
// ============================================================================

function UI_BuildCleanCustomerThankFlex(cleanStoreName, refLabel, amountNum) {
  return {
    type: "flex",
    altText: "✅ ขอบคุณค่ะ รับยอดชำระเรียบร้อยค่ะ",
    fallbackText: "✅ ขอบคุณค่ะ รับยอดชำระเรียบร้อยค่ะ\nร้าน: " + cleanStoreName + "\nรายการ: " + refLabel + " (" + Number(amountNum || 0).toLocaleString("en") + " บาท)",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1B873F",
        paddingAll: "13px",
        contents: [
          { type: "text", text: "✅ ขอบคุณค่ะ รับยอดชำระเรียบร้อยค่ะ", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "13px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "🏪 " + cleanStoreName, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "🧾 " + refLabel + " • ยอด " + Number(amountNum || 0).toLocaleString("en") + " บาท", size: "xs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "📌 สถานะ: ชำระแล้วค่ะ 🙏💙", size: "xs", weight: "bold", color: "#2E7D32", maxLines: 1 }
        ]
      }
    }
  };
}

/**
 * ปลดล็อกให้ Admin ส่งสลิปได้ทั้งในกลุ่ม Admin และแชทส่วนตัว 1-ต่อ-1 โดยไม่ถูกบล็อกเป็น UNBOUND
 */
function FIN_HandleLineSlipImage(messageId, userId, arg3, arg4) {
  var groupId = arg4 ? arg3 : (arg3 && arg3 !== userId ? arg3 : null);
  var replyToken = arg4 ? arg4 : arg3;
  var roomId = groupId || userId;
  var lineToken = getConfigLineToken();
  if (!lineToken) return;

  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();

  var matchTsStr = props.getProperty("pending_match_timestamp_" + userId);
  if (matchTsStr && ((new Date().getTime() - parseInt(matchTsStr, 10)) > 180000)) {
    FIN_ClearManualMatchSession(props, cache, userId, roomId);
  }

  var roomInfo = DB_GetRoomRole(roomId);
  var hasActiveStaffFlow = (typeof Staff_GetFlowState === "function") ? Boolean(Staff_GetFlowState(userId, roomId)) : false;

  // 1. ห้องคิวส่งแก๊ส (STAFF): รับเฉพาะรูปส่งงานเมื่อลูกน้องกดเข้าโหมดส่งงานเท่านั้น
  if (roomInfo.role === "STAFF") {
    if (!hasActiveStaffFlow) return;
    var imgRespStaff = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", {
      method: "get", headers: { "Authorization": "Bearer " + lineToken }, muteHttpExceptions: true
    });
    if (imgRespStaff.getResponseCode() !== 200) return;
    var blobStaff = imgRespStaff.getBlob().setName("StaffImg_" + messageId + ".jpg");
    Staff_HandleIncomingPhoto("LINE", userId, roomId, replyToken, blobStaff);
    return;
  }

  // 2. เช็คว่าเป็นห้องลูกค้า (STORE) หรือเป็น Admin (กลุ่ม Admin / แชทส่วนตัวแอดมิน)
  var isStoreRoom = (roomInfo.role === "STORE" && roomInfo.storeData);
  var isAdminRoomOrUser = (roomInfo.role === "ADMIN") ||
                          (!groupId) ||
                          (props.getProperty("is_admin_" + userId) === "true") ||
                          Boolean(props.getProperty("pending_match_order_ids_" + userId));

  // ถ้าเป็นกลุ่มอื่นที่ไม่ได้ผูก (และไม่ใช่แอดมิน) ให้เงียบ
  if (!isStoreRoom && !isAdminRoomOrUser) {
    return;
  }

  var imgResp = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", {
    method: "get", headers: { "Authorization": "Bearer " + lineToken }, muteHttpExceptions: true
  });
  if (imgResp.getResponseCode() !== 200) return;

  var blob = imgResp.getBlob().setName("Img_" + messageId + ".jpg");

  if (hasActiveStaffFlow && typeof Staff_HandleIncomingPhoto === "function") {
    var handledByStaffFlow = Staff_HandleIncomingPhoto("LINE", userId, roomId, replyToken, blob);
    if (handledByStaffFlow) return;
  }

  var ss = DB_GetSpreadsheet();
  processAndMatchSlip(blob, getTargetSheet(ss), getColumnIndexes(), props, userId, isStoreRoom ? roomId : groupId, replyToken, "LINE", null);
}

function FIN_ApplySlipUrlToBills(platform, tokenOrChat, billsArray, slipUrl, billingIdTag, userId, roomId, sourceCycleOptional) {
  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var transferTimeStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  var summaryLines = [];

  var detectedCreditCycle = sourceCycleOptional || "";
  if (!detectedCreditCycle && billsArray && billsArray.length > 0) {
    var stCheck = DB_GetStoreById(billsArray[0].store);
    if (stCheck && (stCheck.creditTerm === "15" || stCheck.creditTerm === "30")) {
      detectedCreditCycle = stCheck.creditTerm;
    }
  }

  var autoBatchTag = billingIdTag;
  if (!autoBatchTag && billsArray && billsArray.length > 1) {
    var stMatch = String(billsArray[0].store || "").match(/\[(ST-\d+)\]/i);
    var stCode = stMatch ? stMatch[1].toUpperCase() : "BATCH";
    autoBatchTag = "INV-" + stCode + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd");
  }

  for (var i = 0; i < (billsArray || []).length; i++) {
    var b = billsArray[i];
    if (b.rowIdx) {
      if (autoBatchTag) {
        sheet.getRange(b.rowIdx, idxMap.billingId + 1).setValue(autoBatchTag);
      }
      var safeOrderId = String(b.id || ("#" + (b.rowIdx - 1)));
      if (safeOrderId.indexOf("#") !== 0) safeOrderId = "#" + safeOrderId;
      sheet.getRange(b.rowIdx, idxMap.orderId + 1, 1, 4).setValues([[safeOrderId, "ชำระแล้ว", slipUrl, transferTimeStr]]);
      var cleanStoreLabel = DB_CleanStorePrefix(b.store);
      summaryLines.push("• " + cleanStoreLabel + " " + safeOrderId + " (แถว " + b.rowIdx + " : " + Number(b.amount || 0).toLocaleString("en") + " บ.)");
    }
  }

  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  FIN_ClearManualMatchSession(props, cache, userId, roomId);
  DB_ClearTxCache(billsArray && billsArray.length > 0 ? billsArray[0].store : null);

  var batchHeader = autoBatchTag ? ("📦 รหัสชุดบิล: " + autoBatchTag + "\n") : "";

  if (detectedCreditCycle === "15" || detectedCreditCycle === "30") {
    var cycleCmd = detectedCreditCycle === "30" ? "invoice30" : "invoice15";
    var cycleLabel = detectedCreditCycle === "30" ? "เครดิต 30 วัน" : "เครดิต 15 วัน";
    var nextCreditRes = buildTransientCreditMessages(cycleLabel, 1, null, sheet, idxMap, detectedCreditCycle, userId);

    var doneCreditFlex = {
      type: "flex",
      altText: "✅ ตัดยอด " + cycleLabel + " สำเร็จ!",
      fallbackText: "✅ [ตัดยอดสำเร็จ]\n" + batchHeader + summaryLines.join("\n") + "\nสถานะ: ชำระแล้ว",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1B873F",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ ตัดยอด " + cycleLabel + " สำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            (autoBatchTag
              ? { type: "text", text: "📦 รหัสชุดบิล: " + autoBatchTag, size: "xs", weight: "bold", color: "#0288D1", maxLines: 1 }
              : { type: "text", text: "🧾 รายการที่ตัดยอด:", size: "xs", weight: "bold", color: "#111111", maxLines: 1 }),
            { type: "text", text: summaryLines.join("\n"), size: "xs", weight: "bold", color: "#111111", wrap: true },
            { type: "text", text: "📸 บันทึกลิงก์สลิปลงช่อง X เรียบร้อย", size: "xxs", weight: "bold", color: "#2E7D32", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E0E0E0" },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              margin: "sm",
              contents: [
                UI_MakeFlexBoxBtn("🧾 ดู " + cycleLabel, cycleCmd, "#1DA1DB", "#FFFFFF", "xs"),
                UI_MakeFlexBoxBtn("🎛️ เมนูหลัก", "1003", "#F4F5F7", "#111111", "xs")
              ]
            }
          ]
        }
      }
    };

    var replyCreditBubbles = [doneCreditFlex];
    if (nextCreditRes && nextCreditRes.messages && nextCreditRes.messages.length > 0) {
      replyCreditBubbles.push(nextCreditRes.messages[0]);
    }
    MSG_SendReply(platform, tokenOrChat, replyCreditBubbles, UI_GetAdminHomeQr());
    TG_SendNotification("✅ [ตัดยอด " + cycleLabel + "]\n" + batchHeader + summaryLines.join("\n") + "\n📸 สลิปช่อง X: " + slipUrl);
    return;
  }

  var remainingPending = FIN_GetFilteredPendingRows(null);

  var doneFlex = {
    type: "flex",
    altText: "✅ ตัดยอดและผูกสลิปช่อง X สำเร็จ!",
    fallbackText: "✅ [ตัดยอดสำเร็จ]\n" + batchHeader + summaryLines.join("\n") + "\nสถานะ: ชำระแล้ว",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "✅ ตัดยอดและผูกสลิปสำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          (autoBatchTag
            ? { type: "text", text: "📦 รหัสชุดบิล: " + autoBatchTag, size: "xs", weight: "bold", color: "#0288D1", maxLines: 1 }
            : { type: "text", text: "🧾 รายการที่ตัดยอด:", size: "xs", weight: "bold", color: "#111111", maxLines: 1 }),
          { type: "text", text: summaryLines.join("\n"), size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "📸 บันทึกลิงก์สลิปลงช่อง X เรียบร้อย", size: "xxs", weight: "bold", color: "#2E7D32", maxLines: 1 },
          { type: "text", text: "⏳ บิลรอโอนคงเหลือ: " + remainingPending.length + " รายการ", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              UI_MakeFlexBoxBtn("⏳ บิลรอโอน (" + remainingPending.length + ")", "pending", "#0288D1", "#FFFFFF", "xs"),
              UI_MakeFlexBoxBtn("🎛️ เมนูหลัก", "1003", "#F4F5F7", "#111111", "xs")
            ]
          }
        ]
      }
    }
  };

  var replyBubbles = [doneFlex];
  if (remainingPending.length > 0) {
    var nextItem = remainingPending[0].tx;
    var nextDate = remainingPending[0].dateObj;
    var nextPages = Math.ceil(remainingPending.length / 2);
    replyBubbles.push(FIN_BuildPendingBillFlexBubble(nextItem, nextDate, 1, nextPages, remainingPending.length, null, true));
  }

  MSG_SendReply(platform, tokenOrChat, replyBubbles, UI_GetAdminHomeQr());
  TG_SendNotification("✅ [ตัดยอดสลิปสำเร็จ]\n" + batchHeader + summaryLines.join("\n") + "\n📸 สลิปช่อง X: " + slipUrl);
}

/**
 * ระบบจับคู่สลิปอัจฉริยะ (ลูกค้าส่ง = ขอบคุณ+การ์ดสั่งแก๊ส / แอดมินส่ง = เด้งการ์ดเลือกบิลค้าง 100% ห้ามเงียบ!)
 */
function processAndMatchSlip(blob, sheet, idxMap, props, userId, groupId, replyToken, platform, chatId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var tokenOrChat = (platform === "LINE") ? replyToken : chatId;
    var roomId = groupId || userId;
    var cache = CacheService.getScriptCache();
    var incomingMsgId = cache.get("ACTIVE_IMG_MSG_ID_" + roomId) || "";

    var pendingOrderIdsStr = props.getProperty("pending_match_order_ids_" + userId) ||
                             (roomId ? props.getProperty("pending_match_order_ids_" + roomId) : null);
    var timestampStr = props.getProperty("pending_match_timestamp_" + userId);
    var activeBillingId = props.getProperty("pending_match_active_billing_id_" + userId) || "";

    if (timestampStr && ((new Date().getTime() - parseInt(timestampStr, 10)) > 180000)) {
      FIN_ClearManualMatchSession(props, cache, userId, roomId);
      pendingOrderIdsStr = null;
    }

    var folder = DB_GetSharedFolder("Gas_Transfer_Slips");
    var file = folder.createFile(blob);
    var fileId = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var transferTimeStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

    // 1. กรณีแอดมินกดปุ่ม "📲 จับคู่สลิป" ล็อกบิลไว้ก่อนหน้า (ภายใน 3 นาที)
    if (pendingOrderIdsStr) {
      var targetIds = pendingOrderIdsStr.split(",");
      var matchedBills = [];

      for (var t = 0; t < targetIds.length; t++) {
        var found = DB_FindTxByBillNo(targetIds[t]);
        if (found) {
          var dispId = found.orderId.indexOf("#") === 0 ? found.orderId : "#" + found.orderId;
          matchedBills.push({ id: dispId, amount: found.total, store: found.store, rowIdx: found.rowIdx });
        }
      }
      if (matchedBills.length > 0) {
        FIN_ApplySlipUrlToBills(platform, tokenOrChat, matchedBills, directUrl, activeBillingId, userId, roomId);
        return;
      }
    }

    // 🏪 2. กรณีส่งรูปในห้อง LINE ร้านค้าลูกค้า (STORE)
    var storeObj = groupId ? DB_GetStoreByGroupId(groupId) : null;
    if (storeObj) {
      var ocrStore = FIN_ExtractSlipInfoOCR(fileId);
      var storeOcrAmounts = ocrStore.amounts || [];

      if (!ocrStore.isBankSlip || !ocrStore.isValidRecipient) {
        try { file.setTrashed(true); } catch (e) {}
        return;
      }

      var cleanStoreName = DB_CleanStorePrefix(storeObj.storeName, storeObj.storeId);
      var normStore = normalizeStoreName(cleanStoreName);
      var debtDetails = DB_GetStoreDebtDetails(cleanStoreName);
      var unpaidBills = debtDetails.bills || [];

      var allPendingQueues = DB_GetPendingOrders(false);
      var storeQueues = [];
      for (var qIdx = 0; qIdx < allPendingQueues.length; qIdx++) {
        if (normalizeStoreName(allPendingQueues[qIdx].store) === normStore) {
          storeQueues.push(allPendingQueues[qIdx]);
        }
      }

      // 2A. ส่งสลิปล่วงหน้าก่อนสั่งแก๊ส
      if (unpaidBills.length === 0 && storeQueues.length === 0) {
        DB_SavePrepaidStoreSlip(storeObj.storeId, directUrl, storeOcrAmounts);
        FIN_SaveSlipMessageMap(incomingMsgId, {
          type: "PREPAID",
          storeId: storeObj.storeId,
          storeName: cleanStoreName,
          fileId: fileId,
          directUrl: directUrl
        });
        sendTelegramPhoto(directUrl, "🤫 [ลูกค้าส่งสลิปล่วงหน้า] " + cleanStoreName + " (ยอด: " + (storeOcrAmounts.join(", ") || "-") + " บ.)");
        return;
      }

      // 2B. มีคิวรอส่ง (#Q...)
      if (storeQueues.length > 0 && unpaidBills.length === 0) {
        var matchedQ = null;
        for (var sq = storeQueues.length - 1; sq >= 0; sq--) {
          if (storeOcrAmounts.indexOf(Math.round(storeQueues[sq].total)) !== -1) {
            matchedQ = storeQueues[sq];
            break;
          }
        }
        if (!matchedQ) {
          try { file.setTrashed(true); } catch (e) {}
          return;
        }

        DB_SavePrepaidStoreSlip(storeObj.storeId, directUrl, [Math.round(matchedQ.total)]);
        DB_MarkQueuePrepaidSlipById(matchedQ.orderId, directUrl);
        FIN_SaveSlipMessageMap(incomingMsgId, {
          type: "QUEUE",
          storeId: storeObj.storeId,
          storeName: cleanStoreName,
          queueOrderId: matchedQ.orderId,
          fileId: fileId,
          directUrl: directUrl
        });

        var qThankCard = UI_BuildCleanCustomerThankFlex(cleanStoreName, "ออร์เดอร์ " + matchedQ.orderId, matchedQ.total);
        var qOrderCard = (typeof STD_BuildInstantOrderMenuBubble_ === "function") ? STD_BuildInstantOrderMenuBubble_(storeObj, cleanStoreName) : null;
        var qBubbles = qOrderCard ? [qThankCard, qOrderCard] : [qThankCard];
        MSG_SendReply(platform, tokenOrChat, qBubbles, UI_GetStoreHomeQr());
        sendTelegramPhoto(directUrl, "✅ [Auto-Match สลิปคิวสั่งแก๊ส] " + cleanStoreName + " " + matchedQ.orderId + " (" + matchedQ.total.toLocaleString("en") + " บ.)");
        return;
      }

      // 2C. มีบิลค้างชำระในรายงานขาย
      var billsToClear = [];
      var totalDebtRound = Math.round(debtDetails.pendingDebt);

      if (storeOcrAmounts.indexOf(totalDebtRound) !== -1) {
        billsToClear = unpaidBills;
      } else {
        for (var bIdx = 0; bIdx < unpaidBills.length; bIdx++) {
          if (storeOcrAmounts.indexOf(Math.round(unpaidBills[bIdx].amount)) !== -1) {
            billsToClear = [unpaidBills[bIdx]];
            break;
          }
        }
      }

      if (billsToClear.length === 0) {
        try { file.setTrashed(true); } catch (e) {}
        return;
      }

      var batchTag = billsToClear.length > 1 ? ("INV-" + storeObj.storeId + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd")) : "";
      var clearedIds = [];
      var clearedSum = 0;
      var unsendBillRecords = [];

      for (var c = 0; c < billsToClear.length; c++) {
        var bTarget = billsToClear[c];
        if (bTarget.rowIdx) {
          var prevSt = String(sheet.getRange(bTarget.rowIdx, idxMap.status + 1).getValue() || "รอตรวจสอบ").trim();
          if (batchTag) sheet.getRange(bTarget.rowIdx, idxMap.billingId + 1).setValue(batchTag);
          var safeId = String(bTarget.orderId || ("#" + (bTarget.rowIdx - 1)));
          if (safeId.indexOf("#") !== 0) safeId = "#" + safeId;
          sheet.getRange(bTarget.rowIdx, idxMap.orderId + 1, 1, 4).setValues([[safeId, "ชำระแล้ว", directUrl, transferTimeStr]]);
          clearedIds.push(safeId);
          clearedSum += bTarget.amount;
          unsendBillRecords.push({
            rowIdx: bTarget.rowIdx,
            orderId: safeId,
            prevStatus: prevSt === "ชำระแล้ว" ? "รอตรวจสอบ" : prevSt,
            amount: bTarget.amount
          });
        }
      }
      DB_ClearTxCache(storeObj.storeName);

      FIN_SaveSlipMessageMap(incomingMsgId, {
        type: "BILLS",
        storeId: storeObj.storeId,
        storeName: cleanStoreName,
        fileId: fileId,
        directUrl: directUrl,
        bills: unsendBillRecords
      });

      var billThankCard = UI_BuildCleanCustomerThankFlex(cleanStoreName, "บิล " + clearedIds.join(", "), clearedSum);
      var orderMenuCard = (typeof STD_BuildInstantOrderMenuBubble_ === "function") ? STD_BuildInstantOrderMenuBubble_(storeObj, cleanStoreName) : null;
      var storeReplyBubbles = orderMenuCard ? [billThankCard, orderMenuCard] : [billThankCard];
      MSG_SendReply(platform, tokenOrChat, storeReplyBubbles, UI_GetStoreHomeQr());
      sendTelegramPhoto(directUrl, "✅ [Auto-Match สลิปลูกค้า] " + cleanStoreName + " ตัดบิล " + clearedIds.join(", ") + " (" + clearedSum.toLocaleString("en") + " บ.)");
      return;
    }

    // 👑 3. กรณีส่งรูปสลิปในหน้า Admin (ห้ามลบรูปและห้ามเงียบเด็ดขาด 100%!)
    var ocrInfo = FIN_ExtractSlipInfoOCR(fileId);
    var ocrAmounts = ocrInfo.amounts || [];

    cache.put("UNMATCHED_SLIP_" + userId, directUrl, 300);
    if (roomId) cache.put("UNMATCHED_SLIP_" + roomId, directUrl, 300);
    cache.put("UNMATCHED_SLIP_GLOBAL", directUrl, 300);

    var storeTermMap = {};
    var allStoresList = DB_GetAllActiveStores();
    for (var s = 0; s < allStoresList.length; s++) {
      storeTermMap[allStoresList[s].storeName] = allStoresList[s].creditTerm || "";
    }

    var allTx = DB_GetTransactions(false);
    var unpaidTransferBills = [];
    var storeBatchTotals = {};

    for (var i = allTx.length - 1; i >= 0; i--) {
      var tx = allTx[i];
      if (!tx || tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
      if (String(tx.status || "").indexOf("ชำระแล้ว") !== -1) continue;

      var rDate = parseSheetDate(tx.date, tx.rowIdx);
      if (!rDate) continue;

      var cTerm = storeTermMap[tx.store] || "";
      var isCreditStore = (cTerm === "15" || cTerm === "30");
      if (!isCreditStore && tx.rowIdx < 385) continue;
      if (isCreditStore && tx.rowIdx < 290) continue;

      var minCutoff = isCreditStore ? CONFIG.CUTOFF_CREDIT : CONFIG.CUTOFF_PENDING;
      if (rDate < minCutoff) continue;

      var payStr = String(tx.payMethod || "");
      if (payStr.indexOf("โอน") !== -1 || payStr.indexOf("ผสม") !== -1 || payStr.indexOf("เครดิต") !== -1) {
        var remainAmt = (payStr.indexOf("ผสม") !== -1) ? Math.max(0, tx.total - (tx.cashReceived || 0)) : tx.total;
        if (remainAmt <= 0) continue;
        tx._remainAmt = remainAmt;
        unpaidTransferBills.push(tx);
        if (!storeBatchTotals[tx.store]) storeBatchTotals[tx.store] = { total: 0, count: 0, bills: [] };
        storeBatchTotals[tx.store].total += remainAmt;
        storeBatchTotals[tx.store].count += 1;
        storeBatchTotals[tx.store].bills.push(tx);
      }
    }

    if (unpaidTransferBills.length === 0) {
      MSG_SendReply(platform, tokenOrChat, [{
        type: "text",
        text: "📸 [บันทึกรูปสลิปสำเร็จ]\nบันทึกรูปสลิปลงระบบแล้วครับ ปัจจุบันไม่มีบิลค้างโอนในระบบครับ"
      }], UI_GetAdminHomeQr());
      return;
    }

    var exactMatchedCandidates = [];
    var seenStoresInExact = {};

    var stKeysAll = Object.keys(storeBatchTotals);
    for (var sk = 0; sk < stKeysAll.length; sk++) {
      var stNameKey = stKeysAll[sk];
      var batchObj = storeBatchTotals[stNameKey];
      if (batchObj.count > 1 && ocrAmounts.indexOf(Math.round(batchObj.total)) !== -1) {
        var stMetaObj = DB_GetStoreById(stNameKey);
        if (stMetaObj) {
          seenStoresInExact[stNameKey] = true;
          exactMatchedCandidates.push({
            isBatch: true,
            storeId: stMetaObj.storeId,
            storeName: stNameKey,
            amount: batchObj.total,
            count: batchObj.count,
            cmd: "bind_store_" + stMetaObj.storeId,
            bills: batchObj.bills.map(function(x) {
              return { id: x.orderId, store: x.store, amount: x._remainAmt || x.total, rowIdx: x.rowIdx };
            }),
            detailDesc: "รวบยอด " + batchObj.count + " บิล"
          });
        }
      }
    }

    for (var ub = 0; ub < unpaidTransferBills.length; ub++) {
      var candTx = unpaidTransferBills[ub];
      var candAmt = candTx._remainAmt || candTx.total;
      if (ocrAmounts.indexOf(Math.round(candAmt)) !== -1 && !seenStoresInExact[candTx.store]) {
        var dCand = parseSheetDate(candTx.date, candTx.rowIdx);
        var dtShort = dCand ? Utilities.formatDate(dCand, "GMT+7", "dd/MM/yy") : "-";
        var itArr = [];
        if (candTx.g15 > 0) itArr.push("15กก.(" + candTx.g15 + ")");
        if (candTx.g48 > 0) itArr.push("48กก.(" + candTx.g48 + ")");
        if (candTx.cans > 0) itArr.push("ลัง(" + candTx.cans + ")");
        var oIdCand = candTx.orderId.indexOf("#") === 0 ? candTx.orderId : "#" + candTx.orderId;

        exactMatchedCandidates.push({
          isBatch: false,
          storeName: candTx.store,
          orderId: oIdCand,
          rowIdx: candTx.rowIdx,
          dateStr: dtShort,
          itemDesc: itArr.join(", ") || "-",
          amount: candAmt,
          cmd: "bind_slip_ROW-" + candTx.rowIdx,
          bills: [{ id: oIdCand, store: candTx.store, amount: candAmt, rowIdx: candTx.rowIdx }],
          detailDesc: oIdCand + " (" + dtShort + ") • " + itArr.join(",")
        });
      }
    }

    // ถ้าตรงกับบิลเดียวเป๊ะ ตัดยอดให้อัตโนมัติทันที!
    if (exactMatchedCandidates.length === 1) {
      var soleWinner = exactMatchedCandidates[0];
      var batchTagAuto = soleWinner.isBatch ? ("INV-" + soleWinner.storeId + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd")) : "";
      FIN_ApplySlipUrlToBills(platform, tokenOrChat, soleWinner.bills, directUrl, batchTagAuto, userId, roomId);
      return;
    }

    // ถ้าตรงหลายร้าน หรือ OCR อ่านยอดไม่ตรง -> แสดงการ์ดรายการบิลที่ยังไม่จ่ายให้แอดมินกดเลือกทันที!
    var pickerRows = [];
    if (exactMatchedCandidates.length > 1) {
      pickerRows.push({
        type: "text",
        text: "⚠️ พบ " + exactMatchedCandidates.length + " รายการที่มียอด " + exactMatchedCandidates[0].amount.toLocaleString("en") + " บ. เท่ากัน แตะเลือกร้านได้เลยครับ:",
        size: "xs",
        weight: "bold",
        color: "#E65100",
        wrap: true
      });

      for (var cIdx = 0; cIdx < exactMatchedCandidates.length; cIdx++) {
        var cItem = exactMatchedCandidates[cIdx];
        var cleanSt = DB_CleanStorePrefix(cItem.storeName);
        pickerRows.push({
          type: "box",
          layout: "vertical",
          backgroundColor: "#E8F5E9",
          borderColor: "#2E7D32",
          borderWidth: "1px",
          cornerRadius: "8px",
          paddingAll: "10px",
          margin: "xs",
          action: { type: "message", label: cleanSt.substring(0, 20), text: cItem.cmd },
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "🏪 " + cleanSt, size: "xs", weight: "bold", color: "#111111", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
                { type: "text", text: cItem.amount.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#2E7D32", align: "end", flex: 2, maxLines: 1 }
              ]
            },
            {
              type: "text",
              text: "🧾 " + cItem.detailDesc + " (แถว " + (cItem.rowIdx || "-") + ")",
              size: "xxs",
              color: "#333333",
              margin: "xs",
              maxLines: 1,
              adjustMode: "shrink-to-fit"
            }
          ]
        });
      }
    } else {
      var ocrHint = ocrAmounts.length > 0 ? ("🔍 ยอดในสลิป: " + ocrAmounts.join(", ") + " บ. • แตะบิลค้างด้านล่างเพื่อจับคู่:") : "⏱️ แตะเลือกบิลที่ยังไม่ชำระด้านล่างเพื่อผูกสลิปลงช่อง X:";
      pickerRows.push({
        type: "text",
        text: ocrHint,
        size: "xxs",
        weight: "bold",
        color: "#E65100",
        wrap: true
      });

      for (var sIdx = 0; sIdx < Math.min(stKeysAll.length, 3); sIdx++) {
        var sName = stKeysAll[sIdx];
        var bInfo = storeBatchTotals[sName];
        if (bInfo.count > 1) {
          var stMeta = DB_GetStoreById(sName);
          if (stMeta && stMeta.storeId) {
            var shortSt = sName.replace(/(\[ST-\d+\]\s*)+/gi, "");
            pickerRows.push(UI_MakeAppleRowBtn(
              "📦 รวบยอด " + shortSt + " (" + bInfo.count + " บิล)",
              bInfo.total.toLocaleString("en") + " บ.",
              "bind_store_" + stMeta.storeId,
              "#FFF8F0",
              "#FFCC80"
            ));
          }
        }
      }

      for (var p = 0; p < Math.min(unpaidTransferBills.length, 6); p++) {
        var bItem = unpaidTransferBills[p];
        var bAmt = bItem._remainAmt || bItem.total;
        var oId = bItem.orderId.indexOf("#") === 0 ? bItem.orderId : "#" + bItem.orderId;
        var rowKey = "ROW-" + bItem.rowIdx;
        var dItem = parseSheetDate(bItem.date, bItem.rowIdx);
        var dtItemStr = dItem ? Utilities.formatDate(dItem, "GMT+7", "dd/MM/yy") : "-";
        var shortStore = bItem.store.replace(/(\[ST-\d+\]\s*)+/gi, "");

        pickerRows.push(UI_MakeAppleRowBtn(
          "🧾 " + oId + " " + shortStore + " (" + dtItemStr + ")",
          bAmt.toLocaleString("en") + " บ.",
          "bind_slip_" + rowKey,
          "#F0F8FC",
          "#1DA1DB"
        ));
      }
    }

    pickerRows.push(UI_MakeFlexBoxBtn("❌ ยกเลิก / ไม่ผูกสลิปใบนี้", "match CANCEL", "#FFF3E0", "#B71C1C", "xs", "#FFCC80"));

    var pickerFlex = {
      type: "flex",
      altText: "📸 เลือกบิลค้างชำระเพื่อผูกกับสลิปโอนเงิน",
      fallbackText: "📸 รับรูปสลิปโอนเงินแล้ว! กดปุ่มเลือกร้านค้า/บิลด้านล่างเพื่อตัดยอดครับ",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "📸 เลือกบิลค้างชำระสำหรับสลิปนี้", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "แตะบิลด้านล่างเพื่อเปลี่ยนเป็น ชำระแล้ว & บันทึกสลิปช่อง X", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: pickerRows
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [pickerFlex], UI_GetAdminHomeQr());
  } catch (e) {
    Logger.log("processAndMatchSlip Error: " + e.message);
  } finally {
    try { lock.releaseLock(); } catch (eLock) {}
  }
}

// ============================================================================
// 🚚 ส่วนที่ 6: การ์ดคิวส่งแก๊ส & แก้ไขข้อมูลร้านค้ารายช่อง
// ============================================================================

function UI_FilterToSingleHomeQr(quickReplyItems) {
  if (!quickReplyItems || quickReplyItems.length === 0) return [];
  var locItems = quickReplyItems.filter(function(it) { return it.action && it.action.type === "location"; });
  var baseHome = [];

  for (var i = 0; i < quickReplyItems.length; i++) {
    var act = quickReplyItems[i].action;
    if (act && act.text === "1003") { baseHome = UI_GetAdminHomeQr(); break; }
  }
  if (baseHome.length === 0) {
    for (var j = 0; j < quickReplyItems.length; j++) {
      var act2 = quickReplyItems[j].action;
      if (act2 && act2.text === "order ส่งแก๊สวันนี้") { baseHome = UI_GetStaffHomeQr(); break; }
    }
  }
  if (baseHome.length === 0) {
    for (var k = 0; k < quickReplyItems.length; k++) {
      var act3 = quickReplyItems[k].action;
      if (act3 && (act3.text === "เลือกประเภทแก๊ส" || act3.text === "update" || (act3.text && act3.text.indexOf("เลือก_") === 0))) {
        baseHome = UI_GetStoreHomeQr();
        break;
      }
    }
  }
  if (baseHome.length === 0) baseHome = [quickReplyItems[quickReplyItems.length - 1]];
  return locItems.concat(baseHome);
}

function RT_StartSingleFieldEditWizard(platform, userId, tokenOrChat, storeId, fieldKey) {
  var st = DB_GetStoreById(storeId);
  if (!st) return;

  var keyLow = String(fieldKey || "").toLowerCase();
  var labels = {
    "storename": "ชื่อร้าน (StoreName)",
    "phone": "เบอร์โทรศัพท์ (เช่น 064-994-9565)",
    "googlemap": "พิกัดร้าน (กดปุ่ม แชร์ตำแหน่งที่ตั้ง ด้านล่างได้เลย)",
    "price15": "ราคาถัง 15 กก. (Price15)",
    "price48": "ราคาถัง 48 กก. (Price48)",
    "pricecan": "ราคาแก๊สกระป๋อง (PriceCan)",
    "alias": "คำเรียกย่อ / ฉายา (Alias)",
    "status": "สถานะร้าน (Active / Inactive)"
  };
  var fieldLabel = labels[keyLow] || fieldKey;

  DB_SetSession(userId, "edit_store_wiz", JSON.stringify({ storeId: st.storeId, fieldKey: keyLow, label: fieldLabel }), 600);

  var bodyContents = [
    { type: "text", text: "พิมพ์ค่าใหม่สำหรับ \"" + fieldLabel + "\" ได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true }
  ];

  var qrList = UI_GetAdminHomeQr();
  if (keyLow === "googlemap") {
    bodyContents.push({
      type: "text",
      text: "📍 แตะปุ่ม 'แชร์ตำแหน่งที่ตั้ง' ด้านล่าง หรือวางลิงก์ Google Maps ได้เลยครับ",
      size: "xxs",
      color: "#1B5E20",
      wrap: true
    });
    qrList = [
      { type: "action", action: { type: "location", label: "📍 แชร์ตำแหน่งที่ตั้ง" } },
      { type: "action", action: { type: "message", label: "🎛️ เมนูหลัก", text: "1003" } }
    ];
  }

  bodyContents.push(UI_MakeFlexBoxBtn("❌ ยกเลิก", "ตั้งค่าร้าน_" + st.storeId, "#FFF3E0", "#B71C1C", "xs", "#FFCC80"));

  var askFlex = {
    type: "flex",
    altText: "✏️ แก้ไข " + fieldLabel + " (" + st.storeName + ")",
    fallbackText: "✏️ [แก้ไข " + fieldLabel + ": " + st.storeName + "]",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "✏️ แก้ไขข้อมูลร้านค้า (" + st.storeId + ")", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🏪 " + st.storeName, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: bodyContents
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [askFlex], qrList);
}

function Staff_SelectDriverStep2_Receipt(platform, userId, roomId, tokenOrChat, queueOrderId, driverName, isAdminView) {
  var targetId = String(queueOrderId || "").trim().toUpperCase();
  if (targetId.indexOf("#") !== 0) targetId = "#" + targetId;

  var qItem = DB_GetQueueOrderById(targetId);
  var homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();
  if (!qItem) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "⚠️ [ไม่พบคิวงาน]\nคิว " + targetId + " ถูกส่งแล้วหรือไม่มีในระบบครับ" }], homeQr);
    return;
  }

  var stateObj = {
    step: "WAIT_RECEIPT_IMG",
    queueOrderId: targetId,
    store: qItem.store,
    g15: qItem.g15,
    g48: qItem.g48,
    cans: qItem.cans,
    total: qItem.total,
    driver: driverName,
    receiptUrl: "",
    fuelCost: 0,
    fuelSlipUrl: "",
    payMethod: "",
    transferSlipUrl: ""
  };
  Staff_SaveFlowState(userId, roomId, stateObj);

  var step2Flex = {
    type: "flex",
    altText: "📸 ขั้นตอนที่ 2: ส่งรูปใบเสร็จ/ส่งของ (" + targetId + ")",
    fallbackText: "📸 [ขั้นตอนที่ 2: ส่งรูปใบเสร็จ]\nผู้ส่ง: " + driverName + " | ร้าน: " + qItem.store,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📸 ขั้นตอนที่ 2 : ส่งรูปใบเสร็จ/ส่งของ", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🚚 ผู้ส่ง: " + driverName + " • 🏪 " + qItem.store, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "กรุณาส่ง 'รูปถ่ายใบเสร็จ / รูปส่งถังแก๊ส' ในห้องนี้ได้เลยครับ (ภายใน 5 นาที)", size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "💰 ยอดรวมบิล: " + qItem.total.toLocaleString("en") + " บาท", size: "xs", color: "#1DA1DB", weight: "bold", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("❌ ยกเลิกการส่งงาน", "ยกเลิกส่งงาน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step2Flex], homeQr);
}

function Staff_BuildSingleQueueFlexCard(qItem, indexNum, totalCount, isAdminView, navButtonsOptional) {
  if (!qItem || typeof qItem !== "object") qItem = { orderId: "#Q000", store: "-", time: "-", g15: 0, g48: 0, cans: 0, total: 0 };
  var cleanStore = DB_CleanStorePrefix(qItem.store);
  var storeInfo = DB_GetStoreById(cleanStore) || { storeId: cleanStore, storeName: cleanStore };
  var stCode = storeInfo.storeId || cleanStore;
  var rawBilling = String(storeInfo.billingName || qItem.billingName || cleanStore).trim();
  var bFirstLine = rawBilling.split(/\r?\n|\|/)[0].trim();
  var phone = FMT_FormatThaiPhone(qItem.phone || storeInfo.phone || "-");
  var mapUri = DB_GetStoreGoogleMapUri(storeInfo);
  var isMorningQueue = qItem.note && qItem.note.indexOf("09:00") !== -1;
  var isAlreadyPaidSlip = qItem.note && (qItem.note.indexOf("ชำระ") !== -1 || qItem.note.indexOf("โอน") !== -1);

  // ชุดโทนสี Soft CI 5 เฉดสีสบายตา (สลับตามลำดับคิว ไม่แสบตาเวลาส่ง 4-5 เจ้า)
  var softPalettes = [
    { hdr: "#2B7AC9", badge: "#1DA1DB", boxBg: "#F4FAFF", border: "#BAE6FD", price: "#0284C7", btn: "#2E7D32" },
    { hdr: "#475569", badge: "#334155", boxBg: "#F8FAFC", border: "#CBD5E1", price: "#334155", btn: "#0284C7" },
    { hdr: "#0E7490", badge: "#155E75", boxBg: "#F0FDFA", border: "#99F6E4", price: "#0F766E", btn: "#0F766E" },
    { hdr: "#374151", badge: "#1F2937", boxBg: "#F3F4F6", border: "#D1D5DB", price: "#1F2937", btn: "#2563EB" },
    { hdr: "#4338CA", badge: "#3730A3", boxBg: "#EEF2FF", border: "#C7D2FE", price: "#3730A3", btn: "#3730A3" }
  ];
  var pal = softPalettes[((indexNum || 1) - 1) % softPalettes.length];

  var scheduleText = "⏰ เวลาสั่ง: " + qItem.time;
  var scheduleColor = "#2E7D32";
  if (isMorningQueue) {
    scheduleText = "🌅 รอบจัดส่ง: พรุ่งนี้เช้า 09:00 น.";
    scheduleColor = "#E65100";
  }

  var items = [];
  if (qItem.g15 > 0) items.push("15กก.(" + qItem.g15 + " ถัง)");
  if (qItem.g48 > 0) items.push("48กก.(" + qItem.g48 + " ถัง)");
  if (qItem.cans > 0) items.push("กระป๋อง(" + qItem.cans + " ลัง)");

  var bodyRows = [
    { type: "text", text: "🏪 " + cleanStore, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: "🧾 ออกบิล: " + bFirstLine, size: "xxs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
    {
      type: "box", layout: "horizontal", backgroundColor: pal.boxBg, borderColor: pal.border,
      borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px", margin: "sm",
      contents: [
        { type: "text", text: "📦 " + (items.join(", ") || "-"), size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: Number(qItem.total || 0).toLocaleString("en") + " บ.", size: "sm", weight: "bold", color: pal.price, align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "text", text: scheduleText, size: "xxs", weight: "bold", color: scheduleColor, maxLines: 1, adjustMode: "shrink-to-fit" }
  ];

  if (isAlreadyPaidSlip) {
    bodyRows.push({ type: "text", text: "🟢 โอนชำระแล้ว (มีสลิปในระบบ)", size: "xs", weight: "bold", color: "#1B873F", maxLines: 1 });
  }
  if (phone && phone !== "-") {
    bodyRows.push({ type: "text", text: "📞 โทร: " + phone, size: "xs", weight: "bold", color: "#111111", maxLines: 1 });
  }

  bodyRows.push({ type: "separator", margin: "sm", color: "#E5E5E5" });
  bodyRows.push(UI_MakeFlexBoxBtn("✅ จัดส่งแล้ว " + qItem.orderId + " (กดส่งงาน)", "จัดส่งแล้ว " + qItem.orderId, pal.btn, "#FFFFFF", "sm"));
  bodyRows.push({
    type: "box", layout: "horizontal", spacing: "xs", margin: "xs",
    contents: [
      UI_MakeFlexUriBtn("📍 นำทาง Map", mapUri, "#E8F5E9", "#1B5E20", "xs", "#A5D6A7"),
      UI_MakeFlexBoxBtn("🖨️ ใบเสร็จ JPEG", "ขอดูใบเสร็จ " + qItem.orderId, pal.boxBg, "#111111", "xs", pal.border),
      UI_MakeFlexBoxBtn("✏️ หัวบิล", "แก้ไขหัวบิล_" + stCode, "#F4F5F7", "#111111", "xxs")
    ]
  });

  if (isAdminView) {
    bodyRows.push(UI_MakeFlexBoxBtn("❌ ยกเลิกคิว " + qItem.orderId, "cancel_q_" + qItem.orderId, "#FFF3E0", "#B71C1C", "xxs", "#FFCC80"));
  }
  if (navButtonsOptional && navButtonsOptional.length > 0) {
    bodyRows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: navButtonsOptional });
  }

  return {
    type: "flex",
    altText: "🚚 คิวส่งแก๊ส " + qItem.orderId + " (" + cleanStore + ")",
    fallbackText: "🚚 [คิวที่ " + indexNum + "/" + totalCount + "] (" + qItem.orderId + ") ร้าน: " + cleanStore,
    contents: {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "horizontal", backgroundColor: pal.hdr, paddingAll: "13px", alignItems: "center",
        contents: [
          { type: "text", text: "🚚 คิวส่งแก๊ส " + qItem.orderId, weight: "bold", size: "md", color: "#FFFFFF", flex: 3, maxLines: 1 },
          {
            type: "box", layout: "vertical", backgroundColor: pal.badge, cornerRadius: "6px", paddingAll: "4px", flex: 2,
            contents: [{ type: "text", text: "คิวที่ " + (indexNum || 1) + "/" + (totalCount || 1), size: "xxs", weight: "bold", color: "#FFFFFF", align: "center", maxLines: 1 }]
          }
        ]
      },
      body: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "14px", backgroundColor: "#FFFFFF", contents: bodyRows }
    }
  };
}
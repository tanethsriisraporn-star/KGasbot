// ==========================================
// 🗄️ File: 02_Database.gs
// Version: 47.0 (Google Maps URI Builder, Latest Order Tracker, Store Full Editor & Cash Deposit Log)
// Prefix: DB_
// หมวด 1: CORE & DATABASE (แกนกลางและฐานข้อมูลความเร็วสูง)
// ==========================================

var STORE_MEM_CACHE = null;
var TX_MEM_CACHE = null;
var TX_RECENT_CACHE = null;
var STORE_DEBT_MAP_MEM = null;
var QUEUE_MEM_CACHE = null;
var NORM_NAME_MEMO = {};
var SESSION_MEM_CACHE = {};

// ==========================================
// ⚡ 1. ULTRA-FAST RAM SESSION & CACHE MANAGER
// ==========================================

function DB_GetSession(userId, key) {
  let fullKey = key + "_" + userId;
  if (SESSION_MEM_CACHE[fullKey] !== undefined) return SESSION_MEM_CACHE[fullKey];
  try {
    let cache = CacheService.getScriptCache();
    let val = cache.get("ram_" + fullKey);
    if (val !== null) {
      SESSION_MEM_CACHE[fullKey] = val;
      return val;
    }
    let propVal = PropertiesService.getScriptProperties().getProperty(fullKey);
    if (propVal !== null) {
      cache.put("ram_" + fullKey, propVal, 1800);
      SESSION_MEM_CACHE[fullKey] = propVal;
    }
    return propVal;
  } catch (e) { return null; }
}

function DB_SetSession(userId, key, val, ttlSec) {
  let fullKey = key + "_" + userId;
  let strVal = String(val);
  SESSION_MEM_CACHE[fullKey] = strVal;
  try {
    CacheService.getScriptCache().put("ram_" + fullKey, strVal, ttlSec || 1800);
    PropertiesService.getScriptProperties().setProperty(fullKey, strVal);
  } catch (e) {}
}

function DB_RemoveSession(userId, key) {
  let fullKey = key + "_" + userId;
  delete SESSION_MEM_CACHE[fullKey];
  try {
    CacheService.getScriptCache().remove("ram_" + fullKey);
    PropertiesService.getScriptProperties().deleteProperty(fullKey);
  } catch (e) {}
}

function DB_ClearAdminSession(userId) {
  let prefixes = [
    "locked_store_", "search_mode_", "genlink_mode_", "staff_setting_mode_",
    "reg_wiz_", "edit_store_wiz_", "bill_hdr_wiz_"
  ];
  let cacheKeys = ["focus_type_" + userId];
  let p = PropertiesService.getScriptProperties();

  prefixes.forEach(prefix => {
    let fk = prefix + userId;
    delete SESSION_MEM_CACHE[fk];
    cacheKeys.push("ram_" + fk);
    try { p.deleteProperty(fk); } catch (e) {}
  });
  try { CacheService.getScriptCache().removeAll(cacheKeys); } catch (e) {}
}

// ==========================================
// 👷‍♂️ 2. LIVE STAFF DRIVER MANAGER
// ==========================================

function DB_GetStaffDrivers() {
  try {
    let cache = CacheService.getScriptCache();
    let cached = cache.get("STAFF_DRIVERS_LIST_V47_0");
    if (cached) return JSON.parse(cached);

    let props = PropertiesService.getScriptProperties();
    let raw = props.getProperty("STAFF_DRIVERS_JSON");
    let list = null;
    if (raw) {
      try { list = JSON.parse(raw); } catch (e) {}
    }
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = CONFIG.STAFF_DRIVERS || ["ต่อ", "วัน", "มานพ", "ปาน", "เอิ้น"];
    }
    list = list.map(n => (n === "ป่าน" ? "ปาน" : String(n).trim())).filter(n => n && n !== "ที");
    if (list.length === 0) list = ["ต่อ", "วัน", "มานพ", "ปาน", "เอิ้น"];

    props.setProperty("STAFF_DRIVERS_JSON", JSON.stringify(list));
    cache.put("STAFF_DRIVERS_LIST_V47_0", JSON.stringify(list), 3600);
    return list;
  } catch (e) {
    return ["ต่อ", "วัน", "มานพ", "ปาน", "เอิ้น"];
  }
}

function DB_AddStaffDriver(newName) {
  let clean = DB_SanitizeText(newName).replace(/^[0-9]+\.\s*/, "");
  if (!clean) return { success: false, msg: "กรุณาระบุชื่อพนักงาน" };
  let list = DB_GetStaffDrivers();
  if (list.includes(clean)) return { success: false, msg: `มีชื่อ "${clean}" อยู่ในทีมรับออเดอร์แล้วครับ`, list: list };
  list.push(clean);
  PropertiesService.getScriptProperties().setProperty("STAFF_DRIVERS_JSON", JSON.stringify(list));
  try { CacheService.getScriptCache().put("STAFF_DRIVERS_LIST_V47_0", JSON.stringify(list), 3600); } catch (e) {}
  return { success: true, name: clean, list: list };
}

function DB_RemoveStaffDriver(targetName) {
  let clean = DB_SanitizeText(targetName).replace(/^[0-9]+\.\s*/, "");
  let list = DB_GetStaffDrivers();
  let filtered = list.filter(n => n !== clean);
  if (filtered.length === list.length) {
    return { success: false, msg: `ไม่พบรายชื่อ "${clean}" ในระบบ`, list: list };
  }
  if (filtered.length === 0) {
    return { success: false, msg: "ต้องมีรายชื่อพนักงานอย่างน้อย 1 คนในระบบครับ", list: list };
  }
  PropertiesService.getScriptProperties().setProperty("STAFF_DRIVERS_JSON", JSON.stringify(filtered));
  try { CacheService.getScriptCache().put("STAFF_DRIVERS_LIST_V47_0", JSON.stringify(filtered), 3600); } catch (e) {}
  return { success: true, name: clean, list: filtered };
}

// ==========================================
// 💳 3. PREPAID SLIP MEMORY & CUSTOMER SLIP CONFIRMATION (ANTI-UNSEND)
// ==========================================

function DB_SavePrepaidStoreSlip(storeIdOrName, slipUrl) {
  if (!storeIdOrName || !slipUrl) return;
  let st = DB_GetStoreById(storeIdOrName);
  let keyId = st ? st.storeId : normalizeStoreName(storeIdOrName);
  let propKey = "PREPAID_SLIP_" + keyId;
  let payload = JSON.stringify({
    slipUrl: slipUrl,
    savedAt: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm"),
    ts: new Date().getTime()
  });
  PropertiesService.getScriptProperties().setProperty(propKey, payload);
  try { CacheService.getScriptCache().put(propKey, payload, 21600); } catch (e) {}
}

function DB_PopPrepaidStoreSlip(storeIdOrName) {
  if (!storeIdOrName) return null;
  let st = DB_GetStoreById(storeIdOrName);
  let keyId = st ? st.storeId : normalizeStoreName(storeIdOrName);
  let propKey = "PREPAID_SLIP_" + keyId;
  let cache = CacheService.getScriptCache();
  let props = PropertiesService.getScriptProperties();
  let raw = cache.get(propKey) || props.getProperty(propKey);
  if (!raw) return null;

  try {
    cache.remove(propKey);
    props.deleteProperty(propKey);
    let obj = JSON.parse(raw);
    if (obj && obj.slipUrl && ((new Date().getTime() - (obj.ts || 0)) < 86400000)) {
      return obj;
    }
  } catch (e) {}
  return null;
}

// ==========================================
// 🗄️ 4. CORE SPREADSHEET & SMART DATE PARSER
// ==========================================

function DB_GetSpreadsheet() {
  try {
    if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "") {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
    }
    let activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) return activeSs;
  } catch (e) {
    Logger.log("DB_GetSpreadsheet Error: " + e.message);
  }
  throw new Error("ไม่สามารถเปิดไฟล์ Google Sheets ได้ กรุณาตรวจสอบ 01_Config.gs");
}

function DB_GetSheetSafe(sheetName) {
  let ss = DB_GetSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบแท็บชื่อ "${sheetName}" ใน Google Sheets`);
  return sheet;
}

function getTargetSheet(ss) {
  let targetSs = ss || DB_GetSpreadsheet();
  let sheet = targetSs.getSheetByName(CONFIG.SHEET_MAIN_SALES);
  return sheet ? sheet : targetSs.getSheets()[0];
}

function DB_SanitizeText(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function DB_CleanStorePrefix(rawName, optionalStoreId) {
  let str = DB_SanitizeText(rawName);
  if (!str) return "";

  let m = str.match(/\[(ST-\d+)\]/i);
  let code = m ? m[1].toUpperCase() : (optionalStoreId ? DB_SanitizeText(optionalStoreId).toUpperCase() : "");
  let cleanTitle = str.replace(/(\[ST-\d+\]\s*)+/gi, "").trim();

  if (code && code.startsWith("ST-")) {
    return `[${code}] ${cleanTitle}`;
  }
  return cleanTitle || str;
}

function parseNum(val) {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  var str = String(val).replace(/,/g, "").trim();
  var match = str.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function DB_ParseNum(val) {
  return parseNum(val);
}

function parseSheetDate(raw) {
  if (!raw) return null;
  var nowLimitMs = new Date().getTime() + 43200000;

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    if (raw.getTime() > nowLimitMs && raw.getDate() <= 12) {
      let flipped = new Date(raw.getFullYear(), raw.getDate() - 1, raw.getMonth() + 1, raw.getHours(), raw.getMinutes(), raw.getSeconds());
      if (flipped.getTime() <= nowLimitMs) return flipped;
    }
    return raw;
  }

  if (typeof raw === "number") {
    let dNum = new Date(raw);
    if (isNaN(dNum.getTime())) return null;
    if (dNum.getTime() > nowLimitMs && dNum.getDate() <= 12) {
      let flippedNum = new Date(dNum.getFullYear(), dNum.getDate() - 1, dNum.getMonth() + 1, dNum.getHours(), dNum.getMinutes(), dNum.getSeconds());
      if (flippedNum.getTime() <= nowLimitMs) return flippedNum;
    }
    return dNum;
  }

  var str = String(raw).trim();
  var parts = str.split(/[\/\- :]/);
  if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    var p0 = parseInt(parts[0], 10);
    var p1 = parseInt(parts[1], 10);
    var p2 = parseInt(parts[2], 10);
    var h = parts.length > 3 ? (parseInt(parts[3], 10) || 0) : 0;
    var min = parts.length > 4 ? (parseInt(parts[4], 10) || 0) : 0;
    var s = parts.length > 5 ? (parseInt(parts[5], 10) || 0) : 0;

    if (p0 > 1900) {
      var yr = p0 > 2500 ? p0 - 543 : p0;
      var dIso = new Date(yr, p1 - 1, p2, h, min, s);
      if (dIso.getTime() > nowLimitMs && p2 <= 12) {
        return new Date(yr, p2 - 1, p1, h, min, s);
      }
      return dIso;
    }
    if (p2 > 2500) p2 -= 543;
    if (p2 < 100) p2 += (p2 >= 68 ? 1957 : 2000);

    var day = p0;
    var month1Based = p1;
    if (p1 > 12 && p0 <= 12) {
      day = p1;
      month1Based = p0;
    }

    var candidate = new Date(p2, month1Based - 1, day, h, min, s);
    if (candidate.getTime() > nowLimitMs && day <= 12 && month1Based <= 12) {
      var swapped = new Date(p2, day - 1, month1Based, h, min, s);
      if (swapped.getTime() <= nowLimitMs) return swapped;
    }
    return candidate;
  }

  var dFallback = new Date(str);
  return isNaN(dFallback.getTime()) ? null : dFallback;
}

function DB_GetDriveFileCreatedDate(url) {
  if (!url || typeof url !== "string") return null;
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (!match || !match[1]) return null;
  try {
    var f = DriveApp.getFileById(match[1]);
    return f ? f.getDateCreated() : null;
  } catch (e) {
    return null;
  }
}

function getConfigValue(key, defaultVal) {
  try {
    let cache = CacheService.getScriptCache();
    let cachedVal = cache.get("cfg_val_" + key);
    if (cachedVal !== null) return cachedVal;

    var ss = DB_GetSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIG);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_CONFIG);
      sheet.appendRow(["Key", "Value", "คำอธิบาย / รายละเอียด"]);
      sheet.appendRow(["COMPANY_NAME", "กอ.แก๊ส เชียงใหม่", "ชื่อร้านใช้แสดงในหัวบิล"]);
      sheet.appendRow(["OFFICE_LOCATION", "8/4 ถ.พัฒนาช้างเผือก ต.ช้างเผือก อ.เมือง เชียงใหม่ 50300", "จุดตั้งต้นสำนักงาน"]);
      sheet.appendRow(["BANK_NAME", "ธนาคารกรุงเทพ", "ธนาคารสำหรับรับโอนเงิน"]);
      sheet.appendRow(["BANK_ACCOUNT", "252-451-1777", "เลขบัญชีธนาคาร"]);
      sheet.appendRow(["BANK_OWNER", "นายภานุพงศ์ ดุมคำ", "ชื่อเจ้าของบัญชี"]);
      sheet.appendRow(["SYSTEM_TEST_FEE", "300", "ค่าบริการตรวจสอบระบบ"]);
      sheet.appendRow(["HOURLY_LABOR_RATE", "150", "ค่าแรงต่อชั่วโมง"]);
    }
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        let res = data[i][1] !== "" ? String(data[i][1]) : defaultVal;
        cache.put("cfg_val_" + key, res, 1800);
        return res;
      }
    }
  } catch (e) {}
  return defaultVal;
}

function DB_GetSharedFolder(folderName) {
  let props = PropertiesService.getScriptProperties();
  let propKey = "SHARED_FOLDER_ID_" + folderName;
  let savedId = props.getProperty(propKey);
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) {}
  }

  let folderIter = DriveApp.getFoldersByName(folderName);
  let folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder(folderName);
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
  props.setProperty(propKey, folder.getId());
  return folder;
}

function DB_ClearStoreCache() {
  STORE_MEM_CACHE = null;
  NORM_NAME_MEMO = {};
  try {
    CacheService.getScriptCache().removeAll([
      "ALL_ACTIVE_STORES_V47_0",
      "ALL_STORE_DEBTS_V47_0"
    ]);
  } catch (e) {}
}

function DB_ClearTxCache() {
  TX_MEM_CACHE = null;
  TX_RECENT_CACHE = null;
  STORE_DEBT_MAP_MEM = null;
  QUEUE_MEM_CACHE = null;
  try {
    CacheService.getScriptCache().removeAll([
      "ALL_STORE_DEBTS_V47_0",
      "PENDING_QUEUE_V47_0",
      "RECENT_TX_RAM_V47_0",
      "FULL_TX_RAM_V47_0_P0",
      "FULL_TX_RAM_V47_0_P1"
    ]);
  } catch (e) {}
}

function DB_RepairCorruptedGroupIds(sheet) {
  try {
    let props = PropertiesService.getScriptProperties();
    if (props.getProperty("REPAIRED_STORES_V47_0") === "DONE") return;

    let targetSheet = sheet || DB_GetSpreadsheet().getSheetByName(CONFIG.SHEET_STORES);
    if (!targetSheet || targetSheet.getLastRow() <= 1) return;

    let data = targetSheet.getDataRange().getValues();
    let idCount = {};

    for (let i = 1; i < data.length; i++) {
      let sId = DB_SanitizeText(data[i][COL_STORE.storeId]);
      let rawStoreName = DB_SanitizeText(data[i][COL_STORE.storeName]);
      let cleanedStoreName = DB_CleanStorePrefix(rawStoreName, sId);
      if (cleanedStoreName && cleanedStoreName !== rawStoreName) {
        targetSheet.getRange(i + 1, COL_STORE.storeName + 1).setValue(cleanedStoreName);
      }

      let gCell = DB_SanitizeText(data[i][COL_STORE.groupId]);
      if (!gCell) continue;
      let ids = gCell.split(",").map(s => s.trim()).filter(Boolean);
      ids.forEach(id => { idCount[id] = (idCount[id] || 0) + 1; });
    }

    for (let i = 1; i < data.length; i++) {
      let gCell = DB_SanitizeText(data[i][COL_STORE.groupId]);
      if (!gCell) continue;
      let ids = gCell.split(",").map(s => s.trim()).filter(Boolean);
      let cleaned = ids.filter(id => idCount[id] === 1 && !id.startsWith("U8e7618") && !id.startsWith("U4709f4"));
      if (cleaned.join(", ") !== gCell) {
        targetSheet.getRange(i + 1, COL_STORE.groupId + 1).setValue(cleaned.join(", "));
      }
    }

    let headerN = data[0].length > COL_STORE.creditTerm ? DB_SanitizeText(data[0][COL_STORE.creditTerm]) : "";
    if (!headerN) {
      targetSheet.getRange(1, COL_STORE.creditTerm + 1).setValue("CreditTerm");
    }

    props.setProperty("REPAIRED_STORES_V47_0", "DONE");
    DB_ClearStoreCache();
  } catch (e) {}
}

function DB_SetupMasterStoreSheet() {
  try {
    let ss = DB_GetSpreadsheet();
    let masterSheet = ss.getSheetByName(CONFIG.SHEET_STORES);

    if (masterSheet && masterSheet.getLastRow() > 1) {
      DB_RepairCorruptedGroupIds(masterSheet);
      return { success: true, sheet: masterSheet, createdNew: false, count: masterSheet.getLastRow() - 1 };
    }

    if (!masterSheet) masterSheet = ss.insertSheet(CONFIG.SHEET_STORES);
    else masterSheet.clear();

    let headers = [
      "StoreID", "StoreName", "BillingName", "Phone", "GoogleMap",
      "Price15", "Price48", "PriceCan", "PairingCode", "GroupID",
      "Status", "PendingDebt", "Alias", "CreditTerm"
    ];
    masterSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    masterSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");

    DB_ClearStoreCache();
    PropertiesService.getScriptProperties().setProperty("REPAIRED_STORES_V47_0", "DONE");
    return { success: true, sheet: masterSheet, createdNew: true, count: 0 };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function DB_GetStoreSheetSafe() {
  let ss = DB_GetSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_STORES);
  if (!sheet || sheet.getLastRow() <= 1) {
    let setup = DB_SetupMasterStoreSheet();
    sheet = setup.sheet;
  } else {
    DB_RepairCorruptedGroupIds(sheet);
  }
  return sheet;
}

function DB_FormatStoreRow(row, rowIdxOptional) {
  let sId = DB_SanitizeText(row[COL_STORE.storeId]);
  let sName = DB_CleanStorePrefix(row[COL_STORE.storeName], sId);
  let bName = DB_SanitizeText(row[COL_STORE.billingName]).replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
  let cTerm = row.length > COL_STORE.creditTerm ? DB_SanitizeText(row[COL_STORE.creditTerm]) : "";
  return {
    rowIdx: rowIdxOptional || 0,
    storeId: sId,
    storeName: sName,
    billingName: (bName && bName !== "-") ? bName : sName.replace(/(\[ST-\d+\]\s*)+/gi, "").trim(),
    phone: DB_SanitizeText(row[COL_STORE.phone]) || "-",
    mapLink: DB_SanitizeText(row[COL_STORE.googleMap]) || "-",
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

/**
 * [GOOGLE MAPS URI BUILDER FOR STAFF DELIVERY FLEX CARD]:
 * ดึงลิงก์ Google Maps จากฐานข้อมูลร้านค้า (คอลัมน์ E) หากเป็นลิงก์ http/https ให้เปิดทันที
 * หากในชีทเป็น "-" หรือเป็นพิกัดข้อความ ระบบจะสร้างลิงก์นำทาง Google Maps อัตโนมัติให้ลูกน้องกดนำทางได้ 100% ทุกคิว!
 */
function DB_GetStoreGoogleMapUri(storeInfoOrName) {
  let stObj = (typeof storeInfoOrName === "object" && storeInfoOrName !== null)
              ? storeInfoOrName
              : DB_GetStoreById(storeInfoOrName);
  let rawMap = stObj && stObj.mapLink ? String(stObj.mapLink).trim() : "";
  if (rawMap && /^https?:\/\//i.test(rawMap)) {
    return rawMap;
  }
  let rawName = stObj ? stObj.storeName : String(storeInfoOrName || "");
  let cleanSearchName = rawName.replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
  let queryText = (rawMap && rawMap !== "-") ? (cleanSearchName + " " + rawMap) : (cleanSearchName + " เชียงใหม่");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(queryText);
}

function DB_GetAllActiveStores(forceRefresh) {
  if (!forceRefresh && STORE_MEM_CACHE) return STORE_MEM_CACHE;

  let cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    let cachedStr = cache.get("ALL_ACTIVE_STORES_V47_0");
    if (cachedStr) {
      try {
        STORE_MEM_CACHE = JSON.parse(cachedStr);
        return STORE_MEM_CACHE;
      } catch (e) {}
    }
  }

  try {
    let sheet = DB_GetStoreSheetSafe();
    if (!sheet || sheet.getLastRow() <= 1) return [];
    let data = sheet.getDataRange().getValues();
    let stores = [];
    for (let i = 1; i < data.length; i++) {
      let status = DB_SanitizeText(data[i][COL_STORE.status]);
      let sName = DB_SanitizeText(data[i][COL_STORE.storeName]);
      if (sName && (status === "Active" || status === "" || status === "-")) {
        stores.push(DB_FormatStoreRow(data[i], i + 1));
      }
    }
    STORE_MEM_CACHE = stores;
    try { cache.put("ALL_ACTIVE_STORES_V47_0", JSON.stringify(stores), 600); } catch (err) {}
    return stores;
  } catch (e) {
    return [];
  }
}

function getStoreDatabaseMap() {
  return DB_GetAllActiveStores().map(s => s.storeName);
}

function normalizeStoreName(rawName) {
  if (!rawName) return "-";
  var raw = DB_CleanStorePrefix(rawName);
  if (raw === "") return "-";

  if (NORM_NAME_MEMO[raw]) return NORM_NAME_MEMO[raw];

  var allStores = DB_GetAllActiveStores();
  var match = raw.match(/ST\s*[-_:]?\s*(\d{3})/i);
  if (match) {
    var code = ("ST-" + match[1]).toUpperCase();
    for (var i = 0; i < allStores.length; i++) {
      if (allStores[i].storeId.toUpperCase() === code || allStores[i].storeName.toUpperCase().indexOf("[" + code + "]") !== -1) {
        NORM_NAME_MEMO[raw] = allStores[i].storeName;
        return allStores[i].storeName;
      }
    }
  }

  var cleanRaw = raw.replace(/(\[ST-\d+\]\s*)+/gi, "").toLowerCase().replace(/\s+/g, "");
  for (var j = 0; j < allStores.length; j++) {
    var st = allStores[j];
    if (st.storeName === raw || st.billingName === raw) {
      NORM_NAME_MEMO[raw] = st.storeName;
      return st.storeName;
    }

    var nameOnly = st.storeName.replace(/(\[ST-\d+\]\s*)+/gi, "").toLowerCase().replace(/\s+/g, "");
    var billFirstLine = st.billingName.split(/[\n|]/)[0].toLowerCase().replace(/\s+/g, "");
    if (nameOnly && cleanRaw.length >= 2 && (cleanRaw === nameOnly || cleanRaw.indexOf(nameOnly) !== -1 || nameOnly.indexOf(cleanRaw) !== -1)) {
      NORM_NAME_MEMO[raw] = st.storeName;
      return st.storeName;
    }
    if (billFirstLine && cleanRaw.length >= 2 && (cleanRaw === billFirstLine || cleanRaw.indexOf(billFirstLine) !== -1)) {
      NORM_NAME_MEMO[raw] = st.storeName;
      return st.storeName;
    }
  }

  NORM_NAME_MEMO[raw] = raw;
  return raw;
}

function DB_SearchStoreByName(searchKeyword) {
  try {
    let allStores = DB_GetAllActiveStores();
    let query = DB_SanitizeText(searchKeyword).toLowerCase();
    if (query === "" || query === "-") return [];

    return allStores.filter(st => {
      return st.storeId.toLowerCase().includes(query) ||
             st.storeName.toLowerCase().includes(query) ||
             st.billingName.toLowerCase().includes(query) ||
             st.alias.toLowerCase().includes(query);
    });
  } catch (e) { return []; }
}

function DB_GetStoreById(storeIdOrName) {
  try {
    let allStores = DB_GetAllActiveStores();
    let target = DB_CleanStorePrefix(storeIdOrName).toLowerCase();
    if (!target) return null;

    for (let i = 0; i < allStores.length; i++) {
      if (allStores[i].storeId.toLowerCase() === target || allStores[i].storeName.toLowerCase() === target) {
        return allStores[i];
      }
    }
    for (let i = 0; i < allStores.length; i++) {
      if (allStores[i].storeName.toLowerCase().includes(target) || allStores[i].billingName.toLowerCase().includes(target)) {
        return allStores[i];
      }
    }
    return null;
  } catch (e) { return null; }
}

function DB_GetStoreByGroupId(roomId) {
  try {
    if (!roomId) return null;
    let allStores = DB_GetAllActiveStores();
    for (let i = allStores.length - 1; i >= 0; i--) {
      let gIdCell = allStores[i].groupId;
      if (!gIdCell) continue;
      let groupList = gIdCell.split(",").map(s => s.trim()).filter(Boolean);
      if (groupList.includes(roomId)) return allStores[i];
    }
    return null;
  } catch (e) { return null; }
}

/**
 * [LATEST STORE ORDER TRACKER]:
 * ตรวจสอบว่ามีออเดอร์ของร้านนี้ที่เพิ่งสั่งไปแล้ว (กำลังรอส่งในคิว หรือเพิ่งจัดส่งวันนี้) หรือไม่
 * เพื่อแสดงแจ้งเตือนบนหัวการ์ดก่อนสั่งแก๊สใหม่ ป้องกันการเผลอกดสั่งซ้ำ!
 */
function DB_GetLatestStoreOrderInfo(storeName) {
  try {
    let normTarget = normalizeStoreName(storeName);
    let pendingQueues = DB_GetPendingOrders(false);
    for (let i = pendingQueues.length - 1; i >= 0; i--) {
      let q = pendingQueues[i];
      if (normalizeStoreName(q.store) === normTarget) {
        let items = [];
        if (q.g15 > 0) items.push(`15กก.(${q.g15})`);
        if (q.g48 > 0) items.push(`48กก.(${q.g48})`);
        if (q.cans > 0) items.push(`กระป๋อง(${q.cans})`);
        return {
          isPendingQueue: true,
          orderId: q.orderId,
          timeStr: q.time,
          itemDesc: items.join(", ") || "-",
          total: q.total,
          statusLabel: "🚚 กำลังอยู่ในคิวรอจัดส่ง"
        };
      }
    }

    let todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
    let recentTx = DB_GetRecentTransactions(50);
    for (let j = recentTx.length - 1; j >= 0; j--) {
      let tx = recentTx[j];
      if (tx.status === "ยกเลิก") continue;
      if (normalizeStoreName(tx.store) === normTarget) {
        let dObj = parseSheetDate(tx.date);
        if (dObj && Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yyyy") === todayStr) {
          let itemsTx = [];
          if (tx.g15 > 0) itemsTx.push(`15กก.(${tx.g15})`);
          if (tx.g48 > 0) itemsTx.push(`48กก.(${tx.g48})`);
          if (tx.cans > 0) itemsTx.push(`กระป๋อง(${tx.cans})`);
          return {
            isPendingQueue: false,
            orderId: tx.orderId,
            timeStr: Utilities.formatDate(dObj, "Asia/Bangkok", "HH:mm น."),
            itemDesc: itemsTx.join(", ") || "-",
            total: tx.total,
            statusLabel: `✅ จัดส่งแล้ววันนี้ (${tx.sender})`
          };
        }
      }
    }
  } catch (e) {}
  return null;
}

// ==========================================
// 📝 5. INTERACTIVE STORE & BILLING HEADER UPDATER (แก้ไขหัวบิลและข้อมูลร้านค้าทุกคอลัมน์)
// ==========================================

function DB_UpdateStoreField(storeIdOrName, fieldKey, newValue) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let sheet = DB_GetStoreSheetSafe();
    let data = sheet.getDataRange().getValues();
    let target = DB_SanitizeText(storeIdOrName).toLowerCase();

    let colMap = {
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

    let colIdx = colMap[String(fieldKey).toLowerCase()];
    if (colIdx === undefined) return { success: false, msg: "ไม่พบคอลัมน์ที่ต้องการแก้ไข" };

    for (let i = 1; i < data.length; i++) {
      let sId = DB_SanitizeText(data[i][COL_STORE.storeId]).toLowerCase();
      let sName = DB_SanitizeText(data[i][COL_STORE.storeName]).toLowerCase();
      if (sId === target || sName === target || sName.includes(target)) {
        let finalVal = newValue;
        if (colIdx === COL_STORE.storeName) {
          finalVal = DB_CleanStorePrefix(newValue, data[i][COL_STORE.storeId]);
        } else if (colIdx === COL_STORE.price15 || colIdx === COL_STORE.price48 || colIdx === COL_STORE.priceCan || colIdx === COL_STORE.pendingDebt) {
          finalVal = parseNum(newValue);
        } else if (colIdx === COL_STORE.creditTerm) {
          let cl = String(newValue).trim();
          finalVal = (cl === "15" || cl === "30") ? cl : "";
        }

        sheet.getRange(i + 1, colIdx + 1).setValue(finalVal);
        data[i][colIdx] = finalVal;
        DB_ClearStoreCache();
        return {
          success: true,
          store: DB_FormatStoreRow(data[i], i + 1),
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

function DB_UpdateStoreFromTemplate(rawTemplateText) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let lines = String(rawTemplateText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    let kv = {};
    for (let i = 0; i < lines.length; i++) {
      let idx = lines[i].indexOf(":");
      if (idx !== -1) {
        let k = lines[i].substring(0, idx).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        let v = lines[i].substring(idx + 1).trim();
        if (k) kv[k] = v;
      }
    }

    let targetId = kv["storeid"] || "";
    if (!targetId) return { success: false, msg: "ไม่พบรหัส StoreID ใน Template ครับ" };

    let sheet = DB_GetStoreSheetSafe();
    let data = sheet.getDataRange().getValues();

    for (let r = 1; r < data.length; r++) {
      let sId = DB_SanitizeText(data[r][COL_STORE.storeId]);
      if (sId.toUpperCase() === targetId.toUpperCase()) {
        let row = data[r];
        if (kv["storename"] !== undefined) row[COL_STORE.storeName] = DB_CleanStorePrefix(kv["storename"], sId);
        if (kv["billingname"] !== undefined) row[COL_STORE.billingName] = kv["billingname"];
        if (kv["phone"] !== undefined) row[COL_STORE.phone] = kv["phone"];
        if (kv["googlemap"] !== undefined) row[COL_STORE.googleMap] = kv["googlemap"];
        if (kv["price15"] !== undefined) row[COL_STORE.price15] = parseNum(kv["price15"]) || 490;
        if (kv["price48"] !== undefined) row[COL_STORE.price48] = parseNum(kv["price48"]) || 1530;
        if (kv["pricecan"] !== undefined) row[COL_STORE.priceCan] = parseNum(kv["pricecan"]) || 790;
        if (kv["pairingcode"] !== undefined) row[COL_STORE.pairingCode] = kv["pairingcode"];
        if (kv["groupid"] !== undefined) row[COL_STORE.groupId] = kv["groupid"];
        if (kv["status"] !== undefined) row[COL_STORE.status] = kv["status"] || "Active";
        if (kv["pendingdebt"] !== undefined) row[COL_STORE.pendingDebt] = parseNum(kv["pendingdebt"]);
        if (kv["alias"] !== undefined) row[COL_STORE.alias] = kv["alias"];
        if (kv["creditterm"] !== undefined) {
          let ct = kv["creditterm"];
          row[COL_STORE.creditTerm] = (ct === "15" || ct === "30") ? ct : "";
        }

        sheet.getRange(r + 1, 1, 1, 14).setValues([row.slice(0, 14)]);
        DB_ClearStoreCache();
        return { success: true, store: DB_FormatStoreRow(row, r + 1) };
      }
    }
    return { success: false, msg: `ไม่พบรหัสร้าน ${targetId} ในตารางครับ` };
  } catch (e) {
    return { success: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_GetAllStoreDebtsMap(forceRefresh) {
  if (!forceRefresh && STORE_DEBT_MAP_MEM) return STORE_DEBT_MAP_MEM;

  let cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    let cachedStr = cache.get("ALL_STORE_DEBTS_V47_0");
    if (cachedStr) {
      try {
        STORE_DEBT_MAP_MEM = JSON.parse(cachedStr);
        return STORE_DEBT_MAP_MEM;
      } catch (e) {}
    }
  }

  let storeTermMap = {};
  let allStores = DB_GetAllActiveStores();
  for (let s = 0; s < allStores.length; s++) {
    storeTermMap[allStores[s].storeName] = allStores[s].creditTerm || "";
  }

  let debtMap = {};
  try {
    let allTx = DB_GetTransactions();
    for (let i = 0; i < allTx.length; i++) {
      let tx = allTx[i];
      if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว") continue;
      let rDate = parseSheetDate(tx.date);
      if (!rDate) continue;

      let sName = tx.store;
      let cTerm = storeTermMap[sName] || "";
      let isCreditStore = (cTerm === "15" || cTerm === "30");

      let minCutoffDate = isCreditStore ? CONFIG.CUTOFF_CREDIT : CONFIG.CUTOFF_PENDING;
      if (rDate < minCutoffDate) continue;

      let isUnpaid = (tx.status.indexOf("ชำระแล้ว") === -1);
      let isDebtPay = (tx.payMethod.indexOf("โอน") !== -1 || tx.payMethod.indexOf("เครดิต") !== -1 || tx.payMethod.indexOf("ผสม") !== -1);
      if (isUnpaid && isDebtPay) {
        let billAmt = tx.payMethod.indexOf("ผสม") !== -1 ? Math.max(0, tx.total - tx.cashReceived) : tx.total;
        let displayMethod = isCreditStore ? `เครดิต ${cTerm} วัน` : "เงินโอน";

        if (!debtMap[sName]) debtMap[sName] = { pendingDebt: 0, missingCylinders: 0, creditTerm: cTerm, bills: [] };
        debtMap[sName].pendingDebt += billAmt;
        let oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
        let dStr = Utilities.formatDate(rDate, "Asia/Bangkok", "dd/MM/yyyy");
        let shortDateStr = Utilities.formatDate(rDate, "Asia/Bangkok", "dd/MM/yy");

        let itemArr = [];
        if (tx.g15 > 0) itemArr.push("ถัง 15 กก. x " + tx.g15);
        if (tx.g48 > 0) itemArr.push("ถัง 48 กก. x " + tx.g48);
        if (tx.cans > 0) itemArr.push("แก๊สกระป๋อง x " + tx.cans + " ลัง");

        debtMap[sName].bills.push({
          rowIdx: tx.rowIdx,
          orderId: oId,
          dateStr: dStr,
          shortDateStr: shortDateStr,
          amount: billAmt,
          payMethod: displayMethod,
          sender: tx.sender,
          itemDesc: itemArr.join(", ") || "-"
        });
      }
    }
    STORE_DEBT_MAP_MEM = debtMap;
    try { cache.put("ALL_STORE_DEBTS_V47_0", JSON.stringify(debtMap), 300); } catch (err) {}
  } catch (e) {}
  return debtMap;
}

function DB_GetStoreDebtDetails(storeName) {
  if (!storeName) return { pendingDebt: 0, missingCylinders: 0, creditTerm: "", bills: [] };
  let targetName = normalizeStoreName(storeName);
  let debtMap = DB_GetAllStoreDebtsMap(false);
  return debtMap[targetName] || { pendingDebt: 0, missingCylinders: 0, creditTerm: "", bills: [] };
}

function DB_SetStoreCreditTerm(storeIdOrName, termValue) {
  let res = DB_UpdateStoreField(storeIdOrName, "creditterm", termValue);
  if (res.success) {
    return { success: true, storeName: res.store.storeName, creditTerm: res.store.creditTerm };
  }
  return res;
}

function DB_GetLinkedStoresList() {
  let linked = [];
  let allStores = DB_GetAllActiveStores();
  for (let i = 0; i < allStores.length; i++) {
    if (allStores[i].groupId && allStores[i].groupId.trim() !== "") {
      linked.push({
        targetId: allStores[i].storeId,
        name: allStores[i].storeName,
        type: "STORE"
      });
    }
  }
  return linked;
}

function DB_AdminRemoteUnlink(targetStoreId) {
  let res = DB_UpdateStoreField(targetStoreId, "groupid", "");
  if (res.success) {
    return { success: true, storeId: res.store.storeId, storeName: res.store.storeName };
  }
  return res;
}

function DB_GetStaffGroupId() {
  try {
    let cache = CacheService.getScriptCache();
    let cached = cache.get("STAFF_GROUP_ID_CACHE");
    if (cached) return cached;

    let ss = DB_GetSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
    if (sheet && sheet.getLastRow() >= 1) {
      let data = sheet.getDataRange().getValues();
      for (let i = 0; i < data.length; i++) {
        if (DB_SanitizeText(data[i][0]) === "STAFF_GROUP_ID" && data[i][1]) {
          let val = DB_SanitizeText(data[i][1]);
          cache.put("STAFF_GROUP_ID_CACHE", val, 1800);
          return val;
        }
      }
    }
  } catch (e) {}
  return CONFIG.STAFF_GROUP_ID;
}

function DB_GetAdminGroupId() {
  try {
    let cache = CacheService.getScriptCache();
    let cached = cache.get("ADMIN_GROUP_ID_CACHE");
    if (cached) return cached;

    let ss = DB_GetSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
    if (sheet && sheet.getLastRow() >= 1) {
      let data = sheet.getDataRange().getValues();
      for (let i = 0; i < data.length; i++) {
        if (DB_SanitizeText(data[i][0]) === "ADMIN_GROUP_ID" && data[i][1]) {
          let val = DB_SanitizeText(data[i][1]);
          cache.put("ADMIN_GROUP_ID_CACHE", val, 1800);
          return val;
        }
      }
    }
  } catch (e) {}
  return CONFIG.ADMIN_GROUP_ID;
}

function DB_GetRoomRole(roomId) {
  if (!roomId) return { role: "UNBOUND", storeData: null };
  let linkedStore = DB_GetStoreByGroupId(roomId);
  if (linkedStore) return { role: "STORE", storeData: linkedStore };
  let staffId = DB_GetStaffGroupId();
  if (roomId === staffId || roomId === CONFIG.STAFF_GROUP_ID) return { role: "STAFF", storeData: null };
  let adminId = DB_GetAdminGroupId();
  if (roomId === adminId || roomId === CONFIG.ADMIN_GROUP_ID) return { role: "ADMIN", storeData: null };
  return { role: "UNBOUND", storeData: null };
}

function DB_BindGroupByPairingCode(code, roomId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let ss = DB_GetSpreadsheet();
    let rawCode = DB_SanitizeText(code);
    let cleanCode = rawCode.replace(/^#/, "").trim();
    let upperCode = cleanCode.toUpperCase();

    let storeSheet = DB_GetStoreSheetSafe();
    let data = storeSheet.getDataRange().getValues();

    if (upperCode === "UNLINK" || upperCode === "UNLINK-STORE" || rawCode === "#ยกเลิกผูกห้อง") {
      let unlinkedNames = [];
      for (let i = 1; i < data.length; i++) {
        let gIdCell = DB_SanitizeText(data[i][COL_STORE.groupId]);
        if (!gIdCell) continue;
        let groupList = gIdCell.split(",").map(s => s.trim()).filter(Boolean);
        if (groupList.includes(roomId)) {
          let updatedList = groupList.filter(id => id !== roomId);
          storeSheet.getRange(i + 1, COL_STORE.groupId + 1).setValue(updatedList.join(", "));
          unlinkedNames.push(DB_CleanStorePrefix(data[i][COL_STORE.storeName], data[i][COL_STORE.storeId]));
        }
      }

      let settingSheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS);
      if (settingSheet && settingSheet.getLastRow() >= 1) {
        let sData = settingSheet.getDataRange().getValues();
        for (let r = 0; r < sData.length; r++) {
          if (DB_SanitizeText(sData[r][1]) === roomId) {
            settingSheet.getRange(r + 1, 2).setValue("");
            unlinkedNames.push(DB_SanitizeText(sData[r][0]));
          }
        }
      }

      DB_ClearStoreCache();
      CacheService.getScriptCache().removeAll(["STAFF_GROUP_ID_CACHE", "ADMIN_GROUP_ID_CACHE"]);

      if (unlinkedNames.length > 0) return { success: true, type: "UNLINK", name: unlinkedNames.join(", ") };
      return { success: false, msg: "ห้องนี้ยังไม่ได้ผูกกับร้านค้าหรือสถานะใดในระบบครับ" };
    }

    for (let i = 1; i < data.length; i++) {
      let gIdCell = DB_SanitizeText(data[i][COL_STORE.groupId]);
      if (gIdCell && gIdCell.includes(roomId)) {
        let filtered = gIdCell.split(",").map(s => s.trim()).filter(id => id && id !== roomId);
        storeSheet.getRange(i + 1, COL_STORE.groupId + 1).setValue(filtered.join(", "));
        data[i][COL_STORE.groupId] = filtered.join(", ");
      }
    }

    if (upperCode === "LINK-STAFF" || rawCode === "#ห้องลูกน้อง" || rawCode === "#ทีมรับออเดอร์") {
      let settingSheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS) || ss.insertSheet(CONFIG.SHEET_SETTINGS);
      settingSheet.getRange("A1").setValue("STAFF_GROUP_ID");
      settingSheet.getRange("B1").setValue(roomId);
      CacheService.getScriptCache().remove("STAFF_GROUP_ID_CACHE");
      DB_ClearStoreCache();
      return { success: true, type: "STAFF", name: "ห้องทีมรับออเดอร์ (Order Team)" };
    }

    if (upperCode === "LINK-ADMIN" || rawCode === "#ห้องแอดมิน") {
      let settingSheet = ss.getSheetByName(CONFIG.SHEET_SETTINGS) || ss.insertSheet(CONFIG.SHEET_SETTINGS);
      settingSheet.getRange("A2").setValue("ADMIN_GROUP_ID");
      settingSheet.getRange("B2").setValue(roomId);
      CacheService.getScriptCache().remove("ADMIN_GROUP_ID_CACHE");
      DB_ClearStoreCache();
      return { success: true, type: "ADMIN", name: "ห้องผู้ดูแลระบบ (Admin Room)" };
    }

    let keyword = cleanCode.replace(/^LINK[-\s]*/i, "").trim().toLowerCase();

    for (let i = 1; i < data.length; i++) {
      let pairingCodeInSheet = DB_SanitizeText(data[i][COL_STORE.pairingCode]).toUpperCase();
      let storeIdInSheet = DB_SanitizeText(data[i][COL_STORE.storeId]).toLowerCase();
      let storeNameInSheet = DB_SanitizeText(data[i][COL_STORE.storeName]).toLowerCase();
      let aliasInSheet = DB_SanitizeText(data[i][COL_STORE.alias]).toLowerCase();

      let isExactCode = (pairingCodeInSheet !== "" && pairingCodeInSheet === upperCode) ||
                        (("link-" + storeIdInSheet) === upperCode.toLowerCase());
      let isNameMatch = keyword.length >= 2 &&
                        (storeIdInSheet === keyword || storeNameInSheet.includes(keyword) || aliasInSheet.includes(keyword));

      if (isExactCode || isNameMatch) {
        let existingGroups = DB_SanitizeText(data[i][COL_STORE.groupId]);
        let groupArr = existingGroups ? existingGroups.split(",").map(s => s.trim()).filter(Boolean) : [];
        if (!groupArr.includes(roomId)) groupArr.push(roomId);
        storeSheet.getRange(i + 1, COL_STORE.groupId + 1).setValue(groupArr.join(", "));
        data[i][COL_STORE.groupId] = groupArr.join(", ");
        DB_ClearStoreCache();
        let storeObj = DB_FormatStoreRow(data[i], i + 1);
        return { success: true, type: "STORE", name: storeObj.storeName, storeData: storeObj };
      }
    }

    return { success: false, msg: `ไม่พบรหัสร้านค้า "${rawCode}" ในระบบ` };
  } catch (e) {
    return { success: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_RegisterNewStore(rawInput) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let clean = rawInput.replace(/^เพิ่มร้าน\s*:\s*/i, "").trim();
    let parts = clean.split("|").map(s => s.trim());
    let rawName = parts[0] ? parts[0].replace(/(\[ST-\d+\]\s*)+/gi, "").trim() : "";
    if (!rawName) return { success: false, msg: "กรุณาระบุชื่อร้านค้า" };

    let p15 = parseNum(parts[1]) || 490;
    let p48 = parseNum(parts[2]) || 1530;
    let pCan = parseNum(parts[3]) || 790;
    let alias = parts[4] || rawName;
    let creditTerm = (parts[5] === "15" || parts[5] === "30") ? parts[5] : "";
    let billingHeader = parts[6] || rawName;
    let mapLink = parts[7] || "-";
    let phone = parts[8] || "-";

    let sheet = DB_GetStoreSheetSafe();
    let nextNum = sheet.getLastRow();
    let newStoreId = "ST-" + String(nextNum).padStart(3, "0");
    let fullStoreName = `[${newStoreId}] ${rawName}`;
    let pairingCode = "LINK-" + newStoreId;

    sheet.appendRow([
      newStoreId, fullStoreName, billingHeader, phone, mapLink,
      p15, p48, pCan, pairingCode, "",
      "Active", 0, alias, creditTerm
    ]);

    DB_ClearStoreCache();
    if (typeof updateFormDropdown === "function") {
      try { updateFormDropdown(); } catch (err) {}
    }

    return {
      success: true,
      storeId: newStoreId,
      storeName: fullStoreName,
      billingName: billingHeader,
      pairingCode: pairingCode,
      price15: p15,
      price48: p48,
      priceCan: pCan,
      creditTerm: creditTerm
    };
  } catch (e) {
    return { success: false, msg: e.message };
  } finally {
    lock.releaseLock();
  }
}

function generateNextOrderId(sheet, orderIdColIdx) {
  var targetColIdx = (orderIdColIdx !== undefined && orderIdColIdx !== null) ? orderIdColIdx : COL.orderId;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "10212301";
  var startRow = Math.max(2, lastRow - 150);
  var numRows = lastRow - startRow + 1;
  var dataValues = sheet.getRange(startRow, targetColIdx + 1, numRows, 1).getValues();
  var maxNum = 0;
  for (var i = 0; i < dataValues.length; i++) {
    var valStr = String(dataValues[i][0] || "").trim();
    if (!valStr || valStr.toUpperCase().indexOf("#Q") === 0) continue;
    var num = parseInt(valStr.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return String(maxNum > 0 ? maxNum + 1 : 10212301);
}

function DB_FindTxByBillNo(rawBillNo, txListOptional) {
  let cleanTarget = String(rawBillNo || "").replace(/^#/, "").trim().toUpperCase();
  if (!cleanTarget) return null;

  let allTx = txListOptional || DB_GetTransactions();

  let mRow = cleanTarget.match(/^ROW[-_]?(\d+)$/i);
  if (mRow) {
    let targetRowIdx = parseInt(mRow[1], 10);
    for (let r = allTx.length - 1; r >= 0; r--) {
      if (allTx[r].rowIdx === targetRowIdx) return allTx[r];
    }
  }

  let digitsTarget = cleanTarget.replace(/[^0-9]/g, "");

  for (let i = allTx.length - 1; i >= 0; i--) {
    let tx = allTx[i];
    let txOrderClean = String(tx.orderId || "").replace(/^#/, "").trim().toUpperCase();
    let txBillingClean = String(tx.billingId || "").replace(/^#/, "").trim().toUpperCase();
    let txDigits = txOrderClean.replace(/[^0-9]/g, "");
    let virtualRowId = String(tx.rowIdx - 1);
    let exactRowStr = String(tx.rowIdx);

    if (txOrderClean === cleanTarget || txBillingClean === cleanTarget || virtualRowId === cleanTarget || exactRowStr === cleanTarget) {
      return tx;
    }
    if (digitsTarget.length >= 3 && (txDigits === digitsTarget || virtualRowId === digitsTarget || exactRowStr === digitsTarget)) {
      return tx;
    }
  }
  return null;
}

function DB_RecordStaffDeliveryToMainSheet(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    let mainSheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let storeName = normalizeStoreName(payload.store);
    let storeInfo = DB_GetStoreById(storeName) || { price15: 490, price48: 1530, priceCan: 790, creditTerm: "" };

    let g15 = parseNum(payload.g15);
    let g48 = parseNum(payload.g48);
    let cans = parseNum(payload.cans);
    let totalSales = parseNum(payload.total) || ((g15 * storeInfo.price15) + (g48 * storeInfo.price48) + (cans * storeInfo.priceCan));
    let fuelCost = parseNum(payload.fuelCost);
    let fuelSlipUrl = DB_SanitizeText(payload.fuelSlipUrl);
    let receiptUrl = DB_SanitizeText(payload.receiptUrl);
    let transferSlipUrl = DB_SanitizeText(payload.transferSlipUrl);
    let sender = DB_SanitizeText(payload.driver) || "ไม่ระบุ";

    let rawPay = DB_SanitizeText(payload.payMethod) || "เงินสด";
    let finalPayMethod = rawPay;
    let finalStatus = "ชำระแล้ว";
    let noteText = DB_SanitizeText(payload.note);

    if (rawPay.indexOf("สด") !== -1) {
      finalPayMethod = "เงินสด";
      finalStatus = "ชำระแล้ว";
    } else if (storeInfo.creditTerm === "15" || storeInfo.creditTerm === "30") {
      if (transferSlipUrl) {
        finalPayMethod = "เงินโอน";
        finalStatus = "ชำระแล้ว";
      } else {
        finalPayMethod = "เครดิต";
        finalStatus = "ค้างชำระ";
      }
    } else {
      finalPayMethod = "เงินโอน";
      finalStatus = transferSlipUrl ? "ชำระแล้ว" : "รอตรวจสอบ";
    }

    let prepaidObj = null;
    if (!transferSlipUrl && finalPayMethod !== "เงินสด") {
      prepaidObj = DB_PopPrepaidStoreSlip(storeName);
      if (prepaidObj && prepaidObj.slipUrl) {
        transferSlipUrl = prepaidObj.slipUrl;
        finalStatus = "ชำระแล้ว";
        noteText = (noteText ? noteText + " " : "") + "[Auto-Match สลิปโอนล่วงหน้า]";
      }
    }

    let nextOrderNo = generateNextOrderId(mainSheet, COL.orderId);
    let newOrderId = "#" + nextOrderNo;
    let now = new Date();
    let nowStr = Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy HH:mm");

    let rowArr = new Array(26).fill("");
    rowArr[COL.timestamp] = now;
    rowArr[COL.sender] = sender;
    rowArr[COL.g15] = g15;
    rowArr[COL.g48] = g48;
    rowArr[COL.cans] = cans;
    rowArr[COL.store] = storeName;
    rowArr[COL.payMethod] = finalPayMethod;
    rowArr[COL.slipUrl] = receiptUrl;
    rowArr[COL.total] = totalSales;
    rowArr[COL.cashReceived] = (finalPayMethod === "เงินสด") ? totalSales : 0;
    rowArr[COL.transferAmt] = (finalPayMethod === "เงินโอน") ? totalSales : 0;
    rowArr[COL.fuelCost] = fuelCost;
    rowArr[COL.fuelSlipUrl] = fuelSlipUrl;
    rowArr[COL.orderId] = newOrderId;
    rowArr[COL.status] = finalStatus;
    rowArr[COL.matchSlipUrl] = transferSlipUrl || "";
    rowArr[COL.matchTime] = transferSlipUrl ? nowStr : "";
    rowArr[COL.note] = noteText;

    mainSheet.appendRow(rowArr);
    let newRowIdx = mainSheet.getLastRow();
    try { mainSheet.getRange(newRowIdx, COL.timestamp + 1).setNumberFormat("dd/MM/yyyy HH:mm:ss"); } catch (e) {}

    if (payload.queueOrderId) {
      DB_UpdateQueueStatusById(payload.queueOrderId, "จัดส่งแล้ว");
    } else {
      DB_MarkQueueDeliveredByStore(storeName);
    }

    let props = PropertiesService.getScriptProperties();
    props.setProperty("pending_15", String(parseNum(props.getProperty("pending_15")) + g15));
    props.setProperty("pending_48", String(parseNum(props.getProperty("pending_48")) + g48));
    props.setProperty("pending_can", String(parseNum(props.getProperty("pending_can")) + cans));

    DB_ClearTxCache();

    return {
      success: true,
      rowIdx: newRowIdx,
      orderId: newOrderId,
      storeName: storeName,
      driver: sender,
      total: totalSales,
      payMethod: finalPayMethod,
      status: finalStatus,
      fuelCost: fuelCost,
      autoMatchedPrepaid: Boolean(prepaidObj),
      hasTransferSlip: Boolean(transferSlipUrl)
    };
  } catch (e) {
    Logger.log("DB_RecordStaffDeliveryToMainSheet Error: " + e.message);
    return { success: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

// ==========================================
// 🚀 6. 5X SPEED TRANSACTION READER WITH CACHESERVICE RAM
// ==========================================

function DB_ParseRawRowsToTxList(data, startRowNumber) {
  let storePriceMap = {};
  let allStores = DB_GetAllActiveStores();
  for (let j = 0; j < allStores.length; j++) {
    let st = allStores[j];
    let info = { p15: st.price15, p48: st.price48, pCan: st.priceCan };
    storePriceMap[st.storeName] = info;
    storePriceMap[st.storeId] = info;
  }

  let txList = [];
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    if (!row[COL.timestamp] && !row[COL.store]) continue;

    let senderName = DB_SanitizeText(row[COL.sender]);
    if (senderName === "ป่าน") senderName = "ปาน";
    let colVOrderId = DB_SanitizeText(row[COL.orderId]);
    let colUBillingId = DB_SanitizeText(row[COL.billingId]);
    let rawOrderId = colVOrderId || colUBillingId;
    let rowStatus = DB_SanitizeText(row[COL.status]);

    if (senderName === "สั่งผ่านบอท" || rawOrderId.toUpperCase().startsWith("#Q") || rowStatus === "รอดำเนินการ" || rowStatus === "จัดส่งแล้ว") {
      continue;
    }

    let storeName = normalizeStoreName(row[COL.store]);
    let g15 = parseNum(row[COL.g15]);
    let g48 = parseNum(row[COL.g48]);
    let cans = parseNum(row[COL.cans]);
    let total = parseNum(row[COL.total]);

    if (total === 0 && (g15 > 0 || g48 > 0 || cans > 0)) {
      let pInfo = storePriceMap[storeName];
      if (!pInfo) {
        let m = storeName.match(/\[(ST-\d+)\]/i);
        if (m && storePriceMap[m[1].toUpperCase()]) pInfo = storePriceMap[m[1].toUpperCase()];
      }
      let r15 = pInfo ? pInfo.p15 : 490;
      let r48 = pInfo ? pInfo.p48 : 1530;
      let rCan = pInfo ? pInfo.pCan : 790;
      total = (g15 * r15) + (g48 * r48) + (cans * rCan);
    }

    let realRowIdx = startRowNumber + i;
    let displayOrderId = rawOrderId || ("#" + (realRowIdx - 1));
    if (displayOrderId && !displayOrderId.startsWith("#")) displayOrderId = "#" + displayOrderId;

    let parsedDateObj = parseSheetDate(row[COL.timestamp]);
    let dateMs = parsedDateObj ? parsedDateObj.getTime() : 0;

    txList.push({
      rowIdx: realRowIdx,
      date: dateMs > 0 ? dateMs : row[COL.timestamp],
      sender: senderName || "-",
      g15: g15,
      g48: g48,
      cans: cans,
      store: storeName,
      payMethod: DB_SanitizeText(row[COL.payMethod]) || "-",
      slipUrl: DB_SanitizeText(row[COL.slipUrl]),
      cashReceived: parseNum(row[COL.cashReceived]),
      total: total,
      fuelCost: parseNum(row[COL.fuelCost]),
      missingCylinders: parseNum(row[COL.missingCylinders]),
      fuelSlipUrl: DB_SanitizeText(row[COL.fuelSlipUrl]),
      transferAmt: parseNum(row[COL.transferAmt]),
      billingId: colUBillingId,
      orderId: displayOrderId,
      status: rowStatus,
      matchSlipUrl: DB_SanitizeText(row[COL.matchSlipUrl]),
      note: DB_SanitizeText(row[COL.note])
    });
  }
  return txList;
}

function DB_GetRecentTransactions(maxRows) {
  let limit = maxRows || CONFIG.FAST_SCAN_ROWS || 100;
  if (TX_RECENT_CACHE && TX_RECENT_CACHE.length >= limit) return TX_RECENT_CACHE;

  let cache = CacheService.getScriptCache();
  if (limit <= 100) {
    let ramStr = cache.get("RECENT_TX_RAM_V47_0");
    if (ramStr) {
      try {
        TX_RECENT_CACHE = JSON.parse(ramStr);
        return TX_RECENT_CACHE;
      } catch (e) {}
    }
  }

  try {
    let sheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    let startRow = Math.max(2, lastRow - limit + 1);
    let numRows = lastRow - startRow + 1;
    let maxCols = Math.min(26, sheet.getLastColumn());
    let data = sheet.getRange(startRow, 1, numRows, maxCols).getValues();

    TX_RECENT_CACHE = DB_ParseRawRowsToTxList(data, startRow);
    if (limit <= 100) {
      try { cache.put("RECENT_TX_RAM_V47_0", JSON.stringify(TX_RECENT_CACHE), 300); } catch (err) {}
    }
    return TX_RECENT_CACHE;
  } catch (e) {
    return [];
  }
}

function DB_GetTransactions(onlyRecent) {
  if (onlyRecent) return DB_GetRecentTransactions(CONFIG.FAST_SCAN_ROWS);
  if (TX_MEM_CACHE) return TX_MEM_CACHE;

  let cache = CacheService.getScriptCache();
  let p0 = cache.get("FULL_TX_RAM_V47_0_P0");
  if (p0) {
    try {
      let p1 = cache.get("FULL_TX_RAM_V47_0_P1") || "";
      TX_MEM_CACHE = JSON.parse(p0 + p1);
      return TX_MEM_CACHE;
    } catch (e) {}
  }

  try {
    let sheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    let scanRows = CONFIG.MAX_TX_SCAN_ROWS || 800;
    let startRow = Math.max(2, lastRow - scanRows + 1);
    let numRows = lastRow - startRow + 1;
    let maxCols = Math.min(26, sheet.getLastColumn());
    let data = sheet.getRange(startRow, 1, numRows, maxCols).getValues();

    TX_MEM_CACHE = DB_ParseRawRowsToTxList(data, startRow);

    try {
      let fullJson = JSON.stringify(TX_MEM_CACHE);
      if (fullJson.length < 90000) {
        cache.put("FULL_TX_RAM_V47_0_P0", fullJson, 300);
        cache.remove("FULL_TX_RAM_V47_0_P1");
      } else if (fullJson.length < 180000) {
        cache.put("FULL_TX_RAM_V47_0_P0", fullJson.substring(0, 90000), 300);
        cache.put("FULL_TX_RAM_V47_0_P1", fullJson.substring(90000), 300);
      }
    } catch (err) {}

    return TX_MEM_CACHE;
  } catch (e) {
    return [];
  }
}

function DB_GetTransactionsByYearMonth(targetYear, targetMonth0Based) {
  let combined = [];
  let seenKeys = {};

  let mainTx = DB_GetTransactions(false);
  for (let i = 0; i < mainTx.length; i++) {
    let tx = mainTx[i];
    let dObj = parseSheetDate(tx.date);
    if (dObj && dObj.getFullYear() === targetYear && dObj.getMonth() === targetMonth0Based) {
      let key = String(tx.orderId) + "_" + dObj.getTime();
      seenKeys[key] = true;
      combined.push(tx);
    }
  }

  try {
    let ymStr = targetYear + "_" + String(targetMonth0Based + 1).padStart(2, "0");
    let archSheet = DB_GetSpreadsheet().getSheetByName("สรุปขาย_" + ymStr);
    if (archSheet && archSheet.getLastRow() >= 2) {
      let maxCols = Math.min(26, archSheet.getLastColumn());
      let archData = archSheet.getRange(2, 1, archSheet.getLastRow() - 1, maxCols).getValues();
      let archTx = DB_ParseRawRowsToTxList(archData, 2);
      for (let j = 0; j < archTx.length; j++) {
        let atx = archTx[j];
        let dObj = parseSheetDate(atx.date);
        if (dObj && dObj.getFullYear() === targetYear && dObj.getMonth() === targetMonth0Based) {
          let key = String(atx.orderId) + "_" + dObj.getTime();
          if (!seenKeys[key]) {
            seenKeys[key] = true;
            combined.push(atx);
          }
        }
      }
    }
  } catch (e) {}

  return combined;
}

// ==========================================
// 🕒 7. DEEP DRIVE TIMESTAMP DATE HEALER + ZERO-DELETE
// ==========================================

function DB_GetQueueSheetSafe() {
  let ss = DB_GetSpreadsheet();
  let qSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!qSheet) {
    qSheet = ss.insertSheet(CONFIG.SHEET_QUEUE);
    let headers = [
      "วัน-เวลาที่สั่ง", "รหัสคิว (#Q)", "ชื่อร้านค้า", "ถัง 15 กก.", "ถัง 48 กก.",
      "แก๊สกระป๋อง", "ยอดรวม (บาท)", "สถานะคิว", "ลิงก์ใบส่งของ A4", "หมายเหตุรอบส่ง", "เวลาส่งสำเร็จ"
    ];
    qSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    qSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E8F6FC");
  }
  return qSheet;
}

function DB_RestoreArchivedSalesToMain() {
  try {
    let ss = DB_GetSpreadsheet();
    let mainSheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let archSheet = ss.getSheetByName("สรุปขาย_2026_10");
    if (!archSheet || archSheet.getLastRow() < 2) return 0;

    let maxCols = Math.max(26, mainSheet.getLastColumn(), archSheet.getLastColumn());
    let mainLastRow = mainSheet.getLastRow();
    let mainData = mainLastRow >= 2 ? mainSheet.getRange(2, 1, mainLastRow - 1, maxCols).getValues() : [];
    let archData = archSheet.getRange(2, 1, archSheet.getLastRow() - 1, maxCols).getValues();

    let existingOrderIds = {};
    let existingTimeStore = {};

    for (let i = 0; i < mainData.length; i++) {
      let oId = DB_SanitizeText(mainData[i][COL.orderId]);
      if (oId) existingOrderIds[oId] = i + 2;
      let dObj = parseSheetDate(mainData[i][COL.timestamp]);
      let sName = normalizeStoreName(mainData[i][COL.store]);
      if (dObj && sName) existingTimeStore[dObj.getTime() + "_" + sName] = i + 2;
    }

    let rowsToRestore = [];
    let updatedSlipCount = 0;

    for (let j = 0; j < archData.length; j++) {
      let aRow = archData[j];
      let aId = DB_SanitizeText(aRow[COL.orderId]);
      let aSlipX = DB_SanitizeText(aRow[COL.matchSlipUrl]);
      let aTimeY = DB_SanitizeText(aRow[COL.matchTime]);
      let aDate = parseSheetDate(aRow[COL.timestamp]);
      let aStore = normalizeStoreName(aRow[COL.store]);
      let tsKey = (aDate && aStore) ? (aDate.getTime() + "_" + aStore) : "";

      let matchMainRowIdx = (aId && existingOrderIds[aId]) ? existingOrderIds[aId] : (tsKey && existingTimeStore[tsKey] ? existingTimeStore[tsKey] : 0);

      if (matchMainRowIdx > 0) {
        if (aSlipX) {
          let curSlip = DB_SanitizeText(mainSheet.getRange(matchMainRowIdx, COL.matchSlipUrl + 1).getValue());
          if (!curSlip) {
            mainSheet.getRange(matchMainRowIdx, COL.matchSlipUrl + 1, 1, 2).setValues([[aSlipX, aTimeY]]);
            updatedSlipCount++;
          }
        }
      } else if (aDate && aStore && aStore !== "-") {
        while (aRow.length < maxCols) aRow.push("");
        aRow[COL.store] = aStore;
        rowsToRestore.push(aRow.slice(0, maxCols));
      }
    }

    if (rowsToRestore.length > 0) {
      mainSheet.getRange(mainSheet.getLastRow() + 1, 1, rowsToRestore.length, maxCols).setValues(rowsToRestore);
    }

    return rowsToRestore.length + updatedSlipCount;
  } catch (e) {
    Logger.log("DB_RestoreArchivedSalesToMain Error: " + e.message);
    return 0;
  }
}

function DB_NormalizeDatesAndOrderIdsBatch(sheet, allowDriveTimestampLookup) {
  try {
    let mainSheet = sheet || DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let lastRow = mainSheet.getLastRow();
    if (lastRow < 2) return { filledOrderIds: 0, healedDates: 0, driveVerified: 0 };

    let numRows = lastRow - 1;
    let maxCols = Math.max(26, mainSheet.getLastColumn());
    let dataRange = mainSheet.getRange(2, 1, numRows, maxCols);
    let allData = dataRange.getValues();

    let props = PropertiesService.getScriptProperties();
    let verifiedRowsMap = {};
    try {
      let savedMapStr = props.getProperty("DRIVE_VERIFIED_ROWS_V47_0");
      if (savedMapStr) verifiedRowsMap = JSON.parse(savedMapStr);
    } catch (e) {}

    let nowLimitMs = new Date().getTime() + 43200000;
    let runningMaxId = 0;
    let filledOrderIds = 0;
    let healedDates = 0;
    let driveLookupsUsed = 0;
    let maxDriveLookups = allowDriveTimestampLookup ? 100 : 0;
    let hasChanges = false;
    let prevValidDate = new Date(2026, 4, 1, 9, 0, 0);

    for (let r = 0; r < allData.length; r++) {
      let row = allData[r];
      let realRowNumber = r + 2;
      let sender = DB_SanitizeText(row[COL.sender]);
      let status = DB_SanitizeText(row[COL.status]);

      if (sender === "ป่าน") {
        row[COL.sender] = "ปาน";
        hasChanges = true;
      }

      let rawStoreCell = DB_SanitizeText(row[COL.store]);
      if (rawStoreCell) {
        let cleanStoreCell = normalizeStoreName(rawStoreCell);
        if (cleanStoreCell && cleanStoreCell !== rawStoreCell && cleanStoreCell !== "-") {
          row[COL.store] = cleanStoreCell;
          hasChanges = true;
        }
      }

      if (sender === "สั่งผ่านบอท" || status === "จัดส่งแล้ว" || status === "รอดำเนินการ") continue;

      let curIdV = String(row[COL.orderId] || "").trim();
      let curIdU = String(row[COL.billingId] || "").trim();

      if (curIdV && !curIdV.toUpperCase().startsWith("#Q")) {
        let num = parseInt(curIdV.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(num) && num > runningMaxId) runningMaxId = num;
        if (!curIdV.startsWith("#")) {
          row[COL.orderId] = "#" + curIdV;
          curIdV = row[COL.orderId];
          hasChanges = true;
        }
      } else if (curIdU && !curIdU.toUpperCase().startsWith("#Q") && !curIdU.toUpperCase().startsWith("B") && !curIdU.toUpperCase().startsWith("INV-")) {
        let fixedId = curIdU.startsWith("#") ? curIdU : ("#" + curIdU);
        row[COL.orderId] = fixedId;
        curIdV = fixedId;
        let numU = parseInt(fixedId.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(numU) && numU > runningMaxId) runningMaxId = numU;
        filledOrderIds++;
        hasChanges = true;
      } else if (row[COL.timestamp] || row[COL.store]) {
        let assignedId = "";
        if (runningMaxId > 10000000) {
          runningMaxId++;
          assignedId = "#" + runningMaxId;
        } else {
          assignedId = "#" + (realRowNumber - 1);
        }
        row[COL.orderId] = assignedId;
        curIdV = assignedId;
        filledOrderIds++;
        hasChanges = true;
      }

      let rawTs = row[COL.timestamp];
      let parsedTs = parseSheetDate(rawTs);
      let slipUrlH = DB_SanitizeText(row[COL.slipUrl]);
      let fuelUrlM = DB_SanitizeText(row[COL.fuelSlipUrl]);
      let targetUrl = slipUrlH || fuelUrlM;

      let mBillDate = curIdV.match(/^#?T?(09|10|11|12)(\d{2})[-_]?(\d{2})?(\d{2})?/);
      let isAmbiguousDayMonth = parsedTs && (parsedTs.getDate() <= 12 && (parsedTs.getMonth() + 1) <= 12 && parsedTs.getDate() !== (parsedTs.getMonth() + 1));
      let isFutureOrInvalid = !(rawTs instanceof Date) || !parsedTs || (rawTs instanceof Date && rawTs.getTime() > nowLimitMs);
      let isOutOfOrderJump = parsedTs && prevValidDate && (Math.abs(parsedTs.getTime() - prevValidDate.getTime()) > 15 * 86400000);

      let needsDriveCheck = allowDriveTimestampLookup && targetUrl && !verifiedRowsMap[realRowNumber] &&
                            (isFutureOrInvalid || isAmbiguousDayMonth || isOutOfOrderJump);

      let finalDate = parsedTs;

      if (needsDriveCheck && driveLookupsUsed < maxDriveLookups) {
        driveLookupsUsed++;
        let driveDate = DB_GetDriveFileCreatedDate(targetUrl);
        if (driveDate && !isNaN(driveDate.getTime())) {
          verifiedRowsMap[realRowNumber] = 1;
          if (!finalDate || Math.abs(finalDate.getTime() - driveDate.getTime()) > 2 * 86400000) {
            finalDate = driveDate;
            healedDates++;
            hasChanges = true;
          }
        }
      }

      if (mBillDate && finalDate) {
        let bm0 = parseInt(mBillDate[1], 10) - 1;
        let bd = parseInt(mBillDate[2], 10);
        if (finalDate.getMonth() !== bm0 || finalDate.getDate() !== bd) {
          let bh = finalDate.getHours() || (mBillDate[3] ? parseInt(mBillDate[3], 10) : 12);
          let bmin = finalDate.getMinutes() || (mBillDate[4] ? parseInt(mBillDate[4], 10) : 0);
          finalDate = new Date(2026, bm0, bd, Math.min(23, bh), Math.min(59, bmin), 0);
          healedDates++;
          hasChanges = true;
        }
      }

      if (finalDate && prevValidDate && Math.abs(finalDate.getTime() - prevValidDate.getTime()) > 20 * 86400000) {
        let dDay = finalDate.getDate();
        let dMon1 = finalDate.getMonth() + 1;
        if (dDay <= 12 && dMon1 <= 12) {
          let flippedCandidate = new Date(finalDate.getFullYear(), dDay - 1, dMon1, finalDate.getHours(), finalDate.getMinutes(), finalDate.getSeconds());
          if (flippedCandidate.getTime() <= nowLimitMs && Math.abs(flippedCandidate.getTime() - prevValidDate.getTime()) < Math.abs(finalDate.getTime() - prevValidDate.getTime())) {
            finalDate = flippedCandidate;
            healedDates++;
            hasChanges = true;
          }
        }
      }

      if (!finalDate || isNaN(finalDate.getTime())) {
        finalDate = new Date(prevValidDate.getTime() + 60000);
        healedDates++;
        hasChanges = true;
      }

      if (!(rawTs instanceof Date) || rawTs.getTime() !== finalDate.getTime()) {
        row[COL.timestamp] = finalDate;
        healedDates++;
        hasChanges = true;
      }

      prevValidDate = finalDate;
    }

    if (hasChanges) {
      dataRange.setValues(allData);
    }

    if (driveLookupsUsed > 0) {
      try { props.setProperty("DRIVE_VERIFIED_ROWS_V47_0", JSON.stringify(verifiedRowsMap)); } catch (e) {}
    }

    try {
      mainSheet.getRange(2, COL.timestamp + 1, numRows, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      if (allowDriveTimestampLookup && numRows > 1) {
        dataRange.sort({ column: COL.timestamp + 1, ascending: true });
      }
    } catch (e) {}

    return {
      filledOrderIds: filledOrderIds,
      healedDates: healedDates,
      driveVerified: Object.keys(verifiedRowsMap).length
    };
  } catch (e) {
    Logger.log("DB_NormalizeDatesAndOrderIdsBatch Error: " + e.message);
    return { filledOrderIds: 0, healedDates: 0, driveVerified: 0 };
  }
}

function DB_FillMissingOrderIdsOnly(sheet) {
  let res = DB_NormalizeDatesAndOrderIdsBatch(sheet, false);
  return res.filledOrderIds;
}

function DB_MigrateAndCleanBotRowsFromMainSheet(forceRun) {
  const lock = LockService.getScriptLock();
  try {
    let props = PropertiesService.getScriptProperties();
    if (!forceRun && props.getProperty("HEALED_ZERO_DELETE_V47_0") === "DONE") {
      return { cleanedCount: 0, migratedCount: 0, filledOrderIds: 0, healedDates: 0, driveVerified: 0, restoredCount: 0 };
    }

    lock.waitLock(20000);
    DB_RepairCorruptedGroupIds();
    let restoredCount = DB_RestoreArchivedSalesToMain();

    let mainSheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let normRes = DB_NormalizeDatesAndOrderIdsBatch(mainSheet, true);

    props.setProperty("HEALED_ZERO_DELETE_V47_0", "DONE");
    DB_ClearTxCache();
    return {
      cleanedCount: 0,
      migratedCount: 0,
      filledOrderIds: normRes.filledOrderIds,
      healedDates: normRes.healedDates,
      driveVerified: normRes.driveVerified,
      restoredCount: restoredCount
    };
  } catch (e) {
    Logger.log("DB_MigrateAndCleanBotRowsFromMainSheet Error: " + e.message);
    return { cleanedCount: 0, migratedCount: 0, filledOrderIds: 0, healedDates: 0, driveVerified: 0, restoredCount: 0, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_GenerateNextQueueId() {
  try {
    let qSheet = DB_GetQueueSheetSafe();
    let lastRow = qSheet.getLastRow();
    if (lastRow < 2) return "#Q001";

    let startRow = Math.max(2, lastRow - 80);
    let numRows = lastRow - startRow + 1;
    let ids = qSheet.getRange(startRow, COL_QUEUE.orderId + 1, numRows, 1).getValues();
    let maxNum = 0;
    for (let i = 0; i < ids.length; i++) {
      let s = String(ids[i][0] || "");
      let num = parseInt(s.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(num) && num < 9000 && num > maxNum) maxNum = num;
    }
    return "#Q" + String(maxNum + 1).padStart(3, "0");
  } catch (e) {
    return "#Q" + String(Math.floor(100 + Math.random() * 899));
  }
}

function DB_CreateQueueOrder(storeName, g15, g48, cans, totalAmount, orderId, invoicePdfUrl, scheduleNote) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let qSheet = DB_GetQueueSheetSafe();
    let finalOrderId = orderId || DB_GenerateNextQueueId();

    qSheet.appendRow([
      new Date(),
      finalOrderId,
      normalizeStoreName(storeName),
      g15 || 0,
      g48 || 0,
      cans || 0,
      totalAmount || 0,
      "รอดำเนินการ",
      invoicePdfUrl || "",
      scheduleNote || "",
      ""
    ]);

    QUEUE_MEM_CACHE = null;
    try { CacheService.getScriptCache().remove("PENDING_QUEUE_V47_0"); } catch (e) {}
    return true;
  } catch (e) {
    return false;
  } finally {
    lock.releaseLock();
  }
}

function DB_GetPendingOrders(forceRefresh) {
  try {
    if (!forceRefresh && QUEUE_MEM_CACHE) return QUEUE_MEM_CACHE;
    let cache = CacheService.getScriptCache();
    if (!forceRefresh) {
      let cachedStr = cache.get("PENDING_QUEUE_V47_0");
      if (cachedStr) {
        try {
          QUEUE_MEM_CACHE = JSON.parse(cachedStr);
          return QUEUE_MEM_CACHE;
        } catch (e) {}
      }
    }

    let qSheet = DB_GetQueueSheetSafe();
    let lastRow = qSheet.getLastRow();
    if (lastRow < 2) return [];

    let startRow = Math.max(2, lastRow - 60);
    let numRows = lastRow - startRow + 1;
    let data = qSheet.getRange(startRow, 1, numRows, 11).getValues();
    let pendingList = [];

    for (let i = 0; i < data.length; i++) {
      let row = data[i];
      let status = DB_SanitizeText(row[COL_QUEUE.status]);
      if (status === "รอดำเนินการ" || status === "รอส่ง") {
        let dObj = parseSheetDate(row[COL_QUEUE.timestamp]);
        pendingList.push({
          rowIdx: startRow + i,
          time: dObj ? Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yyyy HH:mm") : "-",
          orderId: DB_SanitizeText(row[COL_QUEUE.orderId]),
          store: normalizeStoreName(row[COL_QUEUE.store]),
          g15: parseNum(row[COL_QUEUE.g15]),
          g48: parseNum(row[COL_QUEUE.g48]),
          cans: parseNum(row[COL_QUEUE.cans]),
          total: parseNum(row[COL_QUEUE.total]),
          status: status,
          slipUrl: DB_SanitizeText(row[COL_QUEUE.pdfUrl]),
          note: DB_SanitizeText(row[COL_QUEUE.note])
        });
      }
    }

    QUEUE_MEM_CACHE = pendingList;
    try { cache.put("PENDING_QUEUE_V47_0", JSON.stringify(pendingList), 180); } catch (err) {}
    return pendingList;
  } catch (e) {
    return [];
  }
}

function DB_GetQueueOrderById(queueOrderId) {
  let pending = DB_GetPendingOrders(true);
  let target = String(queueOrderId || "").trim().toUpperCase();
  if (!target.startsWith("#")) target = "#" + target;
  for (let i = 0; i < pending.length; i++) {
    if (String(pending[i].orderId).trim().toUpperCase() === target) {
      return pending[i];
    }
  }
  return null;
}

function DB_MarkQueueDeliveredByStore(storeName) {
  try {
    let targetStore = normalizeStoreName(storeName);
    let cache = CacheService.getScriptCache();

    if (cache.get("MANUAL_Q_DONE_" + targetStore)) {
      cache.remove("MANUAL_Q_DONE_" + targetStore);
      return true;
    }

    let qSheet = DB_GetQueueSheetSafe();
    let lastRow = qSheet.getLastRow();
    if (lastRow < 2) return false;

    let startRow = Math.max(2, lastRow - 60);
    let numRows = lastRow - startRow + 1;
    let data = qSheet.getRange(startRow, 1, numRows, 11).getValues();
    let nowStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm");

    for (let i = 0; i < data.length; i++) {
      let rowStore = normalizeStoreName(data[i][COL_QUEUE.store]);
      let status = DB_SanitizeText(data[i][COL_QUEUE.status]);
      if (rowStore === targetStore && (status === "รอดำเนินการ" || status === "รอส่ง")) {
        qSheet.getRange(startRow + i, COL_QUEUE.status + 1).setValue("จัดส่งแล้ว");
        qSheet.getRange(startRow + i, COL_QUEUE.deliveredTime + 1).setValue(nowStr);
        QUEUE_MEM_CACHE = null;
        try { cache.remove("PENDING_QUEUE_V47_0"); } catch (e) {}
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function DB_UpdateQueueStatusById(queueOrderId, newStatus) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    let qSheet = DB_GetQueueSheetSafe();
    let lastRow = qSheet.getLastRow();
    if (lastRow < 2) return { success: false, msg: "ไม่มีคิวในระบบ" };

    let startRow = Math.max(2, lastRow - 80);
    let numRows = lastRow - startRow + 1;
    let data = qSheet.getRange(startRow, 1, numRows, 11).getValues();
    let target = String(queueOrderId || "").trim().toUpperCase();
    if (!target.startsWith("#")) target = "#" + target;

    let nowStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm");

    for (let i = data.length - 1; i >= 0; i--) {
      let qId = String(data[i][COL_QUEUE.orderId] || "").trim().toUpperCase();
      if (qId === target) {
        let storeName = normalizeStoreName(data[i][COL_QUEUE.store]);
        qSheet.getRange(startRow + i, COL_QUEUE.status + 1).setValue(newStatus);
        qSheet.getRange(startRow + i, COL_QUEUE.deliveredTime + 1).setValue(nowStr);
        QUEUE_MEM_CACHE = null;
        try {
          let cache = CacheService.getScriptCache();
          cache.remove("PENDING_QUEUE_V47_0");
          if (newStatus === "จัดส่งแล้ว") {
            cache.put("MANUAL_Q_DONE_" + storeName, "1", 1200);
          }
        } catch (e) {}
        return { success: true, orderId: qId, storeName: storeName, newStatus: newStatus };
      }
    }
    return { success: false, msg: `ไม่พบรหัสคิว ${target}` };
  } catch (e) {
    return { success: false, msg: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_ArchiveCompletedMonthlySales() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    let ss = DB_GetSpreadsheet();
    let mainSheet = DB_GetSheetSafe(CONFIG.SHEET_MAIN_SALES);
    let lastRow = mainSheet.getLastRow();
    if (lastRow < 2) return { archivedCount: 0, keptUnpaidCount: 0 };

    let now = new Date();
    let firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    let maxCols = Math.max(26, mainSheet.getLastColumn());
    let allData = mainSheet.getRange(1, 1, lastRow, maxCols).getValues();
    let headerRow = allData[0];

    let archiveBuckets = {};
    let keptUnpaidCount = 0;
    let backedUpCount = 0;

    for (let i = 1; i < allData.length; i++) {
      let row = allData[i];
      let rDate = parseSheetDate(row[COL.timestamp]);
      if (!rDate || rDate >= firstDayCurrentMonth) continue;

      let status = DB_SanitizeText(row[COL.status]);
      let sender = DB_SanitizeText(row[COL.sender]);
      if (sender === "สั่งผ่านบอท" || status === "จัดส่งแล้ว") continue;

      if (status.indexOf("ชำระแล้ว") !== -1 || status === "ยกเลิก") {
        let ymKey = Utilities.formatDate(rDate, "Asia/Bangkok", "yyyy_MM");
        let archiveSheetName = "สรุปขาย_" + ymKey;
        if (!archiveBuckets[archiveSheetName]) archiveBuckets[archiveSheetName] = [];
        archiveBuckets[archiveSheetName].push(row);
      } else {
        keptUnpaidCount++;
      }
    }

    for (let sheetName in archiveBuckets) {
      let rows = archiveBuckets[sheetName];
      if (rows.length === 0) continue;
      let archSheet = ss.getSheetByName(sheetName);
      if (!archSheet) {
        archSheet = ss.insertSheet(sheetName);
        archSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]).setFontWeight("bold");
      } else {
        archSheet.clearContents();
        archSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]).setFontWeight("bold");
      }
      archSheet.getRange(2, 1, rows.length, headerRow.length).setValues(rows);
      backedUpCount += rows.length;
    }

    DB_ClearTxCache();
    return { archivedCount: backedUpCount, keptUnpaidCount: keptUnpaidCount };
  } catch (e) {
    return { archivedCount: 0, keptUnpaidCount: 0, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function DB_LogCashDepositHistory(driverName, billRangeStr, billCount, totalCash, totalFuel, netDeposited) {
  try {
    let ss = DB_GetSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_CASH_LOGS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_CASH_LOGS);
      sheet.appendRow(["วัน-เวลาที่บันทึกฝาก", "ผู้ฝากเงิน", "ช่วงเลขที่บิล", "จำนวนบิล", "รับเงินสดรวม", "หักค่าน้ำมัน", "ยอดเงินสดนำฝากสุทธิ"]);
      sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#E8F6FC");
    }
    sheet.appendRow([new Date(), driverName, billRangeStr, billCount, totalCash, totalFuel, netDeposited]);
  } catch (e) {}
}

function DB_LogChat(platform, sourceId, userId, message) {
  try {
    let ss = DB_GetSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_CHAT_LOGS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_CHAT_LOGS);
      sheet.appendRow(["Timestamp", "Platform", "Source_ID", "Message"]);
    }
    sheet.appendRow([new Date(), platform, sourceId || userId, message]);
  } catch (e) {}
}
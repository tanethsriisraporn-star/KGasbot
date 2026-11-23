// ============================================================================
// 🚀 File: 15_Patch_Overrides.gs (DIRECT FUNCTION ROUTER + PURE ORDER CACHE + HISTORY)
// Version: 66.0 (0.0001s Hash-Map Command Dispatch + Instant Store Flex + Bill History)
// ============================================================================

var P15_EPSON_EMAIL = "pgv75281djqp98@print.epsonconnect.com";
var P15_FLEX_CACHE_TTL = 21600; // จำการ์ดสั่งแก๊สรายร้านใน RAM นาน 6 ชั่วโมง

// ============================================================================
// ⚡ ส่วนที่ 1: PURE ORDER CACHE แยกรายร้านค้า (กดสั่งแก๊สเด้งทันทีใน 0.05 วินาที)
// ============================================================================

function P15_BuildPrebuiltStoreFlexSet_(stObj, debtDetails) {
  var st = stObj || { storeId: "ST-000", storeName: "ลูกค้า", price15: 490, price48: 1530, priceCan: 790, creditTerm: "" };
  var sName = (typeof DB_CleanStorePrefix === "function") ? DB_CleanStorePrefix(st.storeName, st.storeId) : st.storeName;
  var p15 = Number(st.price15 || 490);
  var p48 = Number(st.price48 || 1530);
  var pCan = Number(st.priceCan || 790);
  var creditTerm = String(st.creditTerm || "").trim();
  var isCreditStore = (creditTerm === "15" || creditTerm === "30");

  var pendingDebt = debtDetails ? Number(debtDetails.pendingDebt || 0) : 0;
  var bills = (debtDetails && debtDetails.bills) ? debtDetails.bills : [];

  var makeChoiceRow = function(leftTxt, rightTxt, cmd, bgColor, txtColor) {
    return {
      type: "box",
      layout: "horizontal",
      backgroundColor: bgColor || "#F8FAFC",
      borderColor: "#E2E8F0",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "12px",
      action: { type: "message", label: leftTxt.substring(0, 20), text: cmd },
      contents: [
        { type: "text", text: leftTxt, size: "xs", weight: "bold", color: txtColor || "#111111", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: rightTxt, size: "xs", weight: "bold", color: txtColor ? "#FFFFFF" : "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    };
  };

  var step1Body = [];

  // แสดงเฉพาะบิลค้างปัจจุบัน (ไม่เก็บบิลเก่าที่จ่ายแล้วให้หนักแคช)
  if (pendingDebt > 0 && bills.length > 0) {
    var debtBoxColor = isCreditStore ? "#F0F8FC" : "#FFF7ED";
    var debtBorderColor = isCreditStore ? "#BAE6FD" : "#FED7AA";
    var debtTitle = isCreditStore
      ? ("🧾 ยอดเครดิต " + creditTerm + " วัน: " + pendingDebt.toLocaleString("en") + " บ.")
      : ("💳 ยอดค้างชำระ (" + bills.length + " บิล): " + pendingDebt.toLocaleString("en") + " บ.");

    var debtContents = [
      { type: "text", text: debtTitle, size: "xs", weight: "bold", color: isCreditStore ? "#0369A1" : "#C2410C", maxLines: 1, adjustMode: "shrink-to-fit" }
    ];

    var showBills = bills.slice(-3);
    for (var bIdx = 0; bIdx < showBills.length; bIdx++) {
      var b = showBills[bIdx];
      debtContents.push({
        type: "text",
        text: "• " + b.orderId + " (" + (b.shortDateStr || b.dateStr) + ") = " + Number(b.amount || b.total || 0).toLocaleString("en") + " บ.",
        size: "xxs",
        color: "#334155",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      });
    }

    if (!isCreditStore) {
      debtContents.push({
        type: "text",
        text: "🏦 ธ.กรุงเทพ 252-451-1777 (ภานุพงศ์ ดุมคำ)",
        size: "xxs",
        weight: "bold",
        color: "#111111",
        margin: "xs",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      });
    }

    debtContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#111111",
      cornerRadius: "6px",
      paddingAll: "8px",
      margin: "sm",
      action: { type: "message", label: "📄 รูปใบแจ้งหนี้", text: "ขอดูใบแจ้งหนี้_" + (st.storeId || st.storeName) },
      contents: [
        { type: "text", text: "📄 ดูรูปใบแจ้งหนี้ / ใบวางบิล (JPEG)", size: "xxs", weight: "bold", color: "#FFFFFF", align: "center" }
      ]
    });

    step1Body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: debtBoxColor,
      borderColor: debtBorderColor,
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      spacing: "xs",
      contents: debtContents
    });
    step1Body.push({ type: "separator", margin: "sm", color: "#E2E8F0" });
  }

  step1Body.push({ type: "text", text: "🛒 กดเลือกขนาดแก๊สเพื่อสั่งซื้อ", size: "xs", weight: "bold", color: "#111111", maxLines: 1 });
  step1Body.push(makeChoiceRow("🛢️ ถังแก๊ส 15 กก.", p15.toLocaleString("en") + " บ./ถัง", "เลือก_15"));
  step1Body.push(makeChoiceRow("🛢️ ถังแก๊ส 48 กก.", p48.toLocaleString("en") + " บ./ถัง", "เลือก_48"));
  step1Body.push(makeChoiceRow("🥫 แก๊สกระป๋อง", pCan.toLocaleString("en") + " บ./ลัง", "เลือก_can"));

  var step1Flex = {
    type: "flex",
    altText: "🛒 เมนูสั่งแก๊ส • " + sName,
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
        contents: step1Body
      }
    }
  };

  var buildStep2Card = function(typeKey, titleLabel, unitName, unitPrice, qtyArray) {
    var rows = [
      { type: "text", text: "แตะเลือกจำนวน" + unitName + "ที่ต้องการสั่ง:", size: "xs", weight: "bold", color: "#111111" }
    ];
    for (var q = 0; q < qtyArray.length; q++) {
      var qty = qtyArray[q];
      var subTotal = qty * unitPrice;
      rows.push(
        makeChoiceRow(
          titleLabel + " x " + qty + " " + unitName,
          subTotal.toLocaleString("en") + " บาท",
          "เลือกจำนวน_" + typeKey + "_" + qty
        )
      );
    }
    rows.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F1F5F9",
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "xs",
      action: { type: "message", label: "🔙 เปลี่ยนขนาดแก๊ส", text: "เลือกประเภทแก๊ส" },
      contents: [
        { type: "text", text: "🔙 ย้อนกลับไปเลือกขนาดแก๊ส", size: "xs", weight: "bold", color: "#475569", align: "center" }
      ]
    });

    return {
      type: "flex",
      altText: "🔢 เลือกจำนวน " + titleLabel + " • " + sName,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#111111",
          paddingAll: "14px",
          contents: [
            { type: "text", text: titleLabel + " (" + unitPrice.toLocaleString("en") + " บ./" + unitName + ")", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: "🏪 " + sName, size: "xxs", color: "#38BDF8", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: rows
        }
      }
    };
  };

  var bundle = {
    storeId: st.storeId,
    storeName: st.storeName,
    groupId: st.groupId || "",
    pendingDebt: pendingDebt,
    updatedAt: new Date().getTime(),
    step1: step1Flex,
    step2_15: buildStep2Card("15", "🛢️ ถังแก๊ส 15 กก.", "ถัง", p15, [1, 2, 3, 5]),
    step2_48: buildStep2Card("48", "🛢️ ถังแก๊ส 48 กก.", "ถัง", p48, [1, 2, 3, 5]),
    step2_can: buildStep2Card("can", "🥫 แก๊สกระป๋อง", "ลัง", pCan, [1, 5, 10])
  };

  var jsonStr = JSON.stringify(bundle);
  var cache = CacheService.getScriptCache();
  if (st.storeId && st.storeId !== "-") {
    cache.put("P15_PREFLEX_ID_" + st.storeId, jsonStr, P15_FLEX_CACHE_TTL);
  }
  if (st.groupId && st.groupId !== "-") {
    cache.put("P15_PREFLEX_GRP_" + st.groupId, jsonStr, P15_FLEX_CACHE_TTL);
    try { PropertiesService.getScriptProperties().setProperty("P15_PREFLEX_GRP_" + st.groupId, jsonStr); } catch (eP) {}
  }

  return bundle;
}

function P15_GetInstantStoreFlexBundle_(groupIdOrStoreId) {
  if (!groupIdOrStoreId) return null;
  var keyGrp = "P15_PREFLEX_GRP_" + groupIdOrStoreId;
  var keyId = "P15_PREFLEX_ID_" + groupIdOrStoreId;
  var cache = CacheService.getScriptCache();

  var raw = cache.get(keyGrp) || cache.get(keyId);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }

  var propRaw = PropertiesService.getScriptProperties().getProperty(keyGrp);
  if (propRaw) {
    try {
      cache.put(keyGrp, propRaw, P15_FLEX_CACHE_TTL);
      return JSON.parse(propRaw);
    } catch (e2) {}
  }

  var st = null;
  if (typeof DB_GetStoreByGroupId === "function") st = DB_GetStoreByGroupId(groupIdOrStoreId);
  if (!st && typeof DB_GetStoreById === "function") st = DB_GetStoreById(groupIdOrStoreId);
  if (!st) return null;

  var debtDetails = (typeof DB_GetStoreDebtDetails === "function") ? DB_GetStoreDebtDetails(st.storeName) : { pendingDebt: 0, bills: [] };
  return P15_BuildPrebuiltStoreFlexSet_(st, debtDetails);
}

function P15_WarmUpAllPrebuiltFlexAndInvoices() {
  try {
    var allStores = (typeof DB_GetAllActiveStores === "function") ? DB_GetAllActiveStores(true) : [];
    var debtMap = (typeof DB_GetAllStoreDebtsMap === "function") ? DB_GetAllStoreDebtsMap(true) : {};

    var flexCount = 0;
    var invCount = 0;

    for (var i = 0; i < allStores.length; i++) {
      var st = allStores[i];
      var normKey = (typeof normalizeStoreName === "function") ? normalizeStoreName(st.storeName) : st.storeName;
      var dInfo = debtMap[normKey] || debtMap[st.storeName] || { pendingDebt: 0, bills: [] };

      P15_BuildPrebuiltStoreFlexSet_(st, dInfo);
      flexCount++;

      if (st.groupId && st.groupId !== "-" && dInfo.pendingDebt > 0 && invCount < 8 && typeof P15_GetOrGenerateStoreInvoiceA4_ === "function") {
        P15_GetOrGenerateStoreInvoiceA4_(st.storeId, false);
        invCount++;
      }
    }
    Logger.log("✅ สร้าง Pre-Built Flex สำเร็จ " + flexCount + " ร้านค้า | ใบแจ้งหนี้ล่วงหน้า " + invCount + " ร้านค้า!");
  } catch (e) {
    Logger.log("P15_WarmUpAllPrebuiltFlexAndInvoices Error: " + e.message);
  }
}

// ============================================================================
// 📜 ส่วนที่ 2: ประวัติบิลย้อนหลังแยกร้านค้า & สิทธิ์ประจำห้อง
// ============================================================================

function P15_GetRoomSecurityContext_(platform, userId, groupId) {
  var roomId = groupId || userId || "";
  var boundStore = null;

  if (platform === "LINE" && roomId) {
    if (typeof DB_GetRoomRole === "function") {
      try {
        var roleObj = DB_GetRoomRole(roomId);
        if (roleObj && roleObj.role === "STORE" && roleObj.storeData) boundStore = roleObj.storeData;
      } catch (e) {}
    }
    if (!boundStore && typeof DB_GetStoreByGroupId === "function") {
      try { boundStore = DB_GetStoreByGroupId(roomId); } catch (e2) {}
    }
  }

  if (boundStore && (boundStore.storeId || boundStore.storeName)) {
    return { role: "STORE_ONLY", isAdmin: false, isStoreRoom: true, store: boundStore };
  }

  if (platform === "LINE" && roomId) {
    var staffGid = (typeof DB_GetStaffGroupId === "function") ? DB_GetStaffGroupId() : (typeof CONFIG !== "undefined" ? CONFIG.STAFF_GROUP_ID : "");
    if (staffGid && roomId === staffGid) {
      return { role: "STAFF", isAdmin: false, isStoreRoom: false, store: null };
    }
  }

  var isAdmin = false;
  if (platform === "TELEGRAM") {
    isAdmin = true;
  } else if (typeof CONFIG !== "undefined" && CONFIG.ADMIN_GROUP_ID && roomId === CONFIG.ADMIN_GROUP_ID) {
    isAdmin = true;
  } else if (typeof DB_GetRoomRole === "function") {
    try {
      var rInfo = DB_GetRoomRole(roomId);
      if (rInfo && rInfo.role === "ADMIN") isAdmin = true;
    } catch (e4) {}
  }
  if (!isAdmin && !groupId) {
    isAdmin = true;
  }
  if (!isAdmin && userId) {
    try {
      if (PropertiesService.getScriptProperties().getProperty("is_admin_" + userId) === "true") isAdmin = true;
    } catch (e5) {}
  }

  return { role: isAdmin ? "ADMIN" : "UNBOUND", isAdmin: isAdmin, isStoreRoom: false, store: null };
}

function P15_IsBillOwnedByStore_(billObj, storeObj) {
  if (!billObj || !storeObj) return false;
  var bStore = String(billObj.storeName || "").trim();
  var sName = String(storeObj.storeName || "").trim();
  var sId = String(storeObj.storeId || "").trim();
  if (sId && sId !== "-" && bStore.indexOf(sId) !== -1) return true;
  var shortB = bStore.replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();
  var shortS = sName.replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();
  return Boolean(shortB && shortS && shortB === shortS);
}

function P15_GetStorePastBillsList_(storeNameOrId) {
  if (!storeNameOrId) return { store: null, bills: [] };
  var stObj = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(storeNameOrId) : null;
  var targetStoreName = stObj ? String(stObj.storeName || "").trim() : String(storeNameOrId || "").trim();
  var targetStoreId = (stObj && stObj.storeId && stObj.storeId !== "-") ? String(stObj.storeId).trim() : "";
  var shortTarget = targetStoreName.replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();
  if (!targetStoreId && !shortTarget) return { store: null, bills: [] };

  var p15Rate = (stObj && stObj.price15) ? Number(stObj.price15) : 490;
  var p48Rate = (stObj && stObj.price48) ? Number(stObj.price48) : 1530;
  var pCanRate = (stObj && stObj.priceCan) ? Number(stObj.priceCan) : 790;

  var allTx = (typeof DB_GetTransactions === "function") ? DB_GetTransactions(false) : [];
  var matchedBills = [];

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (!tx) continue;
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;

    var rowStore = String(tx.store || "").trim();
    if (!rowStore) continue;
    var shortRowStore = rowStore.replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();

    var isExactMatch = false;
    if (targetStoreId && rowStore.indexOf("[" + targetStoreId + "]") !== -1) isExactMatch = true;
    else if (shortTarget && shortRowStore === shortTarget) isExactMatch = true;
    else if (targetStoreName && rowStore === targetStoreName) isExactMatch = true;
    if (!isExactMatch) continue;

    var dObj = parseSheetDate(tx.date, tx.rowIdx);
    if (!dObj || isNaN(dObj.getTime())) continue;

    var payMethod = String(tx.payMethod || "").trim();
    var status = String(tx.status || "").trim();
    var isHistoricalPaid = (tx.rowIdx < 385 && payMethod.indexOf("เครดิต") === -1) || (tx.rowIdx < 290);
    var isPaid = isHistoricalPaid || status.indexOf("ชำระแล้ว") !== -1 || (payMethod.indexOf("สด") !== -1 && payMethod.indexOf("ผสม") === -1);

    matchedBills.push({
      rowIdx: tx.rowIdx,
      orderId: tx.orderId,
      dateObj: dObj,
      dateMs: dObj.getTime(),
      dateStr: Utilities.formatDate(dObj, "GMT+7", "dd/MM/yyyy HH:mm"),
      storeName: targetStoreName,
      g15: tx.g15 || 0, g48: tx.g48 || 0, cans: tx.cans || 0,
      total: tx.total || 0,
      payMethod: payMethod,
      sender: tx.sender || "-",
      statusLabel: isPaid ? "✅ ชำระแล้ว" : "⏳ ค้างชำระ",
      isPaid: isPaid,
      receiptUrl: tx.slipUrl || "",
      slipUrl: tx.matchSlipUrl || ""
    });
  }

  matchedBills.sort(function(a, b) {
    if (b.dateMs !== a.dateMs) return b.dateMs - a.dateMs;
    return b.rowIdx - a.rowIdx;
  });

  return {
    store: stObj || { storeId: targetStoreId || "-", storeName: targetStoreName, billingName: targetStoreName, price15: p15Rate, price48: p48Rate, priceCan: pCanRate },
    bills: matchedBills
  };
}

function P15_GetSingleBillByRow_(rowIdx) {
  var rIdx = parseInt(rowIdx, 10);
  if (isNaN(rIdx) || rIdx < 2) return null;

  var fastTx = (typeof DB_GetSingleTxByRowFast === "function") ? DB_GetSingleTxByRowFast(rIdx) : null;
  if (fastTx) {
    var stFast = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(fastTx.store) : null;
    var p15F = (stFast && stFast.price15) ? Number(stFast.price15) : 490;
    var p48F = (stFast && stFast.price48) ? Number(stFast.price48) : 1530;
    var pCanF = (stFast && stFast.priceCan) ? Number(stFast.priceCan) : 790;
    var dFast = parseSheetDate(fastTx.date, rIdx);
    return {
      rowIdx: rIdx,
      orderId: fastTx.orderId,
      dateStr: dFast ? Utilities.formatDate(dFast, "GMT+7", "dd/MM/yyyy HH:mm") : "-",
      storeObj: stFast || { storeId: "-", storeName: fastTx.store, billingName: fastTx.store, price15: p15F, price48: p48F, priceCan: pCanF },
      storeName: stFast ? stFast.storeName : fastTx.store,
      billingName: (stFast && stFast.billingName && stFast.billingName !== "-") ? stFast.billingName : (stFast ? stFast.storeName : fastTx.store),
      g15: fastTx.g15 || 0, g48: fastTx.g48 || 0, cans: fastTx.cans || 0,
      price15: p15F, price48: p48F, priceCan: pCanF,
      total: fastTx.total || 0,
      payMethod: fastTx.payMethod || "-",
      sender: fastTx.sender || "-",
      status: fastTx.status || "",
      receiptUrl: fastTx.slipUrl || "",
      slipUrl: fastTx.matchSlipUrl || ""
    };
  }
  return null;
}

function P15_BuildStoreHistoryDirectoryFlex_(page) {
  var allStores = (typeof DB_GetAllActiveStores === "function") ? DB_GetAllActiveStores(false) : [];
  var pageSize = 8;
  var totalPages = Math.max(1, Math.ceil(allStores.length / pageSize));
  var curPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
  var startIdx = (curPage - 1) * pageSize;
  var slice = allStores.slice(startIdx, startIdx + pageSize);

  var rows = [
    { type: "text", text: "แตะเลือกร้านค้าเพื่อดูบิลย้อนหลังและออกใบเสร็จ A4:", size: "xs", color: "#555555", margin: "xs" }
  ];

  for (var i = 0; i < slice.length; i++) {
    var st = slice[i];
    var cleanName = st.storeName || st.storeId;
    rows.push({
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F8FAFC",
      borderColor: "#E2E8F0",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "xs",
      alignItems: "center",
      action: { type: "message", label: cleanName.substring(0, 20), text: "ดูบิลร้าน_" + st.storeId + "_1" },
      contents: [
        { type: "text", text: "🏪 " + cleanName, size: "xs", weight: "bold", color: "#111111", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: "ดูบิล ➡️", size: "xxs", weight: "bold", color: "#1DA1DB", align: "end", flex: 1 }
      ]
    });
  }

  var navBtns = [];
  if (curPage > 1) {
    navBtns.push({
      type: "box", layout: "vertical", backgroundColor: "#F1F5F9", cornerRadius: "8px", paddingAll: "9px", flex: 1,
      action: { type: "message", label: "⬅️ หน้าก่อน", text: "ประวัติบิลหน้า_" + (curPage - 1) },
      contents: [{ type: "text", text: "⬅️ หน้าก่อน", size: "xs", weight: "bold", color: "#334155", align: "center" }]
    });
  }
  if (curPage < totalPages) {
    navBtns.push({
      type: "box", layout: "vertical", backgroundColor: "#1DA1DB", cornerRadius: "8px", paddingAll: "9px", flex: 1,
      action: { type: "message", label: "➡️ หน้าถัดไป", text: "ประวัติบิลหน้า_" + (curPage + 1) },
      contents: [{ type: "text", text: "➡️ หน้าถัดไป (" + (curPage + 1) + "/" + totalPages + ")", size: "xs", weight: "bold", color: "#FFFFFF", align: "center" }]
    });
  }
  if (navBtns.length > 0) {
    rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: navBtns });
  }

  return {
    type: "flex",
    altText: "📜 ประวัติบิลแยกร้านค้า (หน้า " + curPage + "/" + totalPages + ")",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📜 ประวัติบิลแยกร้านค้า (Admin)", weight: "bold", size: "sm", color: "#FFFFFF" },
          { type: "text", text: "เลือกร้านค้า (หน้า " + curPage + "/" + totalPages + " • ทั้งหมด " + allStores.length + " ร้าน)", size: "xxs", color: "#38BDF8", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: "#FFFFFF",
        contents: rows
      }
    }
  };
}

function P15_BuildStorePastBillsFlex_(storeNameOrId, page, isAdminRoom) {
  var data = P15_GetStorePastBillsList_(storeNameOrId);
  var st = data.store;
  var bills = data.bills;
  var pageSize = 4;
  var totalPages = Math.max(1, Math.ceil(bills.length / pageSize));
  var curPage = Math.max(1, Math.min(parseInt(page, 10) || 1, totalPages));
  var startIdx = (curPage - 1) * pageSize;
  var slice = bills.slice(startIdx, startIdx + pageSize);

  var bodyContents = [];

  if (!st || bills.length === 0) {
    bodyContents.push({
      type: "text",
      text: "ยังไม่มีประวัติบิลของร้านนี้ในระบบ",
      size: "xs",
      color: "#64748B",
      align: "center",
      margin: "md"
    });
  } else {
    for (var i = 0; i < slice.length; i++) {
      var b = slice[i];
      var itemsArr = [];
      if (b.g15 > 0) itemsArr.push("15กก.(" + b.g15 + ")");
      if (b.g48 > 0) itemsArr.push("48กก.(" + b.g48 + ")");
      if (b.cans > 0) itemsArr.push("กระป๋อง(" + b.cans + ")");

      var actionRow1 = [
        {
          type: "box", layout: "vertical", backgroundColor: "#1DA1DB", cornerRadius: "6px", paddingAll: "7px", flex: 1,
          action: { type: "message", label: "🧾 ใบเสร็จ A4", text: "ดูใบเสร็จ_" + b.rowIdx },
          contents: [{ type: "text", text: "🧾 ใบเสร็จ A4 (JPEG)", size: "xxs", weight: "bold", color: "#FFFFFF", align: "center", maxLines: 1, adjustMode: "shrink-to-fit" }]
        }
      ];

      if (b.receiptUrl || b.slipUrl) {
        actionRow1.push({
          type: "box", layout: "vertical", backgroundColor: "#F1F5F9", borderColor: "#CBD5E1", borderWidth: "1px", cornerRadius: "6px", paddingAll: "7px", flex: 1,
          action: { type: "message", label: "📸 รูปส่งของ/สลิป", text: "ดูรูปบิล_" + b.rowIdx },
          contents: [{ type: "text", text: "📸 รูปส่งของ/สลิป", size: "xxs", weight: "bold", color: "#1E293B", align: "center", maxLines: 1, adjustMode: "shrink-to-fit" }]
        });
      }

      var cardItems = [
        {
          type: "box", layout: "horizontal",
          contents: [
            { type: "text", text: "🧾 " + b.orderId + " (" + b.dateStr + ")", size: "xs", weight: "bold", color: "#111111", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: b.total.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
          ]
        },
        {
          type: "text",
          text: "📦 " + (itemsArr.join(", ") || "-") + " • " + b.payMethod + " (" + b.statusLabel + ")",
          size: "xxs",
          color: "#475569",
          margin: "xs",
          maxLines: 1,
          adjustMode: "shrink-to-fit"
        },
        {
          type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
          contents: actionRow1
        }
      ];

      if (isAdminRoom) {
        cardItems.push({
          type: "box", layout: "vertical", backgroundColor: "#111111", cornerRadius: "6px", paddingAll: "6px", margin: "xs",
          action: { type: "message", label: "🖨️ พิมพ์ Epson", text: "พิมพ์ใบเสร็จ_" + b.rowIdx },
          contents: [{ type: "text", text: "🖨️ สั่งปริ้นท์ออกเครื่อง Epson", size: "xxs", weight: "bold", color: "#FFFFFF", align: "center" }]
        });
      }

      bodyContents.push({
        type: "box",
        layout: "vertical",
        backgroundColor: "#F8FAFC",
        borderColor: "#E2E8F0",
        borderWidth: "1px",
        cornerRadius: "8px",
        paddingAll: "10px",
        margin: "sm",
        contents: cardItems
      });
    }
  }

  var navRow = [];
  var stKey = (st && st.storeId && st.storeId !== "-") ? st.storeId : (st ? st.storeName : storeNameOrId);
  if (curPage > 1) {
    navRow.push({
      type: "box", layout: "vertical", backgroundColor: "#F1F5F9", cornerRadius: "8px", paddingAll: "8px", flex: 1,
      action: { type: "message", label: "⬅️ หน้าก่อน", text: "ดูบิลร้าน_" + stKey + "_" + (curPage - 1) },
      contents: [{ type: "text", text: "⬅️ หน้าก่อน", size: "xs", weight: "bold", color: "#334155", align: "center" }]
    });
  }
  if (curPage < totalPages) {
    navRow.push({
      type: "box", layout: "vertical", backgroundColor: "#1DA1DB", cornerRadius: "8px", paddingAll: "8px", flex: 1,
      action: { type: "message", label: "➡️ หน้าถัดไป", text: "ดูบิลร้าน_" + stKey + "_" + (curPage + 1) },
      contents: [{ type: "text", text: "➡️ หน้าถัดไป (" + (curPage + 1) + "/" + totalPages + ")", size: "xs", weight: "bold", color: "#FFFFFF", align: "center" }]
    });
  }
  if (navRow.length > 0) {
    bodyContents.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: navRow });
  }

  if (isAdminRoom) {
    bodyContents.push({
      type: "box", layout: "vertical", backgroundColor: "#F1F5F9", cornerRadius: "8px", paddingAll: "8px", margin: "sm",
      action: { type: "message", label: "🏪 เปลี่ยนร้านค้า", text: "ประวัติบิล" },
      contents: [{ type: "text", text: "🏪 เลือกดูประวัติบิลร้านอื่น", size: "xs", weight: "bold", color: "#111111", align: "center" }]
    });
  }

  return {
    type: "flex",
    altText: "📜 ประวัติบิล • " + (st ? st.storeName : "ร้านค้า"),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📜 ประวัติบิล & ใบเสร็จรับเงิน", weight: "bold", size: "sm", color: "#FFFFFF" },
          { type: "text", text: "🏪 " + (st ? st.storeName : storeNameOrId), size: "xs", weight: "bold", color: "#FFFFFF", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "ทั้งหมด (" + bills.length + " บิล) • หน้า " + curPage + "/" + totalPages, size: "xxs", color: "#E8F6FC", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: "#FFFFFF",
        contents: bodyContents
      }
    }
  };
}

function P15_InjectHistoryBtnIntoAdminFlex_(flexMsg) {
  try {
    if (!flexMsg || flexMsg.type !== "flex" || !flexMsg.contents || !flexMsg.contents.body || !Array.isArray(flexMsg.contents.body.contents)) {
      return flexMsg;
    }
    var rawStr = JSON.stringify(flexMsg);
    if (rawStr.indexOf("ประวัติบิล") !== -1) return flexMsg;

    var historyFlexBtn = {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DA1DB",
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "sm",
      justifyContent: "center",
      alignItems: "center",
      action: { type: "message", label: "📜 บิลย้อนหลัง", text: "ประวัติบิล" },
      contents: [
        { type: "text", text: "📜 บิลย้อนหลังแยกร้านค้า / ออกใบเสร็จ A4", size: "xs", weight: "bold", color: "#FFFFFF", align: "center", maxLines: 1, adjustMode: "shrink-to-fit" }
      ]
    };

    var bodyArr = flexMsg.contents.body.contents;
    var insertIdx = -1;
    for (var i = 0; i < bodyArr.length; i++) {
      var itemStr = JSON.stringify(bodyArr[i]);
      if (itemStr.indexOf("\"debt\"") !== -1 || itemStr.indexOf("สรุปหนี้") !== -1) {
        insertIdx = i + 1;
        break;
      }
    }
    if (insertIdx !== -1) bodyArr.splice(insertIdx, 0, historyFlexBtn);
    else bodyArr.push(historyFlexBtn);
  } catch (e) {}
  return flexMsg;
}

// ============================================================================
// ⚡ ส่วนที่ 3: ตารางสับรางคำสั่งตรง (DIRECT FUNCTION DISPATCH TABLE - 0.0001s)
// ============================================================================

var DIRECT_ADMIN_EXACT_MAP = {
  "1003": function(p, u, g, tc, r) { RT_SendAdminDashboard(p, tc, u, r); },
  "menu": function(p, u, g, tc, r) { RT_SendAdminDashboard(p, tc, u, r); },
  "menu_main": function(p, u, g, tc, r) { RT_SendAdminDashboard(p, tc, u, r); },
  "เมนูหลัก": function(p, u, g, tc, r) { RT_SendAdminDashboard(p, tc, u, r); },
  "today": function(p, u, g, tc) { FIN_ReplyDailyReport(p, tc, 0); },
  "yesterday": function(p, u, g, tc) { FIN_ReplyDailyReport(p, tc, 1); },
  "today_table_jpeg": function(p, u, g, tc) { FIN_ReplyDailySummaryTableJpeg(p, tc, 0); },
  "yesterday_table_jpeg": function(p, u, g, tc) { FIN_ReplyDailySummaryTableJpeg(p, tc, 1); },
  "weekly": function(p, u, g, tc, r, txt) { RT_ClearAdminStoreLock(u); FIN_ReplyWeeklyReport(p, tc); },
  "monday": function(p, u, g, tc, r, txt) { RT_ClearAdminStoreLock(u); FIN_ReplyWeeklyReport(p, tc); },
  "monthly": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); FIN_ReplyMonthlyReport(p, tc, null); },
  "month": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); FIN_ReplyMonthlyReport(p, tc, null); },
  "debt": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); FIN_ReplyDebtSummary(p, tc); },
  "สรุปหนี้": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); FIN_ReplyDebtSummary(p, tc); },
  "pending": function(p, u, g, tc, r, txt) { RT_ClearAdminStoreLock(u); FIN_HandlePendingCommand(p, u, tc, txt); },
  "invoice15": function(p, u, g, tc, r, txt) { RT_ClearAdminStoreLock(u); FIN_HandleInvoiceCommand(p, u, tc, txt, "15"); },
  "invoice30": function(p, u, g, tc, r, txt) { RT_ClearAdminStoreLock(u); FIN_HandleInvoiceCommand(p, u, tc, txt, "30"); },
  "company_income": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyAccumulatedCash(p, tc, true); },
  "staff_cash": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyAccumulatedCash(p, tc, true); },
  "เงินสดรอฝาก": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyAccumulatedCash(p, tc, true); },
  "เงินรอฝาก": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyAccumulatedCash(p, tc, true); },
  "cash_log_jpeg": function(p, u, g, tc) { Staff_ReplyCashDepositLogJpeg(p, tc, "ALL"); },
  "undo_cash_deposit": function(p, u, g, tc) { Staff_UndoLastCashDeposit(p, tc, true); },
  "store_stock": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); var sm = UI_BuildStoreStockMenu(); MSG_SendReply(p, tc, [sm.flexMsg], sm.qr); },
  "เช็ค stock": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); var sm = UI_BuildStoreStockMenu(); MSG_SendReply(p, tc, [sm.flexMsg], sm.qr); },
  "register_store": function(p, u, g, tc) { RT_StartStoreRegistrationWizard(p, u, tc); },
  "เพิ่มร้านค้าใหม่": function(p, u, g, tc) { RT_StartStoreRegistrationWizard(p, u, tc); },
  "estimate": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); QUO_StartEstimateWizard(p, u, tc); },
  "ประเมินราคา": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); QUO_StartEstimateWizard(p, u, tc); },
  "pdf": function(p, u, g, tc) { QUO_GenerateQuotationPdf(p, u, tc); },
  "diagnostic": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); SYS_RunHealthCheck(p, tc); },
  "order ส่งแก๊สวันนี้": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyPendingOrdersBubbles(p, tc, 1, true); },
  "งาน": function(p, u, g, tc) { RT_ClearAdminStoreLock(u); Staff_ReplyPendingOrdersBubbles(p, tc, 1, true); },
  "พยากรณ์": function(p, u, g, tc) {
    var pf = (typeof P13_BuildWebAndPredictionFlex_ === "function") ? P13_BuildWebAndPredictionFlex_() : UI_BuildAdminFlexCard();
    MSG_SendReply(p, tc, [pf], UI_GetAdminHomeQr());
  },
  "เว็บ": function(p, u, g, tc) {
    var pf = (typeof P13_BuildWebAndPredictionFlex_ === "function") ? P13_BuildWebAndPredictionFlex_() : UI_BuildAdminFlexCard();
    MSG_SendReply(p, tc, [pf], UI_GetAdminHomeQr());
  },
  "web": function(p, u, g, tc) {
    var pf = (typeof P13_BuildWebAndPredictionFlex_ === "function") ? P13_BuildWebAndPredictionFlex_() : UI_BuildAdminFlexCard();
    MSG_SendReply(p, tc, [pf], UI_GetAdminHomeQr());
  }
};

(function P15_InstallDirectEngineHooks_() {
  if (typeof UI_BuildAdminFlexCard === "function" && !UI_BuildAdminFlexCard._isP15AdminCardWrapped) {
    var origBuildCard = UI_BuildAdminFlexCard;
    UI_BuildAdminFlexCard = function() {
      return P15_InjectHistoryBtnIntoAdminFlex_(origBuildCard.apply(this, arguments));
    };
    UI_BuildAdminFlexCard._isP15AdminCardWrapped = true;
  }

  if (typeof UI_BuildAdminMenu === "function" && !UI_BuildAdminMenu._isP15AdminMenuWrapped) {
    var origBuildMenu = UI_BuildAdminMenu;
    UI_BuildAdminMenu = function() {
      var menuObj = origBuildMenu.apply(this, arguments);
      if (menuObj && menuObj.messages && menuObj.messages.length > 0) {
        menuObj.messages[0] = P15_InjectHistoryBtnIntoAdminFlex_(menuObj.messages[0]);
      }
      return menuObj;
    };
    UI_BuildAdminMenu._isP15AdminMenuWrapped = true;
  }

  if (typeof RT_ProcessCommand === "function" && !RT_ProcessCommand._isP15DirectWrapped) {
    var origProcess = RT_ProcessCommand;
    RT_ProcessCommand = function(platform, userId, groupId, replyToken, chatId, userText) {
      var txt = String(userText || "").trim();
      var lowTxt = txt.toLowerCase();
      var tokenOrChat = (platform === "LINE") ? replyToken : chatId;
      var roomId = groupId || userId || "";
      _P13_ACTIVE_ROOM_ID = roomId;

      var sec = P15_GetRoomSecurityContext_(platform, userId, groupId);

      // ⚡ FAST-PATH 1: ห้องลูกค้า (STORE) -> ดึงการ์ดสั่งแก๊สจาก RAM 0.05 วินาที
      if (sec.isStoreRoom && sec.store) {
        if (lowTxt === "1003" || lowTxt === "menu" || lowTxt === "menu_main") return;
        var homeQr = UI_GetStoreHomeQr();
        var bundle = P15_GetInstantStoreFlexBundle_(roomId) || P15_GetInstantStoreFlexBundle_(sec.store.storeId);

        if (bundle) {
          if (txt === "เลือกประเภทแก๊ส" || lowTxt === "update" || txt === "สั่งแก๊ส" || txt === "เมนูสั่งแก๊ส" || txt === "อัปเดต" || txt === "เช็คสถานะ") {
            try { CacheService.getScriptCache().remove("cart_" + roomId); } catch (eC) {}
            MSG_SendReply(platform, tokenOrChat, [bundle.step1], homeQr);
            return;
          }
          if (txt === "เลือก_15" && bundle.step2_15) {
            MSG_SendReply(platform, tokenOrChat, [bundle.step2_15], homeQr);
            return;
          }
          if (txt === "เลือก_48" && bundle.step2_48) {
            MSG_SendReply(platform, tokenOrChat, [bundle.step2_48], homeQr);
            return;
          }
          if ((txt === "เลือก_can" || txt === "สั่งแก๊สกระป๋อง" || txt === "แก๊สกระป๋อง") && bundle.step2_can) {
            MSG_SendReply(platform, tokenOrChat, [bundle.step2_can], homeQr);
            return;
          }
        }
      }

      // ⚡ FAST-PATH 2: กดปุ่ม "📄 รูปใบแจ้งหนี้" (ขอดูใบแจ้งหนี้_... หรือ ใบแจ้งหนี้ ...)
      if (txt.indexOf("ขอดูใบแจ้งหนี้_") === 0 || txt.indexOf("ใบแจ้งหนี้") === 0 || lowTxt.indexOf("store_debt_jpeg_") === 0) {
        var targetStKey = txt.replace(/^ขอดูใบแจ้งหนี้_/i, "").replace(/^store_debt_jpeg_/i, "").replace(/^ใบแจ้งหนี้\s*/i, "").trim();
        if (sec.isStoreRoom && sec.store) {
          targetStKey = sec.store.storeId || sec.store.storeName;
        }
        var invRes = P15_GetOrGenerateStoreInvoiceA4_(targetStKey, false);
        if (!invRes || !invRes.ok) {
          MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "ℹ️ " + ((invRes && invRes.error) ? invRes.error : "ไม่พบรายการค้างชำระ") }], sec.isStoreRoom ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr());
          return;
        }
        var invFlex = {
          type: "flex",
          altText: "📄 ใบแจ้งหนี้ / ใบวางบิล " + invRes.store.storeName,
          contents: {
            type: "bubble",
            size: "kilo",
            header: {
              type: "box", layout: "vertical", backgroundColor: "#111111", paddingAll: "12px",
              contents: [
                { type: "text", text: "📄 ใบแจ้งหนี้ / ใบวางบิล", weight: "bold", size: "sm", color: "#FFFFFF" },
                { type: "text", text: invRes.store.storeName, size: "xxs", color: "#38BDF8", margin: "xs", maxLines: 1 }
              ]
            },
            body: {
              type: "box", layout: "vertical", spacing: "xs", paddingAll: "12px",
              contents: [
                { type: "text", text: "📌 รายการค้าง: " + invRes.billsCount + " บิล", size: "xs", color: "#111111" },
                { type: "text", text: "💰 ยอดรวมสุทธิ: " + invRes.totalDebt.toLocaleString("en") + " บาท", size: "xs", weight: "bold", color: "#1DA1DB" },
                { type: "text", text: "🏦 ธ.กรุงเทพ 252-451-1777 (ภานุพงศ์ ดุมคำ)", size: "xxs", weight: "bold", color: "#334155", margin: "xs" },
                {
                  type: "box", layout: "vertical", backgroundColor: "#1DA1DB", cornerRadius: "8px", paddingAll: "9px", margin: "md",
                  action: { type: "uri", label: "📥 เปิดไฟล์ PDF", uri: invRes.pdfUrl },
                  contents: [{ type: "text", text: "📥 เปิดไฟล์ PDF ฉบับเต็ม (A4)", size: "xs", weight: "bold", color: "#FFFFFF", align: "center" }]
                }
              ]
            }
          }
        };
        var invImgMsg = { type: "image", originalContentUrl: invRes.imgUrl, previewImageUrl: invRes.imgUrl };
        var qrAfterInv = sec.isStoreRoom ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr();
        MSG_SendReply(platform, tokenOrChat, [invFlex, invImgMsg], qrAfterInv);
        return;
      }

      // ⚡ FAST-PATH 3: ประวัติบิลย้อนหลัง & ออกใบเสร็จ A4 ย้อนหลัง
      if (txt === "ประวัติบิล" || txt === "บิลย้อนหลัง" || txt === "ดูบิลย้อนหลัง" || txt.indexOf("ประวัติบิลหน้า_") === 0) {
        if (sec.isStoreRoom && sec.store) {
          var ownKey = (sec.store.storeId && sec.store.storeId !== "-") ? sec.store.storeId : sec.store.storeName;
          var ownFlex = P15_BuildStorePastBillsFlex_(ownKey, 1, false);
          MSG_SendReply(platform, tokenOrChat, [ownFlex], UI_GetStoreHomeQr());
          return;
        }
        if (sec.isAdmin) {
          var dirPage = txt.indexOf("ประวัติบิลหน้า_") === 0 ? parseInt(txt.replace("ประวัติบิลหน้า_", ""), 10) || 1 : 1;
          var dirFlex = P15_BuildStoreHistoryDirectoryFlex_(dirPage);
          MSG_SendReply(platform, tokenOrChat, [dirFlex], UI_GetAdminHomeQr());
          return;
        }
        return;
      }

      if (txt.indexOf("ดูบิลร้าน_") === 0) {
        var parts = txt.replace("ดูบิลร้าน_", "").split("_");
        var pageNum = parseInt(parts.pop(), 10) || 1;
        var storeKey = parts.join("_");

        if (sec.isStoreRoom && sec.store) {
          storeKey = (sec.store.storeId && sec.store.storeId !== "-") ? sec.store.storeId : sec.store.storeName;
          var custHistFlex = P15_BuildStorePastBillsFlex_(storeKey, pageNum, false);
          MSG_SendReply(platform, tokenOrChat, [custHistFlex], UI_GetStoreHomeQr());
          return;
        }
        if (!sec.isAdmin) return;
        var adminHistFlex = P15_BuildStorePastBillsFlex_(storeKey, pageNum, true);
        MSG_SendReply(platform, tokenOrChat, [adminHistFlex], UI_GetAdminHomeQr());
        return;
      }

      if (txt.indexOf("ดูใบเสร็จ_") === 0) {
        if (!sec.isAdmin && !sec.isStoreRoom) return;
        var rIdx1 = parseInt(txt.replace("ดูใบเสร็จ_", ""), 10);
        var bill1 = P15_GetSingleBillByRow_(rIdx1);
        if (!bill1) return;
        if (sec.isStoreRoom && !P15_IsBillOwnedByStore_(bill1, sec.store)) return;

        var docRes = P15_GenerateRetroactiveReceiptA4_(bill1, false);
        if (!docRes || !docRes.ok) {
          MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "⚠️ ไม่สามารถสร้างใบเสร็จได้: " + (docRes ? docRes.error : "") }], []);
          return;
        }
        var infoCard = {
          type: "flex",
          altText: "🧾 ใบส่งของ / ใบเสร็จรับเงิน " + bill1.orderId,
          contents: {
            type: "bubble",
            size: "kilo",
            header: {
              type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "12px",
              contents: [
                { type: "text", text: "🧾 ใบส่งของ / ใบเสร็จรับเงิน", weight: "bold", size: "sm", color: "#FFFFFF" },
                { type: "text", text: bill1.storeName + " • " + bill1.orderId, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
              ]
            },
            body: {
              type: "box", layout: "vertical", spacing: "xs", paddingAll: "12px",
              contents: [
                { type: "text", text: "📅 วันที่: " + bill1.dateStr, size: "xs", color: "#111111" },
                { type: "text", text: "💰 ยอดสุทธิ: " + bill1.total.toLocaleString("en") + " บาท", size: "xs", weight: "bold", color: "#1DA1DB" },
                {
                  type: "box", layout: "vertical", backgroundColor: "#111111", cornerRadius: "8px", paddingAll: "9px", margin: "md",
                  action: { type: "uri", label: "📥 เปิดไฟล์ PDF", uri: docRes.pdfUrl },
                  contents: [{ type: "text", text: "📥 เปิดไฟล์ PDF ฉบับเต็ม", size: "xs", weight: "bold", color: "#FFFFFF", align: "center" }]
                }
              ]
            }
          }
        };
        var imgBubble = { type: "image", originalContentUrl: docRes.imgUrl, previewImageUrl: docRes.imgUrl };
        MSG_SendReply(platform, tokenOrChat, [infoCard, imgBubble], sec.isStoreRoom ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr());
        return;
      }

      if (txt.indexOf("ดูรูปบิล_") === 0) {
        if (!sec.isAdmin && !sec.isStoreRoom) return;
        var rIdx2 = parseInt(txt.replace("ดูรูปบิล_", ""), 10);
        var bill2 = P15_GetSingleBillByRow_(rIdx2);
        if (!bill2) return;
        if (sec.isStoreRoom && !P15_IsBillOwnedByStore_(bill2, sec.store)) return;

        var bubbles = [];
        var rUrl = (typeof getPublicDirectImageUrl === "function") ? getPublicDirectImageUrl(bill2.receiptUrl) : bill2.receiptUrl;
        var sUrl = (typeof getPublicDirectImageUrl === "function") ? getPublicDirectImageUrl(bill2.slipUrl) : bill2.slipUrl;
        if (rUrl && rUrl.indexOf("http") === 0) bubbles.push({ type: "image", originalContentUrl: rUrl, previewImageUrl: rUrl });
        if (sUrl && sUrl.indexOf("http") === 0 && sUrl !== rUrl) bubbles.push({ type: "image", originalContentUrl: sUrl, previewImageUrl: sUrl });
        if (bubbles.length === 0) bubbles.push({ type: "text", text: "ℹ️ บิล " + bill2.orderId + " ไม่มีรูปแนบในระบบครับ" });

        MSG_SendReply(platform, tokenOrChat, bubbles, sec.isStoreRoom ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr());
        return;
      }

      if (txt.indexOf("พิมพ์ใบเสร็จ_") === 0) {
        if (!sec.isAdmin) return;
        var rIdx3 = parseInt(txt.replace("พิมพ์ใบเสร็จ_", ""), 10);
        var bill3 = P15_GetSingleBillByRow_(rIdx3);
        if (!bill3) return;

        var printRes = P15_GenerateRetroactiveReceiptA4_(bill3, true);
        if (printRes && printRes.ok && printRes.pdfBlob) {
          MailApp.sendEmail({
            to: P15_EPSON_EMAIL,
            subject: "",
            body: "",
            attachments: [printRes.pdfBlob]
          });
          MSG_SendReply(platform, tokenOrChat, [
            { type: "text", text: "🖨️ ส่งใบเสร็จ " + bill3.orderId + " (" + bill3.storeName + ") เข้าเครื่องพิมพ์ Epson เรียบร้อยครับ!" }
          ], UI_GetAdminHomeQr());
        }
        return;
      }

      // ⚡ FAST-PATH 4: ถ้าเป็นห้อง Admin และคำสั่งอยู่ในตาราง DIRECT_ADMIN_EXACT_MAP (และไม่ได้อยู่ในโหมดพิมพ์ตอบ Wizard)
      if (sec.isAdmin && DIRECT_ADMIN_EXACT_MAP[lowTxt]) {
        var hasActiveWizard = DB_GetSession(userId, "reg_wiz") || DB_GetSession(userId, "edit_store_wiz") || DB_GetSession(userId, "bill_hdr_wiz");
        if (!hasActiveWizard || lowTxt === "1003") {
          DIRECT_ADMIN_EXACT_MAP[lowTxt](platform, userId, groupId, tokenOrChat, roomId, txt);
          return;
        }
      }

      return origProcess.apply(this, arguments);
    };
    RT_ProcessCommand._isP15DirectWrapped = true;
  }
})();
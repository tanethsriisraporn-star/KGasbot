// ==========================================
// 💰 File: 06_FIN_Accounting_Slip.gs
// Version: 47.0 (Clean Today Overview, Daily Table JPEG, Anti-Unsend Customer Slip & 3-Min Timeout)
// Prefix: FIN_
// หมวด 4: FINANCE & SMART MATCHING
// ==========================================

function getPublicDirectImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.indexOf("lh3.googleusercontent.com") !== -1) return url;
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return (match && match[1]) ? ("https://lh3.googleusercontent.com/d/" + match[1] + "=w1200") : "";
}

function parseStoreAndPage(text, prefix) {
  var remainder = text.replace(new RegExp("^" + prefix + "\\s*", "i"), "").trim();
  var storeFilter = null, page = 1;
  if (remainder) {
    var parts = remainder.split(/\s+/);
    if (/^\d+$/.test(parts[parts.length - 1])) {
      page = parseInt(parts.pop(), 10);
      storeFilter = parts.length > 0 ? parts.join(" ") : null;
    } else {
      storeFilter = remainder;
    }
  }
  return { storeFilter: storeFilter, page: page };
}

/**
 * [OCR SLIP & BANK KEYWORD DETECTOR]:
 * ตรวจสอบว่ารูปที่ส่งเข้ามาเป็นสลิปธนาคารจริงหรือไม่ และดึงตัวเลขยอดเงินทั้งหมดในสลิป
 */
function FIN_ExtractSlipInfoOCR(fileId) {
  try {
    if (typeof Drive === "undefined" || !Drive.Files) return { amounts: [], isBankSlip: true };
    var tempDoc = null;
    if (typeof Drive.Files.copy === "function") {
      tempDoc = Drive.Files.copy({ title: "temp_ocr_" + fileId }, fileId, { ocr: true, ocrLanguage: "th" });
    }
    if (!tempDoc || !tempDoc.id) return { amounts: [], isBankSlip: true };

    var docText = DocumentApp.openById(tempDoc.id).getBody().getText() || "";
    try { DriveApp.getFileById(tempDoc.id).setTrashed(true); } catch (e) {}

    var slipKeywords = [
      "โอนเงิน", "สำเร็จ", "รายการ", "ค่าธรรมเนียม", "บาท", "ธนาคาร", "กสิกร", "กรุงเทพ",
      "ไทยพาณิชย์", "กรุงไทย", "กรุงศรี", "ออมสิน", "ทหารไทย", "พร้อมเพย์", "promptpay",
      "transfer", "thb", "bangkok", "kasikorn", "scb", "krungthai", "เลขที่รายการ", "รหัสอ้างอิง", "ภานุพงศ์"
    ];
    var lowDoc = docText.toLowerCase();
    var hasSlipWord = slipKeywords.some(function(kw) { return lowDoc.indexOf(kw) !== -1; });

    var cleanText = String(docText).replace(/,/g, "");
    var matches = cleanText.match(/\d+(\.\d{2})?/g) || [];
    var nums = [];
    for (var i = 0; i < matches.length; i++) {
      var val = Math.round(parseFloat(matches[i]));
      if (!isNaN(val) && val >= 100 && val <= 500000 && nums.indexOf(val) === -1) {
        nums.push(val);
      }
    }
    return { amounts: nums, isBankSlip: (hasSlipWord && nums.length > 0) };
  } catch (e) {
    return { amounts: [], isBankSlip: true };
  }
}

function FIN_ExtractSlipAmountOCR(fileId) {
  return FIN_ExtractSlipInfoOCR(fileId).amounts;
}

function FIN_ClearManualMatchSession(props, cache, userId, roomId) {
  props.deleteProperty("pending_match_order_ids_" + userId);
  props.deleteProperty("pending_match_order_ids_GLOBAL");
  props.deleteProperty("pending_match_timestamp_" + userId);
  props.deleteProperty("pending_match_timestamp_GLOBAL");
  props.deleteProperty("pending_match_active_billing_id_" + userId);
  if (roomId) props.deleteProperty("pending_match_order_ids_" + roomId);

  if (cache) {
    cache.remove("UNMATCHED_SLIP_" + userId);
    cache.remove("UNMATCHED_SLIP_GLOBAL");
    if (roomId) cache.remove("UNMATCHED_SLIP_" + roomId);
  }
}

function FIN_ReplyStoreInvoiceJpeg(platform, tokenOrChat, storeIdOrName) {
  try {
    var stObj = DB_GetStoreById(storeIdOrName);
    if (!stObj) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ไม่พบร้านค้า]\nไม่พบข้อมูลร้านค้าในระบบครับ" }], UI_GetAdminHomeQr());
      return;
    }

    var cleanStoreName = DB_CleanStorePrefix(stObj.storeName, stObj.storeId);
    var debtDetails = DB_GetStoreDebtDetails(cleanStoreName);
    var unpaidBills = debtDetails.bills || [];
    if (unpaidBills.length === 0) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `✅ [${cleanStoreName}]\nปัจจุบันไม่มียอดค้างชำระค่ะ` }], UI_GetStoreHomeQr());
      return;
    }

    var cTerm = stObj.creditTerm || debtDetails.creditTerm || "";
    var cycleTitle = (cTerm === "15" || cTerm === "30")
                     ? `ใบวางบิลเครดิต ${cTerm} วัน`
                     : "ใบแจ้งหนี้ / รายการบิลค้างชำระ";
    var batchId = "INV-" + (stObj.storeId || "STORE").replace(/[^a-zA-Z0-9]/g, "");

    var cache = CacheService.getScriptCache();
    var cacheKey = `INV_JPEG_V470_${stObj.storeId}_${debtDetails.pendingDebt}_${unpaidBills.length}_${String(stObj.billingName || "").length}`;
    var cachedStr = cache.get(cacheKey);
    var docObj = cachedStr ? JSON.parse(cachedStr) : null;

    if (!docObj) {
      var formattedBills = unpaidBills.map(function(b) {
        return {
          date: b.dateStr,
          id: b.orderId,
          itemDesc: b.itemDesc || "-",
          sender: b.sender || "-",
          amt: b.amount
        };
      });

      var bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
      var bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
      var bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");
      var todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");

      var rawPdfInfo = createInvoicePDFWithImage(
        stObj.billingName || cleanStoreName,
        formattedBills,
        debtDetails.pendingDebt,
        todayStr,
        cycleTitle,
        batchId,
        bName, bAcc, bOwner
      );

      var directJpegUrl = rawPdfInfo.imgUrl || getPublicDirectImageUrl(rawPdfInfo.pdfUrl);
      docObj = {
        pdfUrl: rawPdfInfo.pdfUrl,
        imgUrl: directJpegUrl
      };
      try { cache.put(cacheKey, JSON.stringify(docObj), 7200); } catch (e) {}
    }

    var bubbles = [];
    if (docObj.imgUrl) {
      bubbles.push({ type: "image", originalContentUrl: docObj.imgUrl, previewImageUrl: docObj.imgUrl });
    } else {
      bubbles.push({
        type: "text",
        text: `📄 [${cycleTitle}: ${cleanStoreName}]\n💰 ยอดรวมสุทธิ: ${debtDetails.pendingDebt.toLocaleString("en")} บาท\n🔗 เปิดดูไฟล์: ${docObj.pdfUrl}`
      });
    }

    MSG_SendReply(platform, tokenOrChat, bubbles, UI_GetStoreHomeQr());
  } catch (e) {
    Logger.log("FIN_ReplyStoreInvoiceJpeg Error: " + e.message);
  }
}

function FIN_GetDailyBillsList(targetDateStr) {
  var recentTx = DB_GetRecentTransactions(120);
  var dayBills = [];
  for (var i = 0; i < recentTx.length; i++) {
    var tx = recentTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var dateObj = parseSheetDate(tx.date);
    if (dateObj && Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy") === targetDateStr) {
      dayBills.push(tx);
    }
  }
  return dayBills;
}

function calculateDailySummary(sheet, idxMap, targetDateStr) {
  var dayBills = FIN_GetDailyBillsList(targetDateStr);
  var t15 = 0, t48 = 0, tCan = 0, orderCount = dayBills.length;
  var totalSales = 0, cashSales = 0, transferPaidSales = 0, transferPendingSales = 0, creditSales = 0, fuelTotal = 0;
  var driverMap = {};

  for (var i = 0; i < dayBills.length; i++) {
    var tx = dayBills[i];
    t15 += tx.g15; t48 += tx.g48; tCan += tx.cans;
    totalSales += tx.total; fuelTotal += tx.fuelCost;
    var isPaid = (tx.status.indexOf("ชำระแล้ว") !== -1);
    var driverCash = 0;

    if (tx.payMethod.indexOf("สด") !== -1 && tx.payMethod.indexOf("ผสม") === -1) {
      cashSales += tx.total; driverCash = tx.total;
    } else if (tx.payMethod.indexOf("ผสม") !== -1) {
      cashSales += tx.cashReceived; driverCash = tx.cashReceived;
      var mixedTransferPart = Math.max(0, tx.total - tx.cashReceived);
      if (isPaid) transferPaidSales += mixedTransferPart; else transferPendingSales += mixedTransferPart;
    } else if (tx.payMethod.indexOf("โอน") !== -1) {
      if (isPaid) transferPaidSales += tx.total; else transferPendingSales += tx.total;
    } else if (tx.payMethod.indexOf("เครดิต") !== -1) {
      creditSales += tx.total;
    }

    var sender = tx.sender || "ไม่ระบุ";
    if (!driverMap[sender]) driverMap[sender] = { cash: 0, fuel: 0, orders: 0 };
    driverMap[sender].cash += driverCash;
    driverMap[sender].fuel += tx.fuelCost;
    driverMap[sender].orders += 1;
  }

  return {
    orderCount: orderCount, t15: t15, t48: t48, tCan: tCan,
    totalSales: totalSales, cashSales: cashSales,
    transferPaidSales: transferPaidSales, transferPendingSales: transferPendingSales,
    creditSales: creditSales, fuelTotal: fuelTotal,
    netCashReturn: cashSales - fuelTotal, driverMap: driverMap,
    dayBills: dayBills
  };
}

/**
 * [CLEAN SINGLE BILL CARD FOR TODAY/YESTERDAY DRILL-DOWN]:
 * 1. ไม่เอารูปใบเสร็จมาพ่วงท้ายให้รกและบังปุ่ม
 * 2. หากบิลนั้น "ชำระแล้ว" (เช่น จ่ายเงินสดหรือโอนแนบสลิปแล้ว) จะซ่อนปุ่ม "📲 จับคู่สลิป" และ "✅ ชำระแล้ว" ทันที เพื่อไม่ให้สับสนว่าค้างอยู่ใน Pending!
 */
function FIN_BuildSingleBillBubbles(tx, indexNum, totalCount, dateStr, cmdPrefixOptional) {
  var oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
  var rowKey = "ROW-" + tx.rowIdx;
  var dObj = parseSheetDate(tx.date);
  var timeStr = dObj ? Utilities.formatDate(dObj, "GMT+7", "HH:mm น.") : "-";
  var cmdPrefix = cmdPrefixOptional || "today_bill_";
  var isAlreadyPaid = (tx.status && tx.status.indexOf("ชำระแล้ว") !== -1);

  var items = [];
  if (tx.g15 > 0) items.push("15กก.(" + tx.g15 + ")");
  if (tx.g48 > 0) items.push("48กก.(" + tx.g48 + ")");
  if (tx.cans > 0) items.push("กระป๋อง(" + tx.cans + ")");

  var bodyRows = [
    { type: "text", text: `🏪 ${tx.store}`, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `📦 ${items.join(", ") || "-"}`, size: "xs", color: "#333333", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `👤 ผู้ส่ง: ${tx.sender}`, size: "xs", color: "#555555", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "separator", margin: "sm", color: "#E5E5E5" },
    {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: `💰 ยอดค่าแก๊ส (${tx.payMethod})`, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
        { type: "text", text: `${tx.total.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    }
  ];

  if (tx.fuelCost > 0) {
    bodyRows.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `⛽ ${tx.sender} เบิกค่าน้ำมัน`, size: "xxs", color: "#B71C1C", flex: 3, maxLines: 1 },
        { type: "text", text: `-${tx.fuelCost.toLocaleString("en")} บาท`, size: "xxs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
      ]
    });
  }

  bodyRows.push({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: `📌 สถานะ: ${isAlreadyPaid ? "✅ ชำระแล้ว (จบรายการ)" : ("⏳ " + (tx.status || "รอตรวจสอบ"))}`, size: "xs", weight: "bold", color: isAlreadyPaid ? "#2E7D32" : "#E65100", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
      { type: "text", text: `📍 แถว ${tx.rowIdx}`, size: "xxs", color: "#666666", align: "end", flex: 2, maxLines: 1 }
    ]
  });

  // แสดงปุ่ม "📲 จับคู่สลิป" และ "✅ ชำระแล้ว" เฉพาะบิลที่ยังไม่ได้ชำระเงินเท่านั้น!
  if (!isAlreadyPaid) {
    bodyRows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "sm",
      contents: [
        UI_MakeFlexBoxBtn("📲 จับคู่สลิป", `match ${rowKey}`, "#0288D1", "#FFFFFF", "xs"),
        UI_MakeFlexBoxBtn("✅ ชำระแล้ว", `setstatus_${rowKey}_ชำระแล้ว`, "#111111", "#FFFFFF", "xs")
      ]
    });
  }

  bodyRows.push(UI_MakeFlexBoxBtn("📝 แก้ไขวิธีชำระ / ตัวเลขบิลนี้", `edit ${rowKey}`, "#F4F5F7", "#111111", "xs"));

  var navBtns = [];
  if (indexNum > 1) {
    navBtns.push(UI_MakeFlexBoxBtn(`⬅️ บิล ${indexNum - 1}/${totalCount}`, `${cmdPrefix}${indexNum - 1}`, "#F0F8FC", "#111111", "xs", "#CBE6F6"));
  }
  if (indexNum < totalCount) {
    navBtns.push(UI_MakeFlexBoxBtn(`➡️ บิลถัดไป (${indexNum + 1}/${totalCount})`, `${cmdPrefix}${indexNum + 1}`, "#1DA1DB", "#FFFFFF", "xs"));
  }
  if (navBtns.length > 0) {
    bodyRows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "xs",
      contents: navBtns
    });
  }

  var billFlex = {
    type: "flex",
    altText: `🧾 บิล ${indexNum}/${totalCount} (${oId} • แถวที่ ${tx.rowIdx})`,
    fallbackText: `🧾 [บิลจัดส่งที่ ${indexNum}/${totalCount} | ${dateStr}]\n🏪 ร้าน: ${tx.store}\n🔖 บิล: ${oId} (📍 แถวที่ ${tx.rowIdx})\n💰 ยอด: ${tx.total.toLocaleString("en")} บ. (${tx.payMethod})`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#111111",
        paddingAll: "12px",
        alignItems: "center",
        contents: [
          { type: "text", text: `🧾 บิล ${indexNum}/${totalCount} • ${oId}`, weight: "bold", size: "xs", color: "#FFFFFF", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `📍 แถว ${tx.rowIdx} (${timeStr})`, size: "xxs", color: "#CCCCCC", align: "end", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: bodyRows
      }
    }
  };

  return [billFlex];
}

/**
 * [REDESIGNED TODAY / YESTERDAY REPORT]:
 * แสดงภาพรวมยอดขาย + รายชื่อร้านค้าทุกบิลที่ซื้อวันนี้ครบในการ์ดเดียว (ไม่มีรูปใบเสร็จพ่วงท้ายให้สับสน)
 * พร้อมปุ่ม "🖼️ ออกตารางสรุปยอดขาย (JPEG)" และปุ่ม "🔍 ดู/แก้ไขบิลรายใบ"
 */
function FIN_ReplyDailyReport(platform, tokenOrChat, daysAgo) {
  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var d = new Date();
  if (daysAgo && daysAgo > 0) d.setDate(d.getDate() - daysAgo);
  var dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  var summary = calculateDailySummary(sheet, idxMap, dateStr);
  var title = (daysAgo === 1) ? "สรุปยอดขายเมื่อวาน (Yesterday)" : "สรุปยอดขายวันนี้ (Today)";
  var cmdPrefix = (daysAgo === 1) ? "yesterday_bill_" : "today_bill_";
  var tableJpegCmd = (daysAgo === 1) ? "yesterday_table_jpeg" : "today_table_jpeg";

  var fallbackText = `📊 [${title}: ${dateStr}]\nยอดขายรวม: ${summary.totalSales.toLocaleString("en")} บ. (${summary.orderCount} บิล)\nรับเงินสด: ${summary.cashSales.toLocaleString("en")} บ. | หักน้ำมัน: -${summary.fuelTotal.toLocaleString("en")} บ.\n💵 เงินสดสุทธิเข้าบริษัท: ${summary.netCashReturn.toLocaleString("en")} บาท`;

  var bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "💰 ยอดขายรวมทั้งหมด", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
        { type: "text", text: `${summary.totalSales.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "text", text: `• เงินสดรับจริง: ${summary.cashSales.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1 },
    { type: "text", text: `• โอนชำระแล้ว: ${summary.transferPaidSales.toLocaleString("en")} บ. | โอนรอสลิป: ${summary.transferPendingSales.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: `• เครดิต (วางบิล): ${summary.creditSales.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1 },
    {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: "⛽ หักเบิกค่าน้ำมันรวม", size: "xs", color: "#B71C1C", flex: 3, maxLines: 1 },
        { type: "text", text: `-${summary.fuelTotal.toLocaleString("en")} บาท`, size: "xs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F0F8FC",
      cornerRadius: "6px",
      paddingAll: "8px",
      margin: "xs",
      contents: [
        { type: "text", text: "💵 เงินสดสุทธิเข้าบริษัท", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
        { type: "text", text: `${summary.netCashReturn.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#2E7D32", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "separator", margin: "sm", color: "#E0E0E0" },
    { type: "text", text: `🏪 รายชื่อร้านค้าที่จัดส่ง (${summary.dayBills.length} บิล):`, size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 }
  ];

  if (summary.dayBills.length === 0) {
    bodyContents.push({
      type: "text",
      text: "ยังไม่มีรายการจัดส่งในวันนี้ครับ",
      size: "xs",
      color: "#888888",
      align: "center",
      margin: "sm"
    });
  } else {
    var showMax = Math.min(summary.dayBills.length, 12);
    for (var i = 0; i < showMax; i++) {
      var b = summary.dayBills[i];
      var shortStore = b.store.replace(/(\[ST-\d+\]\s*)+/gi, "");
      var isPaid = (b.status && b.status.indexOf("ชำระแล้ว") !== -1);
      var payTag = b.payMethod.indexOf("สด") !== -1 ? "สด✅" : (b.payMethod.indexOf("เครดิต") !== -1 ? "เครดิต🧾" : (isPaid ? "โอน✅" : "รอโอน⏳"));
      var itemsArr = [];
      if (b.g15 > 0) itemsArr.push(`15(${b.g15})`);
      if (b.g48 > 0) itemsArr.push(`48(${b.g48})`);
      if (b.cans > 0) itemsArr.push(`ลัง(${b.cans})`);

      bodyContents.push({
        type: "box",
        layout: "horizontal",
        margin: "xs",
        action: { type: "message", label: `ดูบิล ${i + 1}`, text: `${cmdPrefix}${i + 1}` },
        contents: [
          { type: "text", text: `${i + 1}. ${shortStore} • ${itemsArr.join(",")}`, size: "xxs", color: "#222222", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `${b.total.toLocaleString("en")}บ. [${payTag}]`, size: "xxs", weight: "bold", color: isPaid ? "#2E7D32" : "#E65100", align: "end", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      });
    }
    if (summary.dayBills.length > showMax) {
      bodyContents.push({
        type: "text",
        text: `...และอีก ${summary.dayBills.length - showMax} บิล (กดดูตาราง JPEG ด้านล่างได้ครบทุกบิล)`,
        size: "xxs",
        color: "#666666",
        margin: "xs",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      });
    }

    bodyContents.push({ type: "separator", margin: "sm", color: "#E0E0E0" });
    bodyContents.push(UI_MakeFlexBoxBtn("🖼️ ออกตารางสรุปยอดขายวันนี้ (JPEG)", tableJpegCmd, "#1DA1DB", "#FFFFFF", "xs"));
    bodyContents.push(UI_MakeFlexBoxBtn(`🔍 ดู / แก้ไขบิลรายใบ (1/${summary.dayBills.length})`, `${cmdPrefix}1`, "#111111", "#FFFFFF", "xs"));
  }

  bodyContents.push({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "xs",
    contents: [
      UI_MakeFlexBoxBtn("💵 เงินรอฝากรายคน", "เงินรอฝากรายคน", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
      UI_MakeFlexBoxBtn("📋 บิลรอโอน", "pending", "#0288D1", "#FFFFFF", "xs")
    ]
  });

  var summaryFlex = {
    type: "flex",
    altText: `📊 ${title} (${dateStr}) รวม ${summary.totalSales.toLocaleString("en")} บาท`,
    fallbackText: fallbackText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `📊 ${title}`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `วันที่ ${dateStr} • ส่งจริง ${summary.orderCount} บิล (15กก.=${summary.t15} | 48กก.=${summary.t48} | กระป๋อง=${summary.tCan})`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  MSG_SendReply(platform, tokenOrChat, [summaryFlex], UI_GetAdminHomeQr());
}

function FIN_ReplyDailySummaryTableJpeg(platform, tokenOrChat, daysAgo) {
  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var d = new Date();
  if (daysAgo && daysAgo > 0) d.setDate(d.getDate() - daysAgo);
  var dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  var summary = calculateDailySummary(sheet, idxMap, dateStr);

  if (summary.dayBills.length === 0) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `📅 [ตารางสรุปยอดขาย]\nไม่มีรายการขายในวันที่ ${dateStr} ครับ` }], UI_GetAdminHomeQr());
    return;
  }

  if (typeof PDF_CreateDailySalesTableJpeg === "function") {
    var doc = PDF_CreateDailySalesTableJpeg(dateStr, summary);
    if (doc && doc.imgUrl) {
      MSG_SendReply(platform, tokenOrChat, [
        { type: "image", originalContentUrl: doc.imgUrl, previewImageUrl: doc.imgUrl }
      ], UI_GetAdminHomeQr());
      return;
    }
  }
  MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ ไม่สามารถสร้างรูปตารางได้ในขณะนี้ครับ" }], UI_GetAdminHomeQr());
}

function FIN_ReplyDailyBillDetailPage(platform, tokenOrChat, daysAgo, billIndex1Based) {
  var d = new Date();
  if (daysAgo && daysAgo > 0) d.setDate(d.getDate() - daysAgo);
  var dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  var dayBills = FIN_GetDailyBillsList(dateStr);
  var cmdPrefix = (daysAgo === 1) ? "yesterday_bill_" : "today_bill_";

  if (dayBills.length === 0) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `📅 [รายงานรายวัน]\nไม่มีรายการจัดส่งในวันที่ ${dateStr} ครับ` }], UI_GetAdminHomeQr());
    return;
  }

  var idx = Math.max(1, Math.min(billIndex1Based, dayBills.length));
  var targetTx = dayBills[idx - 1];
  var bubbles = FIN_BuildSingleBillBubbles(targetTx, idx, dayBills.length, dateStr, cmdPrefix);

  MSG_SendReply(platform, tokenOrChat, bubbles, UI_GetAdminHomeQr());
}

function FIN_ReplyCompanyIncome(platform, tokenOrChat) {
  if (typeof Staff_ReplyAccumulatedCash === "function") {
    Staff_ReplyAccumulatedCash(platform, tokenOrChat, true);
  }
}

function calculateMonthlySummary(sheet, idxMap, targetYear, targetMonth0Based) {
  var now = new Date();
  var cYear = (targetYear !== undefined && targetYear !== null) ? targetYear : now.getFullYear();
  var cMonth = (targetMonth0Based !== undefined && targetMonth0Based !== null) ? targetMonth0Based : now.getMonth();

  var thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var thShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  var monthTH = thMonths[cMonth];

  var monthTx = (typeof DB_GetTransactionsByYearMonth === "function")
                ? DB_GetTransactionsByYearMonth(cYear, cMonth)
                : DB_GetTransactions();

  var totalSales = 0, cashSales = 0, transferPaid = 0, transferPend = 0, creditSales = 0, fuelTotal = 0, t15 = 0, t48 = 0, tCan = 0, billCnt = 0, storeMap = {};

  for (var i = 0; i < monthTx.length; i++) {
    var tx = monthTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var rDate = parseSheetDate(tx.date);
    if (rDate && rDate.getMonth() === cMonth && rDate.getFullYear() === cYear) {
      billCnt++;
      totalSales += tx.total; fuelTotal += tx.fuelCost;
      t15 += tx.g15; t48 += tx.g48; tCan += tx.cans;
      var isPaid = (tx.status.indexOf("ชำระแล้ว") !== -1);
      if (tx.payMethod.indexOf("สด") !== -1) cashSales += tx.total;
      else if (tx.payMethod.indexOf("โอน") !== -1) { if (isPaid) transferPaid += tx.total; else transferPend += tx.total; }
      else if (tx.payMethod.indexOf("เครดิต") !== -1) creditSales += tx.total;
      storeMap[tx.store] = (storeMap[tx.store] || 0) + tx.total;
    }
  }

  var keys = Object.keys(storeMap).sort(function(a, b) { return storeMap[b] - storeMap[a]; });
  var topRows = keys.slice(0, 5).map(function(k, idx) {
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${idx + 1}. ${k}`, size: "xs", color: "#333333", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `${storeMap[k].toLocaleString("en")} บ.`, size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1 }
      ]
    };
  });

  if (topRows.length === 0) {
    topRows.push({ type: "text", text: "ไม่มีรายการขายในเดือนนี้", size: "xs", color: "#888888", align: "center" });
  }

  var prevDate1 = new Date(cYear, cMonth - 1, 1);
  var prevDate2 = new Date(cYear, cMonth - 2, 1);
  var curNow = new Date();

  var cmdPrev1 = "monthly_" + prevDate1.getFullYear() + "_" + String(prevDate1.getMonth() + 1).padStart(2, "0");
  var cmdPrev2 = "monthly_" + prevDate2.getFullYear() + "_" + String(prevDate2.getMonth() + 1).padStart(2, "0");
  var lblPrev1 = `⏪ ${thShort[prevDate1.getMonth()]} ${(prevDate1.getFullYear() + 543) % 100}`;
  var lblPrev2 = `⏪ ${thShort[prevDate2.getMonth()]} ${(prevDate2.getFullYear() + 543) % 100}`;

  var bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `💰 ยอดขายรวม (${billCnt} บิล)`, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
        { type: "text", text: `${totalSales.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "text", text: `• เงินสด: ${cashSales.toLocaleString("en")} บ. | หักน้ำมัน: -${fuelTotal.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: `• โอนชำระแล้ว: ${transferPaid.toLocaleString("en")} บ. | รอสลิป: ${transferPend.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: `• เครดิต: ${creditSales.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1 },
    { type: "text", text: `📦 15กก.=${t15} ถัง | 48กก.=${t48} ถัง | กระป๋อง=${tCan} ลัง`, size: "xxs", weight: "bold", color: "#1DA1DB", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "separator", margin: "sm", color: "#E0E0E0" },
    { type: "text", text: "🏆 Top 5 ร้านค้าประจำเดือน", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 }
  ].concat(topRows).concat([
    { type: "separator", margin: "md", color: "#E0E0E0" },
    { type: "text", text: "🗓️ เลือกดูสรุปยอดเดือนอื่น:", size: "xxs", weight: "bold", color: "#555555", margin: "xs", maxLines: 1 },
    {
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      contents: [
        UI_MakeFlexBoxBtn(lblPrev1, cmdPrev1, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn(lblPrev2, cmdPrev2, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn(`📅 เดือนนี้ (${thShort[curNow.getMonth()]})`, "monthly", "#111111", "#FFFFFF", "xxs")
      ]
    }
  ]);

  return {
    type: "flex",
    altText: `🗓️ สรุปยอดรายเดือน ${monthTH} ${cYear + 543} (${totalSales.toLocaleString("en")} บ.)`,
    fallbackText: `🗓️ [สรุปยอดขายรายเดือน: ${monthTH} ${cYear + 543}] ยอดรวม: ${totalSales.toLocaleString("en")} บ. (${billCnt} บิล)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `🗓️ สรุปยอดเดือน ${monthTH} ${cYear + 543}`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" }
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

function FIN_ReplyMonthlyReport(platform, tokenOrChat, ymParam) {
  var ss = DB_GetSpreadsheet();
  var now = new Date();
  var targetYear = now.getFullYear();
  var targetMonth = now.getMonth();

  if (ymParam) {
    var clean = String(ymParam).trim().toLowerCase();
    if (clean === "monthly_prev" || clean === "เดือนที่แล้ว") {
      var pDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      targetYear = pDate.getFullYear();
      targetMonth = pDate.getMonth();
    } else {
      var m = clean.match(/(\d{4})[_-](\d{1,2})/);
      if (m) {
        targetYear = parseInt(m[1], 10);
        if (targetYear > 2500) targetYear -= 543;
        targetMonth = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
      }
    }
  }

  var flexMonthly = calculateMonthlySummary(getTargetSheet(ss), getColumnIndexes(), targetYear, targetMonth);
  MSG_SendReply(platform, tokenOrChat, [flexMonthly], UI_GetAdminHomeQr());
}

function FIN_ReplyWeeklyReport(platform, tokenOrChat) {
  var allTx = DB_GetTransactions(), today = new Date(), day = today.getDay() === 0 ? 7 : today.getDay();
  var lastMon = new Date(today.getTime() - ((day + 6) * 86400000)); lastMon.setHours(0, 0, 0, 0);
  var lastSun = new Date(lastMon.getTime() + (6 * 86400000)); lastSun.setHours(23, 59, 59, 999);
  var cnt = 0, total = 0, cash = 0, trans = 0, cred = 0, fuel = 0;

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var rDate = parseSheetDate(tx.date);
    if (rDate && rDate >= lastMon && rDate <= lastSun) {
      cnt++; total += tx.total; fuel += tx.fuelCost;
      if (tx.payMethod.indexOf("สด") !== -1) cash += tx.total;
      else if (tx.payMethod.indexOf("โอน") !== -1) trans += tx.total;
      else if (tx.payMethod.indexOf("เครดิต") !== -1) cred += tx.total;
    }
  }
  var rangeStr = Utilities.formatDate(lastMon, "GMT+7", "dd/MM/yyyy") + " - " + Utilities.formatDate(lastSun, "GMT+7", "dd/MM/yyyy");
  var flexWeekly = {
    type: "flex",
    altText: `📆 สรุปยอดรายสัปดาห์ (${rangeStr})`,
    fallbackText: `📆 [สถิติยอดขายรายสัปดาห์: ${rangeStr}]\nยอดขายรวม: ${total.toLocaleString("en")} บ. (${cnt} บิล)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📆 สถิติยอดขายรายสัปดาห์ (Weekly)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `รอบวันที่ ${rangeStr} (${cnt} บิล)`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "💰 ยอดขายรวม", size: "xs", weight: "bold", color: "#111111", flex: 2, maxLines: 1 },
              { type: "text", text: `${total.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", align: "end", flex: 3, maxLines: 1 }
            ]
          },
          { type: "text", text: `• เงินสด: ${cash.toLocaleString("en")} บ. | โอน: ${trans.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `• เครดิต: ${cred.toLocaleString("en")} บ. | หักน้ำมัน: -${fuel.toLocaleString("en")} บ.`, size: "xxs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          UI_MakeFlexBoxBtn("💵 ดูเงินสดรอฝากรายคน", "เงินรอฝากรายคน", "#F0F8FC", "#111111", "xs", "#CBE6F6")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [flexWeekly], UI_GetAdminHomeQr());
}

function FIN_ReplyDebtSummary(platform, tokenOrChat) {
  var allTx = DB_GetTransactions(), storeSummary = {}, grandTotal = 0;
  var storeTermMap = {};
  var allStores = DB_GetAllActiveStores();
  for (var s = 0; s < allStores.length; s++) {
    storeTermMap[allStores[s].storeName] = allStores[s].creditTerm || "";
  }

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var rowDate = parseSheetDate(tx.date);
    if (!rowDate) continue;

    var cTerm = storeTermMap[tx.store] || "";
    var isCreditStore = (cTerm === "15" || cTerm === "30");
    var isCredit = isCreditStore && (rowDate >= CONFIG.CUTOFF_CREDIT) && (tx.payMethod.indexOf("เครดิต") !== -1 || tx.payMethod.indexOf("โอน") !== -1);
    var isPending = (!isCreditStore) && (rowDate >= CONFIG.CUTOFF_PENDING) && (tx.payMethod.indexOf("โอน") !== -1 || tx.payMethod.indexOf("เครดิต") !== -1);

    if ((isCredit || isPending) && tx.status.indexOf("ชำระแล้ว") === -1) {
      if (!storeSummary[tx.store]) storeSummary[tx.store] = { totalAmt: 0 };
      storeSummary[tx.store].totalAmt += tx.total;
      grandTotal += tx.total;
    }
  }
  var keys = Object.keys(storeSummary);
  if (keys.length === 0) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [สรุปลูกหนี้ค้างชำระ]\nไม่มียอดหนี้ค้างชำระในระบบครับ" }], UI_GetAdminHomeQr());
    return;
  }

  var rows = [];
  for (var k = 0; k < Math.min(keys.length, 12); k++) {
    var sName = keys[k];
    rows.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${k + 1}. ${sName}`, size: "xs", color: "#222222", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `${storeSummary[sName].totalAmt.toLocaleString("en")} บ.`, size: "xs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
      ]
    });
  }
  rows.push({ type: "separator", margin: "sm", color: "#E0E0E0" });
  rows.push({
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      { type: "text", text: "💰 รวมลูกหนี้ค้างทั้งหมด", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
      { type: "text", text: `${grandTotal.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
    ]
  });
  rows.push({
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    margin: "sm",
    contents: [
      UI_MakeFlexBoxBtn("📋 บิลรอโอน", "pending", "#0288D1", "#FFFFFF", "xxs"),
      UI_MakeFlexBoxBtn("🧾 เครดิต 15 วัน", "invoice15", "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
      UI_MakeFlexBoxBtn("🧾 เครดิต 30 วัน", "invoice30", "#F0F8FC", "#111111", "xxs", "#CBE6F6")
    ]
  });

  var debtFlex = {
    type: "flex",
    altText: `📊 สรุปลูกหนี้รวมทั้งหมด ${grandTotal.toLocaleString("en")} บาท`,
    fallbackText: `📊 สรุปลูกหนี้ค้างชำระทั้งหมด: ${grandTotal.toLocaleString("en")} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📊 สรุปลูกหนี้ค้างชำระทั้งหมด", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "โอนรายบิลเริ่ม 1 พ.ย. 69 • เครดิตเริ่ม 1 ต.ค. 69", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: rows
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [debtFlex], UI_GetAdminHomeQr());
}

function FIN_BuildPendingBillFlexBubble(item, parsedDate, pageNum, totalPages, totalBillsCount, storeFilterOptional, includeNavButtons) {
  var now = new Date();
  var tm = Utilities.formatDate(parsedDate, "GMT+7", "dd/MM/yy HH:mm");
  var hoursDiff = Math.max(0, Math.floor((now - parsedDate) / 3600000));
  var overdueLabel = hoursDiff >= 48 ? (`ค้าง ${Math.floor(hoursDiff / 24)} วัน`) : (`ค้าง ${hoursDiff} ชม.`);
  var flag = hoursDiff >= 48 ? "🚩" : "🟡";
  var oId = item.orderId.indexOf("#") === 0 ? item.orderId : "#" + item.orderId;
  var rowKey = "ROW-" + item.rowIdx;
  var stObj = DB_GetStoreById(item.store);
  var stIdCode = stObj ? stObj.storeId : item.store;

  var items = [];
  if (item.g15 > 0) items.push("15กก.(" + item.g15 + ")");
  if (item.g48 > 0) items.push("48กก.(" + item.g48 + ")");
  if (item.cans > 0) items.push("กระป๋อง(" + item.cans + ")");

  var bodyContents = [
    { type: "text", text: `${flag} ${item.store}`, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `🧾 ${oId} (${tm})`, size: "xs", color: "#333333", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: overdueLabel, size: "xxs", weight: "bold", color: hoursDiff >= 48 ? "#B71C1C" : "#E65100", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    { type: "text", text: `📦 ${items.join(", ") || "-"} | 👤 ผู้ส่ง: ${item.sender}`, size: "xs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "separator", margin: "sm", color: "#E0E0E0" },
    {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: "ยอดรอโอนตามระบบ", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
        { type: "text", text: `${item.total.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "sm",
      contents: [
        UI_MakeFlexBoxBtn("📲 จับคู่สลิป", `match ${rowKey}`, "#0288D1", "#FFFFFF", "xs"),
        UI_MakeFlexBoxBtn("✅ ชำระแล้ว", `setstatus_${rowKey}_ชำระแล้ว`, "#111111", "#FFFFFF", "xs")
      ]
    },
    UI_MakeFlexBoxBtn("📄 ดูใบแจ้งหนี้ (รูปภาพ)", `ขอดูใบแจ้งหนี้ ${stIdCode}`, "#F0F8FC", "#111111", "xs", "#CBE6F6")
  ];

  if (includeNavButtons && totalPages > 1) {
    var filterPart = storeFilterOptional ? (storeFilterOptional + " ") : "";
    var navRow = [];
    if (pageNum > 1) {
      navRow.push(UI_MakeFlexBoxBtn(`⬅️ หน้า ${pageNum - 1}/${totalPages}`, `pending ${filterPart}${pageNum - 1}`, "#F4F5F7", "#111111", "xs"));
    }
    if (pageNum < totalPages) {
      navRow.push(UI_MakeFlexBoxBtn(`➡️ หน้าถัดไป (${pageNum + 1}/${totalPages})`, `pending ${filterPart}${pageNum + 1}`, "#1DA1DB", "#FFFFFF", "xs"));
    }
    if (navRow.length > 0) {
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "xs",
        contents: navRow
      });
    }
  }

  return {
    type: "flex",
    altText: `${flag} บิลรอโอน ${oId} (แถว ${item.rowIdx}) ${item.store}`,
    fallbackText: `${flag} ร้าน: ${item.store} | บิล: ${oId} (📍 แถวที่ ${item.rowIdx}) | ยอด: ${item.total.toLocaleString("en")} บ.`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#1DA1DB",
        paddingAll: "12px",
        alignItems: "center",
        contents: [
          { type: "text", text: `📋 บิลรอโอน • หน้า ${pageNum}/${totalPages}`, weight: "bold", size: "xs", color: "#FFFFFF", flex: 3, maxLines: 1 },
          { type: "text", text: `📍 แถวที่ ${item.rowIdx} (รวม ${totalBillsCount})`, size: "xxs", color: "#E8F6FC", align: "end", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" }
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

function FIN_GetFilteredPendingRows(storeFilter) {
  var allTx = DB_GetTransactions(), pendRows = [];
  var storeTermMap = {};
  var allStores = DB_GetAllActiveStores();
  for (var s = 0; s < allStores.length; s++) {
    storeTermMap[allStores[s].storeName] = allStores[s].creditTerm || "";
  }

  var nowLimitMs = new Date().getTime() + 43200000;

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var rDate = parseSheetDate(tx.date);
    if (!rDate || rDate < CONFIG.CUTOFF_PENDING || rDate.getTime() > nowLimitMs) continue;
    var isUnpaid = tx.status.indexOf("ชำระแล้ว") === -1;

    var stTerm = storeTermMap[tx.store] || "";
    if (!storeFilter && (stTerm === "15" || stTerm === "30")) continue;

    var isMatchPay = (tx.payMethod.indexOf("โอน") !== -1 || tx.payMethod.indexOf("เครดิต") !== -1 || tx.payMethod.indexOf("ผสม") !== -1);
    if (isMatchPay && isUnpaid) {
      if (storeFilter && tx.store.toLowerCase().indexOf(storeFilter.toLowerCase()) === -1) continue;
      pendRows.push({ tx: tx, dateObj: rDate });
    }
  }
  pendRows.sort(function(a, b) { return a.dateObj - b.dateObj; });
  return pendRows;
}

function FIN_HandlePendingCommand(platform, userId, tokenOrChat, userText) {
  var parsed = parseStoreAndPage(userText, "pending");
  var pendRows = FIN_GetFilteredPendingRows(parsed.storeFilter);

  if (pendRows.length === 0) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [บิลรอโอน (เริ่มนับ 1 พ.ย. 69)]\nไม่มีบิลค้างโอน/รอสลิปในขณะนี้ครับ" }], UI_GetAdminHomeQr());
    return;
  }

  var tPages = Math.ceil(pendRows.length / 2);
  if (parsed.page > tPages) parsed.page = tPages;
  if (parsed.page < 1) parsed.page = 1;

  var sIdx = (parsed.page - 1) * 2, eIdx = Math.min(sIdx + 2, pendRows.length);
  var rMsgs = [];

  for (var j = sIdx; j < eIdx; j++) {
    var item = pendRows[j].tx, parsedDate = pendRows[j].dateObj;
    var isLastOnPage = (j === eIdx - 1);
    var billFlex = FIN_BuildPendingBillFlexBubble(item, parsedDate, parsed.page, tPages, pendRows.length, parsed.storeFilter, isLastOnPage);
    rMsgs.push(billFlex);

    var sUrl = getPublicDirectImageUrl(item.slipUrl);
    if (sUrl && rMsgs.length < 5) {
      rMsgs.push({ type: "image", originalContentUrl: sUrl, previewImageUrl: sUrl });
    }
  }

  MSG_SendReply(platform, tokenOrChat, rMsgs, UI_GetAdminHomeQr());
}

function buildTransientCreditMessages(billingCycleLabel, requestedPage, storeFilter, sheet, idxMap, cycleType, userId) {
  var allTx = DB_GetTransactions(), groupData = {};
  var thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

  var storeTermMap = {};
  var allStores = DB_GetAllActiveStores();
  for (var s = 0; s < allStores.length; s++) {
    storeTermMap[allStores[s].storeName] = allStores[s].creditTerm || "";
  }

  var nowLimitMs = new Date().getTime() + 43200000;

  for (var i = 0; i < allTx.length; i++) {
    var tx = allTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
    var rowDate = parseSheetDate(tx.date);
    if (!rowDate || rowDate < CONFIG.CUTOFF_CREDIT || rowDate.getTime() > nowLimitMs) continue;

    var stTerm = storeTermMap[tx.store] || "";
    if (stTerm !== cycleType) continue;

    var isUnpaid = (tx.status.indexOf("ชำระแล้ว") === -1);
    var isCreditOrTransfer = (tx.payMethod.indexOf("เครดิต") !== -1 || tx.payMethod.indexOf("โอน") !== -1);

    if (isCreditOrTransfer && isUnpaid) {
      if (storeFilter && tx.store.toLowerCase().indexOf(storeFilter.toLowerCase()) === -1) continue;

      var oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
      var itemStrs = [];
      if (tx.g15 > 0) itemStrs.push("ถัง 15 กก. x " + tx.g15);
      if (tx.g48 > 0) itemStrs.push("ถัง 48 กก. x " + tx.g48);
      if (tx.cans > 0) itemStrs.push("กระป๋อง x " + tx.cans + " ลัง");

      var mIdx = rowDate.getMonth(), yNum = rowDate.getFullYear(), isFirstHalf = rowDate.getDate() <= 15;
      var periodSuffix = cycleType === "15" ? (isFirstHalf ? " (รอบ 1-15)" : " (รอบ 16-สิ้นเดือน)") : "";
      var cycleKeyStr = cycleType === "15" ? (isFirstHalf ? "-H1" : "-H2") : "";
      var groupKey = tx.store + "___" + yNum + "-" + (mIdx < 9 ? "0" + (mIdx + 1) : (mIdx + 1)) + cycleKeyStr;

      if (!groupData[groupKey]) {
        groupData[groupKey] = {
          storeName: tx.store, year: yNum, monthIdx: mIdx,
          period: cycleType === "15" ? (isFirstHalf ? "H1" : "H2") : "FULL",
          monthName: thMonths[mIdx] + " " + (yNum + 543) + periodSuffix,
          bills: [], totalAmt: 0
        };
      }
      groupData[groupKey].bills.push({
        rowIdx: tx.rowIdx,
        dateObj: rowDate,
        date: Utilities.formatDate(rowDate, "GMT+7", "dd/MM/yyyy HH:mm"),
        shortDate: Utilities.formatDate(rowDate, "GMT+7", "dd/MM/yy"),
        id: oId, amt: tx.total, note: tx.note, sender: tx.sender, itemDesc: itemStrs.join(", ") || "-"
      });
      groupData[groupKey].totalAmt += tx.total;
    }
  }

  var groupKeys = Object.keys(groupData);
  if (groupKeys.length === 0) return null;
  groupKeys.sort();

  var totalPages = groupKeys.length;
  if (requestedPage > totalPages) requestedPage = totalPages;
  if (requestedPage < 1) requestedPage = 1;

  var targetGroup = groupData[groupKeys[requestedPage - 1]];
  targetGroup.bills.sort(function(a, b) { return a.dateObj - b.dateObj; });

  var assignedBillingId = "B" + requestedPage;
  var exactBillIds = targetGroup.bills.map(function(b) { return "ROW-" + b.rowIdx; });
  var transientStoreMap = {};
  transientStoreMap[assignedBillingId] = {
    store: targetGroup.storeName,
    year: targetGroup.year,
    monthIdx: targetGroup.monthIdx,
    period: targetGroup.period,
    orderIds: exactBillIds
  };
  PropertiesService.getScriptProperties().setProperty("transient_store_map_" + userId, JSON.stringify(transientStoreMap));
  PropertiesService.getScriptProperties().setProperty("transient_store_map_GLOBAL", JSON.stringify(transientStoreMap));

  var stObj = DB_GetStoreById(targetGroup.storeName);
  var officialBillingName = stObj ? stObj.billingName : targetGroup.storeName;
  var bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ"), bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777"), bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");

  var cache = CacheService.getScriptCache();
  var pdfCacheKey = `cred_pdf_v470_${targetGroup.storeName}_${targetGroup.totalAmt}_${targetGroup.bills.length}_${String(officialBillingName).length}`;
  var cachedPdfStr = cache.get(pdfCacheKey);
  var pdfInfo = cachedPdfStr ? JSON.parse(cachedPdfStr) : null;
  if (!pdfInfo) {
    var rawPdf = (typeof createInvoicePDFWithImage === "function")
      ? createInvoicePDFWithImage(officialBillingName + " (" + targetGroup.monthName + ")", targetGroup.bills, targetGroup.totalAmt, Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy"), billingCycleLabel, assignedBillingId, bName, bAcc, bOwner)
      : { pdfUrl: "-", imgUrl: "" };
    var directImg = rawPdf.imgUrl || getPublicDirectImageUrl(rawPdf.pdfUrl);
    pdfInfo = { pdfUrl: rawPdf.pdfUrl, imgUrl: directImg };
    try { cache.put(pdfCacheKey, JSON.stringify(pdfInfo), 10800); } catch (e) {}
  }

  var cmdName = (cycleType === "30" ? "invoice30" : "invoice15") + (storeFilter ? " " + storeFilter : "");
  var prevCmdStr = requestedPage > 1 ? cmdName + " " + (requestedPage - 1) : null;
  var nextCmdStr = requestedPage < totalPages ? cmdName + " " + (requestedPage + 1) : null;

  var billRows = [];
  for (var bIdx = 0; bIdx < Math.min(targetGroup.bills.length, 8); bIdx++) {
    var b = targetGroup.bills[bIdx];
    billRows.push({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `• ${b.id} (${b.shortDate} • แถว ${b.rowIdx})`, size: "xs", color: "#333333", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `${b.amt.toLocaleString("en")} บ.`, size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1 }
      ]
    });
  }

  var bodyContents = [
    { type: "text", text: `🏪 ${targetGroup.storeName}`, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: `📅 รอบบิล: ${targetGroup.monthName}`, size: "xs", color: "#1DA1DB", weight: "bold", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "separator", margin: "sm", color: "#E0E0E0" }
  ].concat(billRows).concat([
    { type: "separator", margin: "sm", color: "#E0E0E0" },
    {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: `ยอดรวม (${targetGroup.bills.length} บิล)`, size: "xs", weight: "bold", color: "#111111", flex: 2, maxLines: 1 },
        { type: "text", text: `${targetGroup.totalAmt.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", align: "end", flex: 3, maxLines: 1 }
      ]
    },
    UI_MakeFlexBoxBtn(`📲 จับคู่สลิปตัดยอดงวด ${assignedBillingId}`, `match ${assignedBillingId}`, "#1DA1DB", "#FFFFFF", "xs")
  ]);

  var navBtns = [];
  if (prevCmdStr) navBtns.push(UI_MakeFlexBoxBtn(`⬅️ หน้า ${requestedPage - 1}/${totalPages}`, prevCmdStr, "#F4F5F7", "#111111", "xs"));
  if (nextCmdStr) navBtns.push(UI_MakeFlexBoxBtn(`➡️ ร้านถัดไป (${requestedPage + 1}/${totalPages})`, nextCmdStr, "#111111", "#FFFFFF", "xs"));
  if (navBtns.length > 0) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "xs",
      contents: navBtns
    });
  }

  var creditFlex = {
    type: "flex",
    altText: `🧾 ใบวางบิล${billingCycleLabel} (${targetGroup.storeName})`,
    fallbackText: `🧾 [ใบวางบิล${billingCycleLabel}] ร้าน: ${targetGroup.storeName} ยอดรวม: ${targetGroup.totalAmt.toLocaleString("en")} บ.`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#1DA1DB",
        paddingAll: "12px",
        contents: [
          { type: "text", text: `🧾 วางบิล${billingCycleLabel} (${assignedBillingId})`, weight: "bold", size: "xs", color: "#FFFFFF", flex: 3, maxLines: 1 },
          { type: "text", text: `หน้า ${requestedPage}/${totalPages}`, size: "xxs", color: "#E8F6FC", align: "end", flex: 2, maxLines: 1 }
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

  var messagesArr = [creditFlex];
  if (pdfInfo.imgUrl) messagesArr.push({ type: "image", originalContentUrl: pdfInfo.imgUrl, previewImageUrl: pdfInfo.imgUrl });

  return { messages: messagesArr, nextCmd: nextCmdStr, billIds: targetGroup.bills.map(function(b) { return b.id; }), billingId: assignedBillingId };
}

function FIN_HandleInvoiceCommand(platform, userId, tokenOrChat, userText, cycleType) {
  var ss = DB_GetSpreadsheet(), prefix = userText.split(/\s+/)[0], parsed = parseStoreAndPage(userText, prefix);
  var label = cycleType === "30" ? "เครดิต 30 วัน" : "เครดิต 15 วัน";
  var res = buildTransientCreditMessages(label, parsed.page, parsed.storeFilter, getTargetSheet(ss), getColumnIndexes(), cycleType, userId);

  if (!res) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `✅ [ใบวางบิล${label}]\nไม่มียอดค้างชำระสำหรับร้านที่ตั้งค่า "${label}" ครับ (เริ่มนับตั้งแต่ 1 ต.ค. 69)` }], UI_GetAdminHomeQr());
    return;
  }

  MSG_SendReply(platform, tokenOrChat, res.messages, UI_GetAdminHomeQr());
}

function FIN_ApplySlipUrlToBills(platform, tokenOrChat, billsArray, slipUrl, billingIdTag, userId, roomId) {
  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var transferTimeStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  var summaryLines = [];

  var autoBatchTag = billingIdTag;
  if (!autoBatchTag && billsArray.length > 1) {
    var stMatch = String(billsArray[0].store || "").match(/\[(ST-\d+)\]/i);
    var stCode = stMatch ? stMatch[1].toUpperCase() : "BATCH";
    autoBatchTag = "INV-" + stCode + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd");
  }

  for (var i = 0; i < billsArray.length; i++) {
    var b = billsArray[i];
    if (b.rowIdx) {
      if (autoBatchTag) {
        sheet.getRange(b.rowIdx, idxMap.billingId + 1).setValue(autoBatchTag);
      }
      var safeOrderId = String(b.id || ("#" + (b.rowIdx - 1)));
      if (!safeOrderId.startsWith("#")) safeOrderId = "#" + safeOrderId;
      sheet.getRange(b.rowIdx, idxMap.orderId + 1, 1, 4).setValues([[safeOrderId, "ชำระแล้ว", slipUrl, transferTimeStr]]);
      summaryLines.push(`• [${b.store}] ${safeOrderId} (แถว ${b.rowIdx} : ${b.amount.toLocaleString("en")} บ.)`);
    }
  }

  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  FIN_ClearManualMatchSession(props, cache, userId, roomId);

  DB_ClearTxCache();

  var remainingPending = FIN_GetFilteredPendingRows(null);
  var batchHeader = autoBatchTag ? `🔖 รหัสชุดเคลียร์บิล: ${autoBatchTag}\n` : "";

  var doneFlex = {
    type: "flex",
    altText: "✅ จับคู่สลิปลงคอลัมน์ X และตัดยอดสำเร็จ!",
    fallbackText: `✅ [จับคู่สลิปและตัดยอดสำเร็จ]\n${batchHeader}${summaryLines.join("\n")}\n📌 สถานะ: ชำระแล้ว`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "✅ จับคู่สลิปและตัดยอดสำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
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
            ? { type: "text", text: `🔖 รหัสชุดโอนรวม: ${autoBatchTag}`, size: "xs", weight: "bold", color: "#0288D1", maxLines: 1 }
            : { type: "text", text: "🧾 รายการบิลที่ตัดยอด:", size: "xs", weight: "bold", color: "#111111", maxLines: 1 }),
          { type: "text", text: summaryLines.join("\n"), size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "📌 บันทึกลิงก์สลิปลงคอลัมน์ X เรียบร้อย", size: "xxs", weight: "bold", color: "#2E7D32", maxLines: 1 },
          { type: "text", text: `📋 บิลรอโอนคงเหลือ: ${remainingPending.length} บิล`, size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              UI_MakeFlexBoxBtn(`📋 บิลรอโอน (${remainingPending.length})`, "pending", "#0288D1", "#FFFFFF", "xs"),
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
  TG_SendNotification(`✅ [จับคู่สลิปโอนเงินสำเร็จ]\n${batchHeader}${summaryLines.join("\n")}\n🔗 สลิปช่อง X: ${slipUrl}`);
}

function FIN_PrepareManualMatch(platform, userId, tokenOrChat, userText, roomId) {
  var rawTgt = userText.replace(/^(?:match_store_|match\s+)/i, "").trim().toUpperCase();
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();

  if (rawTgt === "CANCEL" || rawTgt === "ยกเลิก") {
    FIN_ClearManualMatchSession(props, cache, userId, roomId);
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "✅ [ยกเลิกการรอรับสลิป]\nยกเลิกสถานะรอรับรูปสลิปโอนเงินเรียบร้อยครับ"
    }], UI_GetAdminHomeQr());
    return;
  }

  var recentSlipUrl = cache.get("UNMATCHED_SLIP_" + userId) ||
                      (roomId ? cache.get("UNMATCHED_SLIP_" + roomId) : null);

  var stTarget = DB_GetStoreById(rawTgt);
  if (stTarget) {
    var debtDetails = DB_GetStoreDebtDetails(stTarget.storeName);
    var stBills = (debtDetails.bills || []).map(function(b) {
      return { id: b.orderId, store: stTarget.storeName, amount: b.amount, rowIdx: b.rowIdx };
    });
    if (stBills.length > 0) {
      var batchTag = "INV-" + stTarget.storeId;
      if (recentSlipUrl) {
        FIN_ApplySlipUrlToBills(platform, tokenOrChat, stBills, recentSlipUrl, batchTag, userId, roomId);
        return;
      }
      var stIdListStr = stBills.map(function(b) { return "ROW-" + b.rowIdx; }).join(",");
      var nowMs = String(new Date().getTime());
      props.setProperty("pending_match_order_ids_" + userId, stIdListStr);
      if (roomId) props.setProperty("pending_match_order_ids_" + roomId, stIdListStr);
      props.setProperty("pending_match_active_billing_id_" + userId, batchTag);
      props.setProperty("pending_match_timestamp_" + userId, nowMs);

      var stListTxt = stBills.map(function(b) { return `• บิล ${b.id} (${b.amount.toLocaleString("en")} บ.)`; }).join("\n");
      var waitStoreFlex = {
        type: "flex",
        altText: `📸 พร้อมรับรูปสลิป (${stTarget.storeName}) ภายใน 3 นาที`,
        fallbackText: `📸 [พร้อมรับรูปสลิปโอนรวบยอด: ${stTarget.storeName}]\n⏱️ กรุณาส่งรูปสลิปภายใน 3 นาที`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0288D1",
            paddingAll: "14px",
            contents: [
              { type: "text", text: "📸 พร้อมรับรูปสลิป (Time Out 3 นาที)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: "14px",
            backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: `🏪 ${stTarget.storeName}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
              { type: "text", text: stListTxt, size: "xs", color: "#333333", wrap: true },
              { type: "text", text: `💰 ยอดโอนรวม: ${debtDetails.pendingDebt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
              { type: "text", text: "⏱️ กรุณาส่งรูปสลิปภายใน 3 นาที (เกินเวลาตัดอัตโนมัติ)", size: "xxs", color: "#E65100", wrap: true },
              { type: "separator", margin: "sm", color: "#E0E0E0" },
              UI_MakeFlexBoxBtn("❌ ยกเลิกการรอรับสลิป", "match CANCEL", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
            ]
          }
        }
      };
      MSG_SendReply(platform, tokenOrChat, [waitStoreFlex], UI_GetAdminHomeQr());
      return;
    }
  }

  var mapStr = props.getProperty("transient_store_map_" + userId) || props.getProperty("transient_store_map_GLOBAL");
  if (mapStr) {
    var storeMap = JSON.parse(mapStr);
    var targetObj = storeMap[rawTgt];
    if (targetObj) {
      var presetIds = targetObj.orderIds || [];
      var allTx = DB_GetTransactions(), fBills = [], tAmt = 0;

      for (var i = 0; i < presetIds.length; i++) {
        var foundTx = DB_FindTxByBillNo(presetIds[i], allTx);
        if (foundTx) {
          var dispId = foundTx.orderId.indexOf("#") === 0 ? foundTx.orderId : "#" + foundTx.orderId;
          fBills.push({ id: dispId, store: foundTx.store, amount: foundTx.total, rowIdx: foundTx.rowIdx });
          tAmt += foundTx.total;
        }
      }

      if (fBills.length > 0) {
        if (recentSlipUrl) {
          FIN_ApplySlipUrlToBills(platform, tokenOrChat, fBills, recentSlipUrl, rawTgt, userId, roomId);
          return;
        }
        var idListStr = fBills.map(function(b) { return "ROW-" + b.rowIdx; }).join(",");
        var nowMsStr = String(new Date().getTime());
        props.setProperty("pending_match_order_ids_" + userId, idListStr);
        if (roomId) props.setProperty("pending_match_order_ids_" + roomId, idListStr);
        props.setProperty("pending_match_active_billing_id_" + userId, rawTgt);
        props.setProperty("pending_match_timestamp_" + userId, nowMsStr);

        var blist = fBills.map(function(b) { return `• [${b.store}] ${b.id} (${b.amount.toLocaleString("en")} บ.)`; }).join("\n");
        var waitCreditFlex = {
          type: "flex",
          altText: `📸 พร้อมรับรูปสลิปงวด ${rawTgt} (Time Out 3 นาที)`,
          fallbackText: `📸 [พร้อมรับรูปสลิปสำหรับงวดเครดิต: ${rawTgt}]\n⏱️ กรุณาส่งรูปสลิปภายใน 3 นาที`,
          contents: {
            type: "bubble",
            size: "mega",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#0288D1",
              paddingAll: "14px",
              contents: [
                { type: "text", text: `📸 รอรับสลิปงวด ${rawTgt} (Time Out 3 นาที)`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
              ]
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "xs",
              paddingAll: "14px",
              backgroundColor: "#FFFFFF",
              contents: [
                { type: "text", text: blist, size: "xs", color: "#111111", wrap: true },
                { type: "text", text: `💰 ยอดรวม: ${tAmt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
                { type: "text", text: "⏱️ กรุณาส่งรูปสลิปภายใน 3 นาที (เกินเวลาตัดอัตโนมัติ)", size: "xxs", color: "#E65100", wrap: true },
                { type: "separator", margin: "sm", color: "#E0E0E0" },
                UI_MakeFlexBoxBtn("❌ ยกเลิกการรอรับสลิป", "match CANCEL", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
              ]
            }
          }
        };
        MSG_SendReply(platform, tokenOrChat, [waitCreditFlex], UI_GetAdminHomeQr());
        return;
      }
    }
  }

  var validIds = rawTgt.split(/[,+\s]+/).map(function(s) { return s.replace("#", "").trim(); }).filter(Boolean);
  if (validIds.length > 0) {
    var allTxList = DB_GetTransactions(), fBillsDirect = [], tAmtDirect = 0;
    for (var k = 0; k < validIds.length; k++) {
      var matchedTx = DB_FindTxByBillNo(validIds[k], allTxList);
      if (matchedTx) {
        var cleanDisp = matchedTx.orderId.indexOf("#") === 0 ? matchedTx.orderId : "#" + matchedTx.orderId;
        fBillsDirect.push({ id: cleanDisp, amount: matchedTx.total, store: matchedTx.store, rowIdx: matchedTx.rowIdx });
        tAmtDirect += matchedTx.total;
      }
    }
    if (fBillsDirect.length > 0) {
      if (recentSlipUrl) {
        FIN_ApplySlipUrlToBills(platform, tokenOrChat, fBillsDirect, recentSlipUrl, "", userId, roomId);
        return;
      }

      var directIdStr = fBillsDirect.map(function(b) { return "ROW-" + b.rowIdx; }).join(",");
      var nowTimeMs = String(new Date().getTime());
      props.setProperty("pending_match_order_ids_" + userId, directIdStr);
      if (roomId) props.setProperty("pending_match_order_ids_" + roomId, directIdStr);
      props.setProperty("pending_match_timestamp_" + userId, nowTimeMs);

      var blistD = fBillsDirect.map(function(b) { return `• [${b.store}] บิล ${b.id} (แถว ${b.rowIdx} : ${b.amount.toLocaleString("en")} บ.)`; }).join("\n");
      var firstRowKey = "ROW-" + fBillsDirect[0].rowIdx;

      var waitSlipFlex = {
        type: "flex",
        altText: "📸 พร้อมรับรูปสลิปโอนเงิน (Time Out 3 นาที)",
        fallbackText: `📸 [พร้อมรับรูปสลิปโอนเงิน]\n${blistD}\n💰 ยอดรวม: ${tAmtDirect.toLocaleString("en")} บาท\n⏱️ กรุณาส่งรูปสลิปภายใน 3 นาที`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0288D1",
            paddingAll: "14px",
            contents: [
              { type: "text", text: "📸 พร้อมรับรูปสลิป (Time Out 3 นาที)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: "14px",
            backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: blistD, size: "xs", weight: "bold", color: "#111111", wrap: true },
              { type: "text", text: `💰 ยอดรวม: ${tAmtDirect.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
              { type: "text", text: "⏱️ ส่งรูปสลิปโอนเงินภายใน 3 นาที (เกินเวลาตัดอัตโนมัติเพื่อไม่ให้ชนกับการคุยเรื่องอื่นครับ)", size: "xxs", color: "#E65100", wrap: true },
              { type: "separator", margin: "sm", color: "#E0E0E0" },
              UI_MakeFlexBoxBtn("✅ ชำระแล้ว (ไม่ใช้รูปสลิป)", `setstatus_${firstRowKey}_ชำระแล้ว`, "#111111", "#FFFFFF", "xs"),
              UI_MakeFlexBoxBtn("❌ ยกเลิกการรอรับสลิป", "match CANCEL", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
            ]
          }
        }
      };

      MSG_SendReply(platform, tokenOrChat, [waitSlipFlex], UI_GetAdminHomeQr());
      return;
    }
  }
  MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบรหัสบิล]\nไม่พบรหัสบิล "${rawTgt}" ในระบบครับ` }], UI_GetAdminHomeQr());
}

/**
 * [STRICT PHOTO GUARD FOR ALL ROOMS]:
 * 1. ห้อง STAFF (ทีมรับออเดอร์): ห้ามรับรูปอัตโนมัติเด็ดขาด! รับเฉพาะตอนที่กด Flex ขั้นตอนส่งงานเท่านั้น (ไม่มีการเข้าโหมด Match สลิป)
 * 2. ห้อง UNBOUND (ยังไม่ผูกโค้ด): บอทเงียบสนิท 100%
 */
function FIN_HandleLineSlipImage(messageId, userId, arg3, arg4) {
  let groupId = arg4 ? arg3 : null;
  let replyToken = arg4 ? arg4 : arg3;
  let roomId = groupId || userId;
  let lineToken = getConfigLineToken();
  if (!lineToken) return;

  let props = PropertiesService.getScriptProperties();
  let cache = CacheService.getScriptCache();

  let matchTsStr = props.getProperty("pending_match_timestamp_" + userId);
  if (matchTsStr && ((new Date().getTime() - parseInt(matchTsStr, 10)) > 180000)) {
    FIN_ClearManualMatchSession(props, cache, userId, roomId);
  }

  let roomInfo = DB_GetRoomRole(roomId);
  let hasActiveStaffFlow = (typeof Staff_GetFlowState === "function") ? Boolean(Staff_GetFlowState(userId, roomId)) : false;

  // 🔒 1. ห้องทีมรับออเดอร์ (STAFF): ห้ามรับรูปอัตโนมัติ และปิดฟังก์ชัน Match สลิปในห้องนี้ 100%!
  // จะรับรูปได้เฉพาะตอนที่ลูกน้องกดผ่าน Flex Message ขั้นตอนส่งงานเท่านั้น
  if (roomInfo.role === "STAFF") {
    if (!hasActiveStaffFlow) return;

    let imgRespStaff = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", {
      method: "get", headers: { "Authorization": "Bearer " + lineToken }, muteHttpExceptions: true
    });
    if (imgRespStaff.getResponseCode() !== 200) return;

    let blobStaff = imgRespStaff.getBlob().setName("StaffImg_" + messageId + ".jpg");
    Staff_HandleIncomingPhoto("LINE", userId, roomId, replyToken, blobStaff);
    return;
  }

  // 🔒 2. ห้องที่ยังไม่ได้ผูกโค้ดใดๆ (UNBOUND): บอทเงียบสนิท 100%
  if (roomInfo.role === "UNBOUND") {
    return;
  }

  let imgResp = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", {
    method: "get", headers: { "Authorization": "Bearer " + lineToken }, muteHttpExceptions: true
  });
  if (imgResp.getResponseCode() !== 200) return;

  let blob = imgResp.getBlob().setName("Img_" + messageId + ".jpg");

  if (hasActiveStaffFlow && typeof Staff_HandleIncomingPhoto === "function") {
    let handledByStaffFlow = Staff_HandleIncomingPhoto("LINE", userId, roomId, replyToken, blob);
    if (handledByStaffFlow) return;
  }

  let ss = DB_GetSpreadsheet();
  processAndMatchSlip(blob, getTargetSheet(ss), getColumnIndexes(), props, userId, groupId, replyToken, "LINE", null);
}

function FIN_HandleTelegramSlipPhoto(photos, userId, chatId) {
  let fileId = photos[photos.length - 1].file_id;
  let metaResp = UrlFetchApp.fetch("https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/getFile?file_id=" + fileId, { method: "get", muteHttpExceptions: true });
  if (metaResp.getResponseCode() === 200) {
    let metaJson = JSON.parse(metaResp.getContentText());
    if (metaJson.ok && metaJson.result && metaJson.result.file_path) {
      let imgResp = UrlFetchApp.fetch("https://api.telegram.org/file/bot" + CONFIG.TELEGRAM_TOKEN + "/" + metaJson.result.file_path, { method: "get", muteHttpExceptions: true });
      if (imgResp.getResponseCode() === 200) {
        let blob = imgResp.getBlob().setName("TG_TransferSlip_" + fileId + ".jpg");
        let ss = DB_GetSpreadsheet();
        processAndMatchSlip(blob, getTargetSheet(ss), getColumnIndexes(), PropertiesService.getScriptProperties(), userId, null, null, "TELEGRAM", chatId);
      }
    }
  }
}

/**
 * [CUSTOMER SLIP CONFIRMATION HANDLER (ANTI-UNSEND)]:
 * เมื่อลูกค้ากดปุ่ม "✅ ยืนยันส่งสลิปโอนเงินนี้" ในห้องร้านค้า จึงจะทำการบันทึกสลิปลงคอลัมน์ X และตัดยอดบิล
 * หากลูกค้าส่งผิดแล้วกด Unsend หรือกด "❌ ยกเลิก" ระบบจะลบไฟล์สลิปทิ้งทันที ไม่เกิดการดูดสลิปผิดพลาด!
 */
function FIN_HandleCustomerSlipConfirmAction(platform, tokenOrChat, userText, storeObj, roomId) {
  let cache = CacheService.getScriptCache();
  let cacheKey = "CUST_PENDING_SLIP_" + storeObj.storeId;
  let rawPending = cache.get(cacheKey);

  if (userText.toLowerCase().startsWith("cancel_cust_slip_")) {
    cache.remove(cacheKey);
    if (rawPending) {
      try {
        let pObj = JSON.parse(rawPending);
        if (pObj.fileId) DriveApp.getFileById(pObj.fileId).setTrashed(true);
      } catch (e) {}
    }
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "✅ [ยกเลิกรูปสลิปเรียบร้อยค่ะ]\nยกเลิกการบันทึกสลิปใบนี้เรียบร้อยค่ะ"
    }], UI_GetStoreHomeQr());
    return;
  }

  if (!rawPending) {
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "⏱️ [หมดเวลายืนยันสลิป (เกิน 3 นาที)]\nกรุณาส่งรูปสลิปโอนเงินใหม่อีกครั้งค่ะ"
    }], UI_GetStoreHomeQr());
    return;
  }

  cache.remove(cacheKey);
  let pData = JSON.parse(rawPending);
  let cleanStoreName = DB_CleanStorePrefix(storeObj.storeName, storeObj.storeId);

  if (pData.isPrepaid) {
    DB_SavePrepaidStoreSlip(storeObj.storeId, pData.directUrl);
    let prepaidFlex = {
      type: "flex",
      altText: "✅ ขอบคุณค่ะ รับสลิปเรียบร้อย",
      fallbackText: `✅ ขอบคุณค่ะ รับสลิปเรียบร้อย\nร้าน: ${cleanStoreName}\nสถานะ: บันทึกสลิปไว้แล้วค่ะ`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ ขอบคุณค่ะ รับสลิปเรียบร้อย", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
            { type: "text", text: "📌 สถานะ: บันทึกสลิปไว้แล้ว (ตัดยอดอัตโนมัติเมื่อจัดส่งค่ะ)", size: "xs", weight: "bold", color: "#2E7D32", wrap: true }
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [prepaidFlex], UI_GetStoreHomeQr());
    sendTelegramPhoto(pData.directUrl, `📸 [สลิปโอนล่วงหน้ายืนยันแล้ว] ร้าน ${cleanStoreName}`);
    return;
  }

  let ss = DB_GetSpreadsheet();
  let sheet = getTargetSheet(ss);
  let idxMap = getColumnIndexes();
  let transferTimeStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  let billsToClear = pData.billsToClear || [];
  let batchTag = billsToClear.length > 1 ? ("INV-" + storeObj.storeId + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd")) : "";
  let clearedIds = [];
  let clearedSum = 0;

  for (let c = 0; c < billsToClear.length; c++) {
    let bTarget = billsToClear[c];
    if (bTarget.rowIdx) {
      if (batchTag) sheet.getRange(bTarget.rowIdx, idxMap.billingId + 1).setValue(batchTag);
      let safeId = String(bTarget.orderId || ("#" + (bTarget.rowIdx - 1)));
      if (!safeId.startsWith("#")) safeId = "#" + safeId;
      sheet.getRange(bTarget.rowIdx, idxMap.orderId + 1, 1, 4).setValues([[safeId, "ชำระแล้ว", pData.directUrl, transferTimeStr]]);
      clearedIds.push(safeId);
      clearedSum += bTarget.amount;
    }
  }
  DB_ClearTxCache();

  let conciseThankFlex = {
    type: "flex",
    altText: "✅ ขอบคุณค่ะ สถานะ: ชำระแล้ว",
    fallbackText: `✅ ขอบคุณค่ะ บันทึกสลิปเรียบร้อย\nร้าน: ${cleanStoreName}\nสถานะ: ชำระแล้วค่ะ (${clearedSum.toLocaleString("en")} บาท)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "✅ ขอบคุณค่ะ บันทึกสลิปเรียบร้อย", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          { type: "text", text: `🧾 บิล: ${clearedIds.join(", ")} (${clearedSum.toLocaleString("en")} บาท)`, size: "xs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "📌 สถานะ: ชำระแล้วค่ะ", size: "sm", weight: "bold", color: "#2E7D32", maxLines: 1 }
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [conciseThankFlex], UI_GetStoreHomeQr());
  sendTelegramPhoto(pData.directUrl, `✅ [ลูกค้ากดยืนยันสลิปแล้ว] ${cleanStoreName} ตัดบิล ${clearedIds.join(", ")} (${clearedSum.toLocaleString("en")} บ.) ลงช่อง X เรียบร้อย`);
}

function FIN_ApproveCustomerSlipFromAdmin(platform, tokenOrChat, userText, userId, roomId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var allTx = DB_GetTransactions();
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();
    var lowCmd = userText.toLowerCase();

    if (lowCmd.startsWith("bind_slip_") || lowCmd.startsWith("approve_slip_")) {
      var billNo = userText.replace(/^(?:bind_slip_|approve_slip_)/i, "").replace("#", "").trim().toUpperCase();
      var slipUrl = cache.get("slip_url_" + billNo) ||
                    (userId ? cache.get("UNMATCHED_SLIP_" + userId) : null) ||
                    (roomId ? cache.get("UNMATCHED_SLIP_" + roomId) : null) ||
                    cache.get("UNMATCHED_SLIP_GLOBAL") || "";

      if (!slipUrl) {
        MSG_SendReply(platform, tokenOrChat, [{
          type: "text",
          text: "⏱️ [หมดเวลาเชื่อมต่อรูปสลิป (Time Out 3 นาที)]\nรูปสลิปที่ส่งไว้ก่อนหน้านี้หมดเวลา 3 นาทีแล้วครับ กรุณากดปุ่ม '📲 จับคู่สลิป' บนบิลที่ต้องการ หรือส่งรูปสลิปใหม่อีกครั้งครับ"
        }], UI_GetAdminHomeQr());
        return;
      }

      var tx = DB_FindTxByBillNo(billNo, allTx);
      if (tx) {
        var dispOrderId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
        FIN_ApplySlipUrlToBills(platform, tokenOrChat, [{
          id: dispOrderId, store: tx.store, amount: tx.total, rowIdx: tx.rowIdx
        }], slipUrl, "", userId || "ADMIN", roomId);

        var stObj = DB_GetStoreById(tx.store);
        if (stObj && stObj.groupId && lowCmd.startsWith("approve_slip_")) {
          var gList = stObj.groupId.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
          if (gList.length > 0) {
            MSG_PushLine(gList[0], [{
              type: "text",
              text: `✅ [ขอบคุณค่ะ]\nบิล ${dispOrderId} สถานะ: ชำระแล้วค่ะ`
            }], UI_GetStoreHomeQr());
          }
        }
        return;
      }
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบบิล]\nไม่พบบิล #${billNo} ในระบบครับ` }], UI_GetAdminHomeQr());
      return;
    }

    if (lowCmd.startsWith("approve_store_") || lowCmd.startsWith("bind_store_")) {
      var storeId = userText.replace(/^(?:approve_store_|bind_store_)/i, "").trim().toUpperCase();
      var stTarget = DB_GetStoreById(storeId);
      if (!stTarget) return;

      var storeSlipUrl = cache.get("slip_store_" + stTarget.storeId) ||
                         (userId ? cache.get("UNMATCHED_SLIP_" + userId) : null) ||
                         (roomId ? cache.get("UNMATCHED_SLIP_" + roomId) : null) ||
                         cache.get("UNMATCHED_SLIP_GLOBAL") || "";

      if (!storeSlipUrl) {
        MSG_SendReply(platform, tokenOrChat, [{
          type: "text",
          text: "⏱️ [หมดเวลาเชื่อมต่อรูปสลิป (Time Out 3 นาที)]\nกรุณาส่งรูปสลิปใหม่อีกครั้งเพื่อตัดยอดครับ"
        }], UI_GetAdminHomeQr());
        return;
      }

      var debtDetails = DB_GetStoreDebtDetails(stTarget.storeName);
      var bills = (debtDetails.bills || []).map(function(b) {
        return { id: b.orderId, store: stTarget.storeName, amount: b.amount, rowIdx: b.rowIdx };
      });

      if (bills.length > 0) {
        var batchTag = "INV-" + stTarget.storeId + "-" + Utilities.formatDate(new Date(), "GMT+7", "MMdd");
        FIN_ApplySlipUrlToBills(platform, tokenOrChat, bills, storeSlipUrl, batchTag, userId || "ADMIN", roomId);

        if (stTarget.groupId) {
          var gListSt = stTarget.groupId.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
          if (gListSt.length > 0) {
            MSG_PushLine(gListSt[0], [{
              type: "text",
              text: `✅ [ขอบคุณค่ะ]\nยอดรวม ${debtDetails.pendingDebt.toLocaleString("en")} บาท สถานะ: ชำระแล้วค่ะ`
            }], UI_GetStoreHomeQr());
          }
        }
      }
      return;
    }
  } catch (e) {
    Logger.log("FIN_ApproveCustomerSlipFromAdmin Error: " + e.message);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function processAndMatchSlip(blob, sheet, idxMap, props, userId, groupId, replyToken, platform, chatId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var tokenOrChat = (platform === "LINE") ? replyToken : chatId;
    var roomId = groupId || userId;
    var cache = CacheService.getScriptCache();

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
    var directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

    // 1. กรณีแอดมินกดปุ่ม "📲 จับคู่สลิป" ไว้ภายใน 3 นาที แล้วส่งรูปเข้ามา
    if (pendingOrderIdsStr) {
      var allTxData = DB_GetTransactions();
      var targetIds = pendingOrderIdsStr.split(",");
      var matchedBills = [];

      for (var t = 0; t < targetIds.length; t++) {
        var found = DB_FindTxByBillNo(targetIds[t], allTxData);
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

    var ocrInfo = FIN_ExtractSlipInfoOCR(file.getId());
    var ocrAmounts = ocrInfo.amounts || [];

    // 2. กรณีส่งรูปในห้อง LINE ร้านค้าลูกค้า (STORE):
    // - ถ้ารูปไม่ใช่สลิป หรือยอดเงินในสลิปไม่ตรงกับบิลค้างของร้าน -> บอทเงียบสนิท (ไม่เด้งข้อความใดๆ)
    // - ถ้ายอดตรง -> ส่งการ์ดให้กดยืนยัน 1 คลิก (ป้องกันลูกค้าส่งผิดแล้วกด Unsend)
    var storeObj = groupId ? DB_GetStoreByGroupId(groupId) : null;
    if (storeObj) {
      if (!ocrInfo.isBankSlip) {
        try { file.setTrashed(true); } catch (e) {}
        return;
      }

      var cleanStoreName = DB_CleanStorePrefix(storeObj.storeName, storeObj.storeId);
      var debtDetails = DB_GetStoreDebtDetails(cleanStoreName);
      var unpaidBills = debtDetails.bills || [];

      if (unpaidBills.length === 0) {
        var pendingPrepaidObj = {
          isPrepaid: true,
          fileId: file.getId(),
          directUrl: directUrl
        };
        cache.put("CUST_PENDING_SLIP_" + storeObj.storeId, JSON.stringify(pendingPrepaidObj), 180);

        var askPrepaidFlex = {
          type: "flex",
          altText: "🧾 ยืนยันการส่งสลิปโอนเงินล่วงหน้า",
          fallbackText: "🧾 ตรวจพบรูปสลิปโอนเงิน กรุณากดยืนยันการส่งสลิปด้านล่างค่ะ",
          contents: {
            type: "bubble",
            size: "mega",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#1DA1DB",
              paddingAll: "13px",
              contents: [
                { type: "text", text: "🧾 ยืนยันการส่งสลิปโอนเงิน", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
              ]
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              paddingAll: "14px",
              backgroundColor: "#FFFFFF",
              contents: [
                { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
                { type: "text", text: "ต้องการบันทึกสลิปใบนี้สำหรับออเดอร์ถัดไปใช่ไหมคะ? (กรุณากดยืนยันภายใน 3 นาทีค่ะ)", size: "xs", color: "#333333", wrap: true },
                UI_MakeFlexBoxBtn("✅ ยืนยันส่งสลิปใบนี้", `confirm_cust_slip_${storeObj.storeId}`, "#1B873F", "#FFFFFF", "sm"),
                UI_MakeFlexBoxBtn("❌ ยกเลิก (ส่งผิด)", `cancel_cust_slip_${storeObj.storeId}`, "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
              ]
            }
          }
        };
        MSG_SendReply(platform, tokenOrChat, [askPrepaidFlex], UI_GetStoreHomeQr());
        return;
      }

      // ตรวจสอบว่ายอดเงินในสลิปตรงกับยอดรวมทั้งร้าน หรือตรงกับบิลใดบิลหนึ่งหรือไม่
      var billsToClear = [];
      var totalDebtRound = Math.round(debtDetails.pendingDebt);

      if (ocrAmounts.indexOf(totalDebtRound) !== -1) {
        billsToClear = unpaidBills;
      } else {
        for (var bIdx = 0; bIdx < unpaidBills.length; bIdx++) {
          if (ocrAmounts.indexOf(Math.round(unpaidBills[bIdx].amount)) !== -1) {
            billsToClear = [unpaidBills[bIdx]];
            break;
          }
        }
      }

      // 🔒 กฎเหล็ก: ถ้าในสลิปอ่านตัวเลขได้ แต่ตัวเลขไม่ตรงกับบิลค้างของร้านเลย -> บอทเงียบสนิทและลบรูปทิ้งทันที!
      if (billsToClear.length === 0) {
        try { file.setTrashed(true); } catch (e) {}
        return;
      }

      var matchSum = 0;
      var matchIds = [];
      for (var m = 0; m < billsToClear.length; m++) {
        matchSum += billsToClear[m].amount;
        matchIds.push(billsToClear[m].orderId);
      }

      var pendingConfirmData = {
        isPrepaid: false,
        fileId: file.getId(),
        directUrl: directUrl,
        billsToClear: billsToClear
      };
      cache.put("CUST_PENDING_SLIP_" + storeObj.storeId, JSON.stringify(pendingConfirmData), 180);

      var askConfirmFlex = {
        type: "flex",
        altText: `🧾 ยืนยันสลิปโอนเงินยอด ${matchSum.toLocaleString("en")} บาท`,
        fallbackText: `🧾 ตรวจพบสลิปยอด ${matchSum.toLocaleString("en")} บาท สำหรับบิล ${matchIds.join(", ")} กรุณากดยืนยันค่ะ`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#1DA1DB",
            paddingAll: "14px",
            contents: [
              { type: "text", text: "🧾 ยืนยันการส่งสลิปโอนเงิน", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "14px",
            backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
              { type: "text", text: `🔖 สำหรับบิล: ${matchIds.join(", ")}`, size: "xs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
              { type: "text", text: `💰 ยอดเงินตรงกัน: ${matchSum.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
              { type: "text", text: "กรุณาแตะปุ่มยืนยันด้านล่างเพื่อตัดยอดบิลค่ะ (หากส่งรูปผิด สามารถกดยกเลิกได้เลยค่ะ)", size: "xxs", color: "#555555", wrap: true },
              UI_MakeFlexBoxBtn("✅ ยืนยันส่งสลิปโอนเงินนี้", `confirm_cust_slip_${storeObj.storeId}`, "#1B873F", "#FFFFFF", "sm"),
              UI_MakeFlexBoxBtn("❌ ยกเลิก (ส่งผิด)", `cancel_cust_slip_${storeObj.storeId}`, "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
            ]
          }
        }
      };

      MSG_SendReply(platform, tokenOrChat, [askConfirmFlex], UI_GetStoreHomeQr());
      return;
    }

    // 3. กรณีส่งรูปในห้อง Admin เท่านั้น
    var roomInfoCheck = (platform === "LINE") ? DB_GetRoomRole(roomId) : { role: "ADMIN" };
    if (platform === "LINE" && roomInfoCheck.role !== "ADMIN" && groupId) {
      try { file.setTrashed(true); } catch (e) {}
      return;
    }

    if (!ocrInfo.isBankSlip) {
      try { file.setTrashed(true); } catch (e) {}
      return;
    }

    cache.put("UNMATCHED_SLIP_" + userId, directUrl, 180);
    if (roomId) cache.put("UNMATCHED_SLIP_" + roomId, directUrl, 180);
    cache.put("UNMATCHED_SLIP_GLOBAL", directUrl, 180);

    var storeTermMap = {};
    var allStoresList = DB_GetAllActiveStores();
    for (var s = 0; s < allStoresList.length; s++) {
      storeTermMap[allStoresList[s].storeName] = allStoresList[s].creditTerm || "";
    }

    var nowLimitMs = new Date().getTime() + 43200000;
    var allTx = DB_GetTransactions();
    var unpaidTransferBills = [];
    var storeBatchTotals = {};

    for (var i = allTx.length - 1; i >= 0; i--) {
      var tx = allTx[i];
      if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.sender === "สั่งผ่านบอท") continue;
      var rDate = parseSheetDate(tx.date);
      if (!rDate || rDate.getTime() > nowLimitMs) continue;

      var cTerm = storeTermMap[tx.store] || "";
      var isCreditStore = (cTerm === "15" || cTerm === "30");
      var minCutoff = isCreditStore ? CONFIG.CUTOFF_CREDIT : CONFIG.CUTOFF_PENDING;
      if (rDate < minCutoff) continue;

      if (tx.status.indexOf("ชำระแล้ว") === -1 && (tx.payMethod.indexOf("โอน") !== -1 || tx.payMethod.indexOf("ผสม") !== -1 || tx.payMethod.indexOf("เครดิต") !== -1)) {
        unpaidTransferBills.push(tx);
        if (!storeBatchTotals[tx.store]) storeBatchTotals[tx.store] = { total: 0, count: 0 };
        storeBatchTotals[tx.store].total += tx.total;
        storeBatchTotals[tx.store].count += 1;
      }
    }

    if (unpaidTransferBills.length === 0) {
      MSG_SendReply(platform, tokenOrChat, [{
        type: "text",
        text: `📸 [บันทึกรูปสลิปสำเร็จ]\nบันทึกรูปสลิปลงระบบแล้วครับ ปัจจุบันไม่มีบิลค้างโอนในรอบปัจจุบันครับ`
      }], UI_GetAdminHomeQr());
      return;
    }

    unpaidTransferBills.sort(function(a, b) {
      var aMatch = ocrAmounts.indexOf(Math.round(a.total)) !== -1 ? 1 : 0;
      var bMatch = ocrAmounts.indexOf(Math.round(b.total)) !== -1 ? 1 : 0;
      return bMatch - aMatch;
    });

    var pickerRows = [];
    if (ocrAmounts.length > 0) {
      pickerRows.push({
        type: "text",
        text: `🔍 ตรวจพบยอดเงินในสลิป: ${ocrAmounts.join(", ")} บาท (กรุณากดผูกภายใน 3 นาที)`,
        size: "xxs",
        weight: "bold",
        color: "#2E7D32",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      });
    } else {
      pickerRows.push({
        type: "text",
        text: "⏱️ แตะเลือกบิลด้านล่างภายใน 3 นาทีเพื่อผูกสลิปลงช่อง X:",
        size: "xxs",
        color: "#E65100",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      });
    }

    var stKeys = Object.keys(storeBatchTotals);
    for (var sIdx = 0; sIdx < Math.min(stKeys.length, 2); sIdx++) {
      var sName = stKeys[sIdx];
      var bInfo = storeBatchTotals[sName];
      if (bInfo.count > 1) {
        var stMeta = DB_GetStoreById(sName);
        if (stMeta && stMeta.storeId) {
          var isBatchOcr = (ocrAmounts.indexOf(Math.round(bInfo.total)) !== -1);
          var shortSt = sName.replace(/(\[ST-\d+\]\s*)+/gi, "");
          pickerRows.push(UI_MakeAppleRowBtn(
            `${isBatchOcr ? "🎯 " : "📦 "}รวบยอด ${shortSt} (${bInfo.count} บิล)`,
            `${bInfo.total.toLocaleString("en")} บ.`,
            `bind_store_${stMeta.storeId}`,
            isBatchOcr ? "#E8F5E9" : "#FFF8F0",
            isBatchOcr ? "#2E7D32" : "#FFCC80"
          ));
        }
      }
    }

    for (var p = 0; p < Math.min(unpaidTransferBills.length, 5); p++) {
      var bItem = unpaidTransferBills[p];
      var oId = bItem.orderId.indexOf("#") === 0 ? bItem.orderId : "#" + bItem.orderId;
      var rowKey = "ROW-" + bItem.rowIdx;
      var shortStore = bItem.store.replace(/(\[ST-\d+\]\s*)+/gi, "");
      var isSingleOcr = (ocrAmounts.indexOf(Math.round(bItem.total)) !== -1);

      pickerRows.push(UI_MakeAppleRowBtn(
        `${isSingleOcr ? "🎯 " : "✅ "}${oId} ${shortStore} (แถว ${bItem.rowIdx})`,
        `${bItem.total.toLocaleString("en")} บ.`,
        `bind_slip_${rowKey}`,
        isSingleOcr ? "#E8F5E9" : "#F0F8FC",
        isSingleOcr ? "#2E7D32" : "#1DA1DB"
      ));
    }

    pickerRows.push(UI_MakeFlexBoxBtn("❌ ยกเลิก / ไม่ผูกสลิปใบนี้", "match CANCEL", "#FFF3E0", "#B71C1C", "xs", "#FFCC80"));

    var pickerFlex = {
      type: "flex",
      altText: "📸 รับรูปสลิปแล้ว! แตะเลือกบิลภายใน 3 นาที",
      fallbackText: "📸 รับรูปสลิปโอนเงินแล้ว! กดปุ่มเลือกบิลภายใน 3 นาทีครับ:",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "📸 รับรูปสลิปโอนเงิน (Time Out 3 นาที)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "แตะเลือกบิลเดี่ยว หรือรวบยอดทั้งก้อนเพื่อบันทึกลงช่อง X", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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
  } catch (e) { Logger.log("processAndMatchSlip Error: " + e.message); }
  finally { lock.releaseLock(); }
}
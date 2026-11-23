// ============================================================================
// 🚀 File 17: 16_Patch_Overrides.gs (UNIFIED 4-COLOR CI + TRUE JPEG + ROOM LOCK)
// Version: 66.0 (True JPEG File Engine + Inline SVG Logo [No Address] + PromptPay QR)
// ============================================================================

var P16_CFG = {
  VERSION: "V66",
  PROMPTPAY_ID: "0850375760",
  PROMPTPAY_DISPLAY: "085-037-5760",
  BANK_NAME: "ธนาคารกรุงเทพ",
  BANK_ACC: "252-451-1777",
  ACC_OWNER: "นาย ภานุพงศ์ ดุมคำ",
  EPSON_EMAIL: "pgv75281djqp98@print.epsonconnect.com",
  STORE_TITLE: "กอ.แก๊ส เชียงใหม่",
  STORE_SLOGAN: "“แก๊สหมดนึกถึงเรา”",
  STORE_PHONE: "โทร: 084-196-5919, 085-037-5760",
  PDF_FOLDER_NAME: "Gas_Invoices_PDF"
};

var _P16_ACTIVE_ROOM_ID = "";
var _P16_NATIVE_NEW_BLOB = Utilities.newBlob;

// ============================================================================
// SECTION 1: ตรวจสอบประเภทห้องที่ผูกไว้ (STAFF / STORE / ADMIN)
// ============================================================================

function P16_DetectBoundRoomType_(roomId) {
  var rid = String(roomId || _P16_ACTIVE_ROOM_ID || _P13_ACTIVE_ROOM_ID || "").trim();
  if (!rid) return "UNKNOWN";

  try {
    if (typeof DB_GetStaffGroupId === "function") {
      var staffGid = String(DB_GetStaffGroupId() || "").trim();
      if (staffGid && rid === staffGid) return "STAFF";
    }
    var propStaff = PropertiesService.getScriptProperties().getProperty("STAFF_GROUP_ID");
    if (propStaff && rid === String(propStaff).trim()) return "STAFF";

    if (typeof DB_GetStoreByGroupId === "function") {
      var st = DB_GetStoreByGroupId(rid);
      if (st && st.storeId) return "STORE";
    }
  } catch (e) {}

  return "ADMIN_OR_OTHER";
}

// ============================================================================
// SECTION 2: โลโก้ถังแก๊สสีฟ้า (Inline SVG ไม่ทำให้ PDF พัง) + EMVCo PromptPay QR Code
// ============================================================================

function P16_GetLogoInlineSvg_() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 165" width="76" height="104" style="display:block;">' +
    '<path d="M34 14 H86 C90 14 92 17 92 21 V48 H28 V21 C28 17 30 14 34 14 Z" fill="#1DA1DB" stroke="#000000" stroke-width="5.5" stroke-linejoin="round"/>' +
    '<rect x="44" y="20" width="32" height="10" rx="3" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>' +
    '<rect x="54" y="30" width="12" height="16" fill="#F59E0B" stroke="#000000" stroke-width="4"/>' +
    '<circle cx="60" cy="36" r="6" fill="#1DA1DB" stroke="#000000" stroke-width="4"/>' +
    '<rect x="14" y="46" width="92" height="94" rx="26" fill="#1DA1DB" stroke="#000000" stroke-width="6"/>' +
    '<path d="M14 95 Q60 105 106 95" fill="none" stroke="#000000" stroke-width="5"/>' +
    '<path d="M25 60 V86" stroke="#7DD3FC" stroke-width="4.5" stroke-linecap="round"/>' +
    '<text x="60" y="83" font-family="Sarabun, Tahoma, sans-serif" font-size="25" font-weight="900" fill="#FFFFFF" text-anchor="middle">แก๊ส</text>' +
    '<text x="60" y="125" font-family="Arial, Tahoma, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">GAS</text>' +
    '<path d="M26 138 H94 L98 156 H22 Z" fill="#1DA1DB" stroke="#000000" stroke-width="5.5" stroke-linejoin="round"/>' +
    '<rect x="48" y="144" width="24" height="7" rx="3" fill="#FFFFFF" stroke="#000000" stroke-width="3.5"/>' +
  '</svg>';
}

function P16_CalcCRC16_(str) {
  var crc = 0xFFFF;
  for (var i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (var j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  var hex = (crc & 0xFFFF).toString(16).toUpperCase();
  while (hex.length < 4) hex = "0" + hex;
  return hex;
}

function P16_Tlv_(id, val) {
  var s = String(val);
  var len = s.length < 10 ? "0" + s.length : String(s.length);
  return id + len + s;
}

function P16_BuildPromptPayPayload_(amount) {
  var cleanPhone = P16_CFG.PROMPTPAY_ID.replace(/[^0-9]/g, "");
  var formattedPhone = "0066" + cleanPhone.substring(1);
  var merchantInfo = P16_Tlv_("00", "A000000677010111") + P16_Tlv_("01", formattedPhone);
  var amt = Number(amount || 0);
  var hasAmt = (!isNaN(amt) && amt > 0);

  var payload = P16_Tlv_("00", "01") +
                P16_Tlv_("01", hasAmt ? "12" : "11") +
                P16_Tlv_("29", merchantInfo) +
                P16_Tlv_("53", "764") +
                (hasAmt ? P16_Tlv_("54", amt.toFixed(2)) : "") +
                P16_Tlv_("58", "TH") +
                "6304";
  return payload + P16_CalcCRC16_(payload);
}

function P16_GetPromptPayBase64_(amount) {
  var amtKey = Number(amount || 0).toFixed(2);
  var cacheKey = "P16_QR_B64_" + amtKey;
  var cache = CacheService.getScriptCache();
  var cachedB64 = cache.get(cacheKey);
  if (cachedB64 && cachedB64.indexOf("data:image/") === 0) {
    return cachedB64;
  }

  var payload = P16_BuildPromptPayPayload_(amount);
  var enc = encodeURIComponent(payload);
  var urls = [
    "https://quickchart.io/qr?size=320&margin=2&ecLevel=M&text=" + enc,
    "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=4&data=" + enc,
    "https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=" + enc
  ];

  for (var i = 0; i < urls.length; i++) {
    try {
      var resp = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true });
      if (resp && resp.getResponseCode() === 200) {
        var bytes = resp.getContent();
        if (bytes && bytes.length > 100) {
          var b64 = "data:image/png;base64," + Utilities.base64Encode(bytes);
          try { cache.put(cacheKey, b64, 21600); } catch (eC) {}
          return b64;
        }
      }
    } catch (e) {}
  }
  return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
}

// ============================================================================
// SECTION 3: กฎคิวส่งแก๊ส & แม่แบบเอกสาร 4 สี + โลโก้ (ไม่มีที่อยู่ร้าน) + QR Code พร้อมเพย์
// ============================================================================

function P16_GetQueueAndDeliveryRule_(incrementQueue, orderIdOptional) {
  var cache = CacheService.getScriptCache();
  if (orderIdOptional) {
    var cachedRule = cache.get("P16_Q_ORD_" + orderIdOptional);
    if (cachedRule) {
      try { return JSON.parse(cachedRule); } catch (e) {}
    }
  }

  var now = new Date();
  var hr = parseInt(Utilities.formatDate(now, "GMT+7", "HH"), 10);
  var isTomorrow = (hr >= 14);

  var targetDate = isTomorrow ? new Date(now.getTime() + 86400000) : now;
  var dateKey = Utilities.formatDate(targetDate, "GMT+7", "yyyyMMdd");
  var props = PropertiesService.getScriptProperties();
  var propKey = "P16_QSEQ_" + dateKey;
  var seq = parseInt(props.getProperty(propKey) || "0", 10);

  if (incrementQueue) {
    seq += 1;
    try { props.setProperty(propKey, String(seq)); } catch (e) {}
  } else {
    seq = Math.max(1, seq + 1);
  }

  var qNum = 3 + seq;
  var dayLabel = isTomorrow ? "จัดส่งวันพรุ่งนี้" : "จัดส่งวันนี้";
  var fullText = dayLabel + " (คิวที่ " + qNum + ")";

  var ruleObj = {
    queueNumber: qNum,
    isTomorrow: isTomorrow,
    docDeliveryText: fullText,
    chatTitle: "🚚 รอบจัดส่ง: " + dayLabel + " • คิวที่ " + qNum
  };

  if (orderIdOptional) {
    try { cache.put("P16_Q_ORD_" + orderIdOptional, JSON.stringify(ruleObj), 3600); } catch (eC) {}
  }
  return ruleObj;
}

function P16_FormatCustomerLines_(storeInfo) {
  var st = (typeof storeInfo === "object" && storeInfo !== null)
    ? storeInfo
    : { storeName: String(storeInfo || "ลูกค้า") };

  var raw = (st.billingName && String(st.billingName).trim() !== "" && String(st.billingName).trim() !== "-")
    ? String(st.billingName).trim()
    : String(st.storeName || "ลูกค้า").trim();

  raw = raw
    .replace(/^ชื่อลูกค้า\s*\/?\s*นามออกบิล\s*:\s*/i, "")
    .replace(/(\[ST-\d+\]\s*)+/gi, function(m) {
      var match = m.match(/\[ST-\d+\]/i);
      return match ? match[0].toUpperCase() + " " : "";
    })
    .trim();

  var lines = raw.split(/\r?\n|\s*\|\s*/).map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length === 0) lines = ["ลูกค้าทั่วไป"];

  var html = '<div class="cust-name">' + lines[0] + '</div>';
  for (var i = 1; i < lines.length; i++) {
    html += '<div class="cust-detail">' + lines[i] + '</div>';
  }
  return html;
}

function P16_BuildCMYKReceiptHtml_(docTitle, docNo, storeInfo, itemsRowsHtml, totalAmt, subHeaderText, customTheadHtml, colspanCount, customDateStr) {
  var custHtml = P16_FormatCustomerLines_(storeInfo);
  var dateStr = customDateStr || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  var totalNum = Number(totalAmt || 0);
  var totalFmt = totalNum.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var qrSrc = P16_GetPromptPayBase64_(totalNum);
  var logoSvg = P16_GetLogoInlineSvg_();
  var badgeText = subHeaderText || "🚚 รอบจัดส่งตามคิวงาน";
  var footColspan = colspanCount || 4;

  var theadHtml = customTheadHtml || (
    '<tr>' +
      '<th style="width:10%;text-align:center;">ลำดับ</th>' +
      '<th style="text-align:left;">รายการสินค้า</th>' +
      '<th style="width:16%;text-align:center;">จำนวน</th>' +
      '<th style="width:18%;text-align:right;">ราคา/หน่วย</th>' +
      '<th style="width:22%;text-align:right;">จำนวนเงิน (บาท)</th>' +
    '</tr>'
  );

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><!-- P16_UNIFIED_CI_V66 -->' +
  '<style>' +
    '@page { size: A4; margin: 10mm; }' +
    'body { font-family: "Sarabun", "Tahoma", sans-serif; color: #000000; background: #FFFFFF; margin: 0; padding: 14px; font-size: 18px; line-height: 1.45; }' +
    '.header-table { width: 100%; border-collapse: collapse; border-bottom: 4px solid #0284C7; padding-bottom: 14px; margin-bottom: 16px; }' +
    '.logo-cell { width: 88px; vertical-align: middle; padding-right: 14px; }' +
    '.brand-cell { vertical-align: middle; }' +
    '.comp-title { font-size: 32px; font-weight: 900; color: #000000; letter-spacing: 0.3px; line-height: 1.15; }' +
    '.comp-slogan { font-size: 20px; font-weight: 900; color: #0284C7; margin-top: 4px; }' +
    '.comp-phone { font-size: 18px; font-weight: bold; color: #000000; margin-top: 4px; }' +
    '.doc-badge { background: #FEF3C7; border: 2.5px solid #B91C1C; border-radius: 10px; padding: 10px 16px; display: inline-block; text-align: right; }' +
    '.doc-title { font-size: 24px; font-weight: 900; color: #B91C1C; white-space: nowrap; }' +
    '.doc-meta { font-size: 16px; font-weight: bold; color: #000000; margin-top: 4px; white-space: nowrap; }' +
    '.cust-box { background: #F0F9FF; border: 2.5px solid #0284C7; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; }' +
    '.cust-name { font-size: 22px; font-weight: 900; color: #000000; }' +
    '.cust-detail { font-size: 17px; font-weight: bold; color: #000000; margin-top: 3px; }' +
    '.cust-sub { font-size: 18px; font-weight: 900; color: #B91C1C; margin-top: 6px; }' +
    'table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }' +
    'table.items th { background: #0284C7; color: #FFFFFF; border: 2px solid #000000; padding: 12px 10px; font-size: 18px; font-weight: 900; }' +
    'table.items td { border: 2px solid #000000; padding: 12px 10px; color: #000000; font-size: 18px; font-weight: bold; }' +
    '.total-row td { background: #FEF3C7; color: #B91C1C; font-size: 22px; font-weight: 900; border: 2px solid #000000; padding: 14px 10px; }' +
    '.qr-box { width: 100%; border: 2.5px solid #0284C7; border-radius: 12px; background: #FFFFFF; margin-bottom: 18px; border-collapse: collapse; }' +
    '.sign-table { width: 100%; margin-top: 22px; font-size: 17px; font-weight: bold; color: #000000; text-align: center; }' +
  '</style></head><body>' +

  '<table class="header-table">' +
    '<tr>' +
      '<td class="logo-cell">' + logoSvg + '</td>' +
      '<td class="brand-cell">' +
        '<div class="comp-title">' + P16_CFG.STORE_TITLE + '</div>' +
        '<div class="comp-slogan">' + P16_CFG.STORE_SLOGAN + '</div>' +
        '<div class="comp-phone">' + P16_CFG.STORE_PHONE + '</div>' +
      '</td>' +
      '<td style="vertical-align:middle;text-align:right;width:38%;">' +
        '<div class="doc-badge">' +
          '<div class="doc-title">' + docTitle + '</div>' +
          '<div class="doc-meta">เลขที่: ' + docNo + '</div>' +
          '<div class="doc-meta">วันที่: ' + dateStr + '</div>' +
        '</div>' +
      '</td>' +
    '</tr>' +
  '</table>' +

  '<div class="cust-box">' +
    custHtml +
    '<div class="cust-sub">' + badgeText + '</div>' +
  '</div>' +

  '<table class="items">' +
    '<thead>' + theadHtml + '</thead>' +
    '<tbody>' + itemsRowsHtml + '</tbody>' +
    '<tfoot>' +
      '<tr class="total-row">' +
        '<td colspan="' + footColspan + '" style="text-align:right;">ยอดเงินรวมสุทธิ (บาท)</td>' +
        '<td style="text-align:right;">' + totalFmt + '</td>' +
      '</tr>' +
    '</tfoot>' +
  '</table>' +

  '<table class="qr-box">' +
    '<tr>' +
      '<td style="width:190px;text-align:center;padding:12px;border-right:2px solid #0284C7;background:#F8FAFC;">' +
        '<div style="font-size:15px;font-weight:900;color:#0284C7;">THAI QR PROMPTPAY</div>' +
        '<img src="' + qrSrc + '" width="148" height="148" style="display:block;margin:6px auto;border:2px solid #000000;border-radius:8px;background:#FFFFFF;"/>' +
        '<div style="font-size:16px;font-weight:900;color:#B91C1C;">สแกนจ่าย ' + totalFmt + ' บ.</div>' +
      '</td>' +
      '<td style="padding:14px 20px;font-size:18px;line-height:1.8;font-weight:bold;vertical-align:middle;color:#000000;">' +
        '<div style="color:#0284C7;font-size:20px;font-weight:900;">💳 ช่องทางชำระเงินโอน / สแกน QR พร้อมเพย์</div>' +
        '<div>• ' + P16_CFG.BANK_NAME + ': <span style="color:#0284C7;font-size:21px;font-weight:900;">' + P16_CFG.BANK_ACC + '</span></div>' +
        '<div>• พร้อมเพย์ (PromptPay): <span style="color:#B91C1C;font-size:21px;font-weight:900;">' + P16_CFG.PROMPTPAY_DISPLAY + '</span></div>' +
        '<div>• ชื่อบัญชี: <span style="color:#000000;font-weight:900;">' + P16_CFG.ACC_OWNER + '</span> <span style="color:#15803D;font-size:16px;">(โอนแล้วส่งรูปสลิปในแชทได้เลยค่ะ)</span></div>' +
      '</td>' +
    '</tr>' +
  '</table>' +

  '<table class="sign-table">' +
    '<tr>' +
      '<td style="width:50%;">ลงชื่อ .................................................... ผู้รับสินค้า / ผู้รับวางบิล</td>' +
      '<td style="width:50%;">ลงชื่อ .................................................... ผู้จัดส่ง / ผู้รับเงิน</td>' +
    '</tr>' +
  '</table>' +
  '</body></html>';
}

// ============================================================================
// SECTION 4: แปลง HTML -> PDF + สร้างไฟล์ภาพ JPEG แท้ลงโฟลเดอร์ (LINE โชว์รูปขึ้น 100%)
// ============================================================================

function P16_GetSharedFolderFast_() {
  var cache = CacheService.getScriptCache();
  var cachedFolderId = cache.get("P16_SHARED_PDF_FOLDER_ID") || PropertiesService.getScriptProperties().getProperty("P15_INVOICE_FOLDER_ID");
  if (cachedFolderId) {
    try { return DriveApp.getFolderById(cachedFolderId); } catch (e) {}
  }
  var iter = DriveApp.getFoldersByName(P16_CFG.PDF_FOLDER_NAME);
  var folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(P16_CFG.PDF_FOLDER_NAME);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eS) {}
  var fid = folder.getId();
  try { cache.put("P16_SHARED_PDF_FOLDER_ID", fid, 21600); } catch (eC) {}
  try { PropertiesService.getScriptProperties().setProperty("P15_INVOICE_FOLDER_ID", fid); } catch (eP) {}
  return folder;
}

function P16_SaveHtmlToPdfAndJpeg_(htmlContent, filePrefix) {
  var cleanPrefix = String(filePrefix || "Doc").replace(/[^a-zA-Z0-9_\-]/g, "");
  var pdfBlob = _P16_NATIVE_NEW_BLOB.call(Utilities, htmlContent, MimeType.HTML).setName(cleanPrefix + ".pdf").getAs(MimeType.PDF);
  var folder = P16_GetSharedFolderFast_();
  var pdfFile = folder.createFile(pdfBlob);
  var pdfFileId = pdfFile.getId();
  var imgTargetFileId = pdfFileId;

  // 1. บังคับให้ Google Drive เรนเดอร์ Thumbnail จาก PDF ทันที และสร้างไฟล์ภาพแท้ลงโฟลเดอร์
  try {
    var thumbBlob = pdfFile.getThumbnail();
    if (thumbBlob && thumbBlob.getBytes().length > 500) {
      var imgFile = folder.createFile(thumbBlob.setName(cleanPrefix + "_img.png"));
      imgTargetFileId = imgFile.getId();
    }
  } catch (eThumb) {}

  // 2. ถ้า getThumbnail() รอบแรกยังไม่ได้ ให้กระตุ้นผ่าน URL Thumbnail แล้วบันทึกเป็น .jpg แท้
  var thumbEndpoint = "https://drive.google.com/thumbnail?id=" + pdfFileId + "&sz=w1200";
  if (imgTargetFileId === pdfFileId) {
    try {
      var rT = UrlFetchApp.fetch(thumbEndpoint, { muteHttpExceptions: true, followRedirects: true });
      if (rT && rT.getResponseCode() === 200) {
        var cType = String((rT.getHeaders() || {})["Content-Type"] || "").toLowerCase();
        if (cType.indexOf("image/") !== -1 && rT.getContent().length > 1000) {
          var fetchedImgFile = folder.createFile(rT.getBlob().setName(cleanPrefix + "_img.jpg"));
          imgTargetFileId = fetchedImgFile.getId();
        }
      }
    } catch (eFetch) {}
  }

  var directLh3Url = "https://lh3.googleusercontent.com/d/" + imgTargetFileId + "=w1200";
  try {
    UrlFetchApp.fetch(directLh3Url, { muteHttpExceptions: true, followRedirects: true });
  } catch (eWarm) {}

  return {
    ok: true,
    fileId: pdfFileId,
    imgFileId: imgTargetFileId,
    pdfUrl: "https://drive.google.com/file/d/" + pdfFileId + "/view",
    imgUrl: directLh3Url,
    imageUrl: directLh3Url,
    jpegUrl: directLh3Url,
    pdfBlob: pdfBlob
  };
}

function ORD_CreateOrderTaxInvoiceA4(orderId, storeInfo, cart, totalAmt, scheduleLabelOptional) {
  try {
    var st = storeInfo || { storeName: "ลูกค้า", price15: 490, price48: 1530, priceCan: 790 };
    var c = cart || { g15: 0, g48: 0, can: 0 };
    var p15 = Number(st.price15 || 490);
    var p48 = Number(st.price48 || 1530);
    var pCan = Number(st.priceCan || 790);
    var total = Number(totalAmt || ((c.g15 || 0) * p15 + (c.g48 || 0) * p48 + (c.can || 0) * pCan));

    var qRule = P16_GetQueueAndDeliveryRule_(false, String(orderId || ""));
    var delivLabel = scheduleLabelOptional || qRule.docDeliveryText;

    var seq = 1, rowsHtml = "";
    if (c.g15 > 0) {
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สหุงต้ม ขนาด 15 กก.</td><td style="text-align:center;">' + c.g15 + ' ถัง</td><td style="text-align:right;">' + p15.toLocaleString("en") + '</td><td style="text-align:right;">' + (c.g15 * p15).toLocaleString("en") + '</td></tr>';
    }
    if (c.g48 > 0) {
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สหุงต้ม ขนาด 48 กก.</td><td style="text-align:center;">' + c.g48 + ' ถัง</td><td style="text-align:right;">' + p48.toLocaleString("en") + '</td><td style="text-align:right;">' + (c.g48 * p48).toLocaleString("en") + '</td></tr>';
    }
    if (c.can > 0) {
      var uCan = (c.g15 === 0 && c.g48 === 0 && c.can > 0) ? Math.round(total / c.can) : pCan;
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สกระป๋อง</td><td style="text-align:center;">' + c.can + ' ลัง</td><td style="text-align:right;">' + uCan.toLocaleString("en") + '</td><td style="text-align:right;">' + (c.can * uCan).toLocaleString("en") + '</td></tr>';
    }

    var subTxt = "🚚 รอบจัดส่ง: " + delivLabel;
    var pdfHtml = P16_BuildCMYKReceiptHtml_("ใบส่งของ / ใบเสร็จรับเงิน", orderId, st, rowsHtml, total, subTxt, null, 4);
    var res = P16_SaveHtmlToPdfAndJpeg_(pdfHtml, "Receipt_" + String(orderId).replace("#", ""));

    try {
      MailApp.sendEmail({
        to: P16_CFG.EPSON_EMAIL,
        subject: "",
        body: "",
        attachments: [res.pdfBlob]
      });
    } catch (ePrint) {}

    return res;
  } catch (e) {
    Logger.log("ORD_CreateOrderTaxInvoiceA4 Error: " + e);
    return { ok: false, pdfUrl: "", imgUrl: "", imageUrl: "", jpegUrl: "" };
  }
}
var ORD_GenerateDeliveryReceiptA4 = ORD_CreateOrderTaxInvoiceA4;

function Staff_ReplyQueueReceiptJpeg(platform, tokenOrChat, queueOrderId) {
  try {
    var targetId = String(queueOrderId || "").trim().toUpperCase();
    if (targetId.indexOf("#") !== 0) targetId = "#" + targetId;

    var qItem = DB_GetQueueOrderById(targetId);
    if (!qItem) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "⚠️ [ไม่พบคิวงาน]\nคิว " + targetId + " ถูกจัดส่งแล้วหรือไม่มีในระบบครับ" }], UI_GetStaffHomeQr());
      return;
    }

    var stInfo = DB_GetStoreById(qItem.store) || { storeName: qItem.store, billingName: qItem.store, price15: 490, price48: 1530, priceCan: 790 };
    var cache = CacheService.getScriptCache();
    var cacheKey = "P16_Q_JPG_" + P16_CFG.VERSION + "_" + targetId + "_" + String(stInfo.billingName || "").length;
    var cachedImg = cache.get(cacheKey);

    if (!cachedImg) {
      var doc = ORD_CreateOrderTaxInvoiceA4(targetId, stInfo, { g15: qItem.g15, g48: qItem.g48, can: qItem.cans }, qItem.total);
      cachedImg = doc.imgUrl;
      if (cachedImg) cache.put(cacheKey, cachedImg, 21600);
    }

    if (cachedImg) {
      var mapUri = (typeof DB_GetStoreGoogleMapUri === "function") ? DB_GetStoreGoogleMapUri(stInfo) : "https://www.google.com/maps";
      var actCard = {
        type: "flex",
        altText: "🧾 ใบเสร็จคิว " + targetId,
        fallbackText: "🧾 ใบเสร็จคิว " + targetId,
        contents: {
          type: "bubble",
          size: "mega",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            paddingAll: "12px",
            backgroundColor: "#FFFFFF",
            contents: [
              UI_MakeFlexBoxBtn("✅ ส่งแก๊สสำเร็จ " + targetId + " (กดส่งงาน)", "ส่งสำเร็จ " + targetId, "#1B873F", "#FFFFFF", "sm"),
              {
                type: "box",
                layout: "horizontal",
                spacing: "xs",
                contents: [
                  UI_MakeFlexUriBtn("📍 นำทาง Map", mapUri, "#E8F5E9", "#1B5E20", "xs", "#A5D6A7"),
                  UI_MakeFlexBoxBtn("✏️ แก้ไขหัวบิล", "แก้ไขหัวบิล_" + (stInfo.storeId || qItem.store), "#F4F5F7", "#111111", "xs")
                ]
              }
            ]
          }
        }
      };
      MSG_SendReply(platform, tokenOrChat, [
        { type: "image", originalContentUrl: cachedImg, previewImageUrl: cachedImg },
        actCard
      ], UI_GetStaffHomeQr());
    }
  } catch (e) {
    Logger.log("Staff_ReplyQueueReceiptJpeg Error: " + e.message);
  }
}

function P15_GenerateRetroactiveReceiptA4_(billInfo, needPdfBlobForPrint) {
  try {
    if (!billInfo) return { ok: false, error: "ไม่พบข้อมูลบิล" };
    var cacheKey = "P16_RETRO_REC_" + P16_CFG.VERSION + "_" + billInfo.rowIdx + "_" + billInfo.total;
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();

    if (!needPdfBlobForPrint) {
      var cachedJson = cache.get(cacheKey) || props.getProperty(cacheKey);
      if (cachedJson) {
        try {
          var parsed = JSON.parse(cachedJson);
          if (parsed && parsed.ok && parsed.imgUrl) return parsed;
        } catch (eP) {}
      }
    }

    var st = billInfo.storeObj || { storeName: billInfo.storeName, billingName: billInfo.billingName || billInfo.storeName };
    var p15 = Number(billInfo.price15 || 490);
    var p48 = Number(billInfo.price48 || 1530);
    var pCan = Number(billInfo.priceCan || 790);
    var total = Number(billInfo.total || 0);

    var seq = 1, rowsHtml = "";
    if (billInfo.g15 > 0) {
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สหุงต้ม ขนาด 15 กก.</td><td style="text-align:center;">' + billInfo.g15 + ' ถัง</td><td style="text-align:right;">' + p15.toLocaleString("en") + '</td><td style="text-align:right;">' + (billInfo.g15 * p15).toLocaleString("en") + '</td></tr>';
    }
    if (billInfo.g48 > 0) {
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สหุงต้ม ขนาด 48 กก.</td><td style="text-align:center;">' + billInfo.g48 + ' ถัง</td><td style="text-align:right;">' + p48.toLocaleString("en") + '</td><td style="text-align:right;">' + (billInfo.g48 * p48).toLocaleString("en") + '</td></tr>';
    }
    if (billInfo.cans > 0) {
      var uCan = (billInfo.g15 === 0 && billInfo.g48 === 0 && billInfo.cans > 0) ? Math.round(total / billInfo.cans) : pCan;
      rowsHtml += '<tr><td style="text-align:center;">' + (seq++) + '</td><td>แก๊สกระป๋อง</td><td style="text-align:center;">' + billInfo.cans + ' ลัง</td><td style="text-align:right;">' + uCan.toLocaleString("en") + '</td><td style="text-align:right;">' + (billInfo.cans * uCan).toLocaleString("en") + '</td></tr>';
    }

    var subTxt = "💳 การชำระเงิน: " + (billInfo.payMethod || "-") + " | ผู้จัดส่ง: " + (billInfo.sender || "-");
    var html = P16_BuildCMYKReceiptHtml_("ใบส่งของ / ใบเสร็จรับเงิน", billInfo.orderId, st, rowsHtml, total, subTxt, null, 4, billInfo.dateStr);
    var saved = P16_SaveHtmlToPdfAndJpeg_(html, "Receipt_" + String(billInfo.orderId).replace("#", ""));

    var cachePayload = {
      ok: true,
      fileId: saved.fileId,
      imgUrl: saved.imgUrl,
      pdfUrl: saved.pdfUrl
    };
    var jsonStr = JSON.stringify(cachePayload);
    try { cache.put(cacheKey, jsonStr, 21600); } catch (e1) {}
    try { props.setProperty(cacheKey, jsonStr); } catch (e2) {}

    return {
      ok: true,
      fileId: saved.fileId,
      imgUrl: saved.imgUrl,
      pdfUrl: saved.pdfUrl,
      pdfBlob: saved.pdfBlob
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function createInvoicePDFWithImage(arg1, arg2, arg3, arg4) {
  try {
    var storeName = "ลูกค้า", bills = [], totalSum = 0, docTitle = "ใบแจ้งหนี้ / ใบวางบิล";
    if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
      storeName = arg1.billingName || arg1.storeName || arg1.title || "ลูกค้า";
      bills = arg1.bills || arg1.items || arg1.rows || [];
      totalSum = Number(arg1.totalAmount || arg1.total || arg1.sum || 0);
      if (arg1.docTitle) docTitle = arg1.docTitle;
    } else {
      storeName = String(arg1 || "ลูกค้า");
      bills = Array.isArray(arg2) ? arg2 : [];
      totalSum = Number(arg3 || 0);
      if (arg4 && String(arg4).indexOf("/") === -1) docTitle = String(arg4);
    }

    var stObj = { storeId: "-", storeName: storeName, billingName: storeName };
    if (typeof DB_GetAllActiveStores === "function") {
      var allSt = DB_GetAllActiveStores();
      for (var s = 0; s < allSt.length; s++) {
        if (allSt[s].storeName === storeName || storeName.indexOf(allSt[s].storeId) !== -1) {
          stObj = allSt[s];
          break;
        }
      }
    }

    var rowsHtml = "", calcSum = 0;
    for (var i = 0; i < bills.length; i++) {
      var b = bills[i];
      var bId = "-", bDate = "-", bDesc = "", bAmt = 0;
      if (Array.isArray(b)) {
        bDate = b[0] instanceof Date ? Utilities.formatDate(b[0], "GMT+7", "dd/MM/yyyy") : String(b[0] || "-").split(" ")[0];
        var g15 = Number(b[2] || 0), g48 = Number(b[3] || 0), can = Number(b[4] || 0);
        var parts = [];
        if (g15 > 0) parts.push("15กก.=" + g15);
        if (g48 > 0) parts.push("48กก.=" + g48);
        if (can > 0) parts.push("แก๊สกระป๋อง=" + can);
        bDesc = parts.join(", ") || "ค่าแก๊สหุงต้ม";
        bAmt = Number(String(b[8] || b[9] || 0).replace(/,/g, ""));
        bId = String(b[21] || ("#" + (i + 1)));
      } else if (typeof b === "object" && b !== null) {
        bId = b.orderId || b.billNo || b.id || ("#" + (i + 1));
        bDate = String(b.dateStr || b.date || "-").split(" ")[0];
        var dParts = [];
        if (Number(b.g15 || b.qty15 || 0) > 0) dParts.push("15กก.=" + (b.g15 || b.qty15));
        if (Number(b.g48 || b.qty48 || 0) > 0) dParts.push("48กก.=" + (b.g48 || b.qty48));
        if (Number(b.can || b.cans || b.qtyCan || 0) > 0) dParts.push("แก๊สกระป๋อง=" + (b.can || b.cans || b.qtyCan));
        bDesc = b.itemDesc || b.desc || b.itemsText || dParts.join(", ") || "ค่าแก๊สหุงต้ม";
        bAmt = Number(String(b.amount || b.amt || b.total || b.net || 0).replace(/,/g, ""));
      }
      calcSum += bAmt;
      rowsHtml += '<tr>' +
        '<td style="text-align:center;">' + (i + 1) + '</td>' +
        '<td>บิล ' + bId + ' (' + bDesc + ')</td>' +
        '<td style="text-align:center;">' + bDate + '</td>' +
        '<td style="text-align:right;">' + bAmt.toLocaleString("en") + '</td>' +
      '</tr>';
    }

    var finalTotal = totalSum > 0 ? totalSum : calcSum;
    if (!rowsHtml) {
      rowsHtml = '<tr><td style="text-align:center;">1</td><td>ยอดค้างชำระค่าแก๊สหุงต้มรวม</td><td style="text-align:center;">-</td><td style="text-align:right;">' + finalTotal.toLocaleString("en") + '</td></tr>';
    }

    var invThead = '<tr>' +
      '<th style="width:10%;text-align:center;">ลำดับ</th>' +
      '<th style="text-align:left;">เลขที่บิล / รายการแก๊ส</th>' +
      '<th style="width:20%;text-align:center;">วันที่จัดส่ง</th>' +
      '<th style="width:24%;text-align:right;">จำนวนเงิน (บาท)</th>' +
    '</tr>';

    var invNo = "INV-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmm");
    var subText = "📌 สรุปรายการบิลค้างชำระรวม " + (bills.length || 1) + " รายการ";
    var html = P16_BuildCMYKReceiptHtml_(docTitle, invNo, stObj, rowsHtml, finalTotal, subText, invThead, 3);
    var saved = P16_SaveHtmlToPdfAndJpeg_(html, invNo);
    saved.totalDebt = finalTotal;
    saved.billCount = bills.length || 1;
    saved.billsCount = bills.length || 1;
    saved.store = stObj;
    return saved;
  } catch (e) {
    Logger.log("createInvoicePDFWithImage Error: " + e);
    return { ok: false, pdfUrl: "", imgUrl: "", imageUrl: "", jpegUrl: "" };
  }
}

var PDF_CreateInvoiceA4 = createInvoicePDFWithImage;
var FIN_CreateInvoicePDF = createInvoicePDFWithImage;

function P16_MakePreCookKey_(storeId, totalDebt, billCount, latestOrderId) {
  return "PRECOOK_" + P16_CFG.VERSION + "_" + String(storeId || "ST") + "_" + Number(totalDebt || 0) + "_" + Number(billCount || 0) + "_" + String(latestOrderId || "0");
}

function P15_GetOrGenerateStoreInvoiceA4_(storeIdOrName, forceRefresh) {
  var st = (typeof DB_GetStoreById === "function") ? DB_GetStoreById(storeIdOrName) : null;
  if (!st && typeof DB_GetAllActiveStores === "function") {
    var all = DB_GetAllActiveStores();
    for (var i = 0; i < all.length; i++) {
      if (all[i].storeId === storeIdOrName || all[i].storeName === storeIdOrName || String(all[i].storeName).indexOf(String(storeIdOrName)) !== -1) {
        st = all[i];
        break;
      }
    }
  }
  if (!st) st = { storeId: String(storeIdOrName), storeName: String(storeIdOrName), billingName: String(storeIdOrName) };

  var dInfo = (typeof DB_GetStoreDebtDetails === "function") ? DB_GetStoreDebtDetails(st.storeName) : { pendingDebt: 0, bills: [] };
  var bills = dInfo.bills || [];
  var total = Number(dInfo.pendingDebt || 0);
  if (bills.length === 0 || total <= 0) {
    return { ok: false, error: "ไม่พบยอดค้างชำระของร้าน " + st.storeName, store: st, billsCount: 0, totalDebt: 0 };
  }

  var lastId = bills.length > 0 ? (bills[bills.length - 1].orderId || bills.length) : "0";
  var cKey = P16_MakePreCookKey_(st.storeId, total, bills.length, lastId);

  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();

  if (!forceRefresh) {
    var fastRaw = cache.get(cKey) || props.getProperty(cKey);
    if (fastRaw) {
      try {
        var parsed = JSON.parse(fastRaw);
        if (parsed && parsed.ok && parsed.imgUrl) {
          parsed.store = parsed.store || st;
          parsed.billsCount = parsed.billsCount || parsed.billCount || bills.length;
          cache.put(cKey, JSON.stringify(parsed), 21600);
          return parsed;
        }
      } catch (eP) {}
    }
  }

  var built = createInvoicePDFWithImage({
    storeName: st.storeName,
    billingName: st.billingName || st.storeName,
    bills: bills,
    total: total,
    docTitle: st.creditTerm ? ("ใบวางบิลเครดิต " + st.creditTerm + " วัน") : "ใบแจ้งหนี้ / ใบวางบิล"
  });

  if (built && built.ok) {
    var payloadObj = {
      ok: true,
      fileId: built.fileId,
      pdfUrl: built.pdfUrl,
      imgUrl: built.imgUrl,
      imageUrl: built.imgUrl,
      jpegUrl: built.imgUrl,
      totalDebt: total,
      billCount: bills.length,
      billsCount: bills.length,
      store: st
    };
    var jsonStr = JSON.stringify(payloadObj);
    try { cache.put(cKey, jsonStr, 21600); } catch (e1) {}
    try { props.setProperty(cKey, jsonStr); } catch (e2) {}
    return payloadObj;
  }
  return { ok: false, error: "ไม่สามารถสร้างไฟล์ใบแจ้งหนี้ได้", store: st, billsCount: 0, totalDebt: total };
}

function FIN_ReplyStoreInvoiceJpeg(platform, tokenOrChat, storeIdOrName) {
  var invRes = P15_GetOrGenerateStoreInvoiceA4_(storeIdOrName, false);
  var boundType = P16_DetectBoundRoomType_(_P16_ACTIVE_ROOM_ID);
  var qr = (boundType === "STORE") ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr();

  if (!invRes || !invRes.ok) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "ℹ️ " + ((invRes && invRes.error) ? invRes.error : "ไม่พบยอดค้างชำระ") }], qr);
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
  MSG_SendReply(platform, tokenOrChat, [
    invFlex,
    { type: "image", originalContentUrl: invRes.imgUrl, previewImageUrl: invRes.imgUrl }
  ], qr);
}

function P16_PurgeLegacyInvoiceCachesOnce_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty("P16_PURGED_VERSION") === P16_CFG.VERSION) return;
    var allProps = props.getProperties();
    for (var k in allProps) {
      if (Object.prototype.hasOwnProperty.call(allProps, k)) {
        if (k.indexOf("PRECOOK_") === 0 && k.indexOf("PRECOOK_" + P16_CFG.VERSION) !== 0) {
          props.deleteProperty(k);
        } else if (k.indexOf("INV_") === 0 || k.indexOf("STORE_INV_") === 0 || k.indexOf("DEBT_IMG_") === 0 || k.indexOf("cred_pdf_") === 0 || k.indexOf("P15_INV_DOC_") === 0 || k.indexOf("P15_REC_FILE_") === 0) {
          props.deleteProperty(k);
        }
      }
    }
    props.setProperty("P16_PURGED_VERSION", P16_CFG.VERSION);
  } catch (e) {}
}

function P16_PreCookAllPendingInvoicesBackground() {
  P16_PurgeLegacyInvoiceCachesOnce_();
  if (typeof DB_GetAllActiveStores !== "function") return { cooked: 0 };
  var allStores = DB_GetAllActiveStores();
  var cookedCount = 0;
  for (var i = 0; i < allStores.length; i++) {
    try {
      var st = allStores[i];
      var d = (typeof DB_GetStoreDebtDetails === "function") ? DB_GetStoreDebtDetails(st.storeName) : null;
      if (d && Number(d.pendingDebt || 0) > 0) {
        P15_GetOrGenerateStoreInvoiceA4_(st.storeId, true);
        cookedCount++;
      }
    } catch (e) {}
  }
  return { cooked: cookedCount };
}

// ============================================================================
// SECTION 5: ล็อกปุ่ม Quick Reply ประจำห้อง & บล็อก 1003 ในห้อง STAFF / STORE เด็ดขาด
// ============================================================================

function P16_FixLabel20Chars_(rawLabel) {
  var lbl = String(rawLabel || "").trim();
  if (!lbl) return "กดเลือก";
  if (lbl.indexOf("อัปเดตสถานะ") !== -1 && lbl.indexOf("สั่") !== -1) {
    return "🔄 อัปเดต / สั่งแก๊ส";
  }
  return lbl.substring(0, 20);
}

function P16_SanitizeFlexLabelsOnly_(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) P16_SanitizeFlexLabelsOnly_(node[i]);
    return;
  }
  if (node.action && typeof node.action === "object" && node.action.label) {
    node.action.label = P16_FixLabel20Chars_(node.action.label);
  }
  for (var k in node) {
    if (Object.prototype.hasOwnProperty.call(node, k) && typeof node[k] === "object") {
      P16_SanitizeFlexLabelsOnly_(node[k]);
    }
  }
}

function MSG_FormatLineBubbles(messagesArray, quickReplyItems) {
  var validMsgs = (messagesArray || []).filter(function(m) { return m !== null && m !== undefined; });
  var sliced = validMsgs.slice(0, 5);
  var boundType = P16_DetectBoundRoomType_(_P16_ACTIVE_ROOM_ID);

  return sliced.map(function(msg, index) {
    var obj = {};
    if (msg.type === "flex" && msg.contents) {
      P16_SanitizeFlexLabelsOnly_(msg.contents);
      obj.type = "flex";
      obj.altText = String(msg.altText || "กอ.แก๊ส เชียงใหม่").substring(0, 390);
      obj.contents = msg.contents;
    } else if (msg.type === "image" || msg.originalContentUrl) {
      obj.type = "image";
      obj.originalContentUrl = msg.originalContentUrl;
      obj.previewImageUrl = msg.previewImageUrl || msg.originalContentUrl;
    } else {
      obj.type = "text";
      obj.text = String(msg.text || "-").substring(0, 4900);
    }

    if (index === sliced.length - 1) {
      var rawQr = (quickReplyItems && quickReplyItems.length > 0)
        ? quickReplyItems
        : (msg.quickReply && msg.quickReply.items ? msg.quickReply.items : null);

      if (boundType === "STAFF") {
        obj.quickReply = {
          items: [{
            type: "action",
            action: { type: "message", label: "order ส่งแก๊สวันนี้", text: "order ส่งแก๊สวันนี้" }
          }]
        };
      } else if (boundType === "STORE") {
        obj.quickReply = {
          items: [{
            type: "action",
            action: { type: "message", label: "🔄 อัปเดต / สั่งแก๊ส", text: "update" }
          }]
        };
      } else if (rawQr && Array.isArray(rawQr) && rawQr.length > 0) {
        var cleanQr = [];
        for (var q = 0; q < rawQr.length && cleanQr.length < 13; q++) {
          var it = rawQr[q];
          if (!it || !it.action) continue;
          var actType = it.action.type || "message";
          var lbl = P16_FixLabel20Chars_(it.action.label || it.action.text || "เลือก");
          if (actType === "uri" && it.action.uri) {
            cleanQr.push({ type: "action", action: { type: "uri", label: lbl, uri: it.action.uri } });
          } else if (actType === "location") {
            cleanQr.push({ type: "action", action: { type: "location", label: lbl } });
          } else {
            cleanQr.push({
              type: "action",
              action: { type: "message", label: lbl, text: String(it.action.text || lbl).substring(0, 300) }
            });
          }
        }
        if (cleanQr.length > 0) {
          obj.quickReply = { items: cleanQr };
        }
      }
    }
    return obj;
  });
}

(function P16_InstallStrictRoomAndPrinterHooks_() {
  if (typeof doPost === "function" && !doPost._isP16V66Hooked) {
    var origDoPost = doPost;
    doPost = function(e) {
      try {
        if (e && e.postData && e.postData.contents) {
          var body = JSON.parse(e.postData.contents);
          if (body && body.events && body.events.length > 0) {
            var ev = body.events[0];
            var rid = (ev.source && (ev.source.groupId || ev.source.roomId || ev.source.userId))
              ? (ev.source.groupId || ev.source.roomId || ev.source.userId)
              : "";
            _P16_ACTIVE_ROOM_ID = rid;
            _P13_ACTIVE_ROOM_ID = rid;

            if (ev.type === "message" && ev.message && ev.message.type === "text") {
              var msgTxt = String(ev.message.text || "").trim().toLowerCase();
              var rType = P16_DetectBoundRoomType_(rid);
              if ((rType === "STAFF" || rType === "STORE") && (msgTxt === "1003" || msgTxt === "🎛️ เมนูหลัก")) {
                return ContentService.createTextOutput("OK");
              }
            }
          }
        }
      } catch (eHook) {}
      return origDoPost.apply(this, arguments);
    };
    doPost._isP16V66Hooked = true;
  }

  // ดักจับการส่งอีเมล Epson L3250 ให้ส่งเฉพาะไฟล์แนบ PDF ไม่พิมพ์หน้าแรกเกินมา
  if (typeof MailApp !== "undefined" && typeof MailApp.sendEmail === "function" && !MailApp.sendEmail._isP16V66) {
    var origMail = MailApp.sendEmail;
    MailApp.sendEmail = function(arg1) {
      try {
        if (arg1 && typeof arg1 === "object" && arg1.to && String(arg1.to).indexOf("epsonconnect.com") !== -1) {
          return origMail.call(MailApp, {
            to: arg1.to,
            subject: "",
            body: "",
            attachments: arg1.attachments || []
          });
        }
      } catch (eM) {}
      return origMail.apply(MailApp, arguments);
    };
    MailApp.sendEmail._isP16V66 = true;
  }
})();

function P16_RunInitialPreCookAndVerify() {
  var startMs = new Date().getTime();
  P16_PurgeLegacyInvoiceCachesOnce_();
  var folder = P16_GetSharedFolderFast_();
  if (typeof P15_WarmUpAllPrebuiltFlexAndInvoices === "function") {
    P15_WarmUpAllPrebuiltFlexAndInvoices();
  }
  var preCookRes = P16_PreCookAllPendingInvoicesBackground();
  var elapsedSec = ((new Date().getTime() - startMs) / 1000).toFixed(2);

  Logger.log("✅ [P16 V.66.0 DIRECT ENGINE VERIFIED]");
  Logger.log("📁 โฟลเดอร์เก็บใบเสร็จ/ใบทวงหนี้: " + folder.getName());
  Logger.log("🍳 Pre-Cook ใบทวงหนี้พร้อมโลโก้ + QR พร้อมเพย์ เสร็จแล้ว: " + preCookRes.cooked + " ร้านค้า");
  Logger.log("⏱️ ใช้เวลาทั้งหมด: " + elapsedSec + " วินาที");
  return "OK";
}
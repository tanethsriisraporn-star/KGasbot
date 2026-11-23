// ==========================================
// 🛠️ File: 07_QUO_Estimator_PDF.gs
// Version: 47.0 (Daily Sales Table JPEG, Cash Deposit Log Table JPEG & Corporate Tax Invoice)
// Prefix: QUO_ / PDF_
// หมวด 5: ENGINEERING, QUOTATION & TABLE JPEG REPORT ENGINE
// ==========================================

function calculateDistanceKm(destinationText) {
  try {
    var origin = getConfigValue("OFFICE_LOCATION", "8/4 ถนนพัฒนาช้างเผือก ตำบลช้างเผือก อ.เมืองเชียงใหม่ 50300");
    var cleanDest = destinationText.trim();
    if (!/^https?:\/\//i.test(cleanDest) && cleanDest.indexOf("เชียงใหม่") === -1) {
      cleanDest += " เชียงใหม่";
    }
    var directions = Maps.newDirectionFinder()
      .setOrigin(origin)
      .setDestination(cleanDest)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
    if (directions.routes && directions.routes.length > 0 && directions.routes[0].legs.length > 0) {
      return parseFloat((directions.routes[0].legs[0].distance.value / 1000).toFixed(1));
    }
  } catch (e) { Logger.log("Maps Error: " + e.message); }
  return null;
}

function QUO_FormatCustomerHeaderHtml(rawCustomerBlock) {
  var raw = String(rawCustomerBlock || "-").trim();
  var cycleMatch = raw.match(/\(([^)]+)\)$/);
  var cycleNote = "";
  if (cycleMatch && (cycleMatch[1].indexOf("256") !== -1 || cycleMatch[1].indexOf("รอบ") !== -1)) {
    cycleNote = cycleMatch[1];
    raw = raw.replace(/\s*\([^)]+\)$/, "").trim();
  }

  var lines = raw.split(/\r?\n|\|/).map(function(s) { return s.trim(); }).filter(Boolean);
  var titleLine = lines.length > 0 ? lines[0] : raw;
  var subLines = lines.slice(1);

  var html = `<div style="font-size:15.5px;font-weight:700;color:#111111;margin-bottom:3px;">ชื่อลูกค้า / นามออกบิล: ${titleLine}</div>`;
  if (subLines.length > 0) {
    html += `<div style="font-size:13px;color:#222222;line-height:1.45;margin-bottom:3px;">${subLines.join("<br>")}</div>`;
  }
  if (cycleNote) {
    html += `<div style="font-size:12.5px;font-weight:700;color:#0288D1;margin-top:2px;">📅 งวดวางบิล: ${cycleNote}</div>`;
  }
  return html;
}

/**
 * [DAILY SALES SUMMARY TABLE JPEG GENERATOR (สำหรับปุ่มในหน้า Today / Yesterday)]:
 * สร้างตารางสรุปยอดขายประจำวันครบทุกบิล (เลขบิล, เวลา, ชื่อร้าน, รายการแก๊ส, ยอดรวม, วิธีชำระ, น้ำมัน, ผู้ส่ง, สถานะ) เป็นรูปภาพ JPEG
 */
function PDF_CreateDailySalesTableJpeg(dateStr, summary) {
  try {
    var compName = getConfigValue("COMPANY_NAME", "กอ.แก๊ส เชียงใหม่");
    var bills = summary.dayBills || [];
    var rowsHtml = "";

    for (var i = 0; i < bills.length; i++) {
      var tx = bills[i];
      var dObj = parseSheetDate(tx.date);
      var tmStr = dObj ? Utilities.formatDate(dObj, "GMT+7", "HH:mm") : "-";
      var oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
      var items = [];
      if (tx.g15 > 0) items.push("15กก.(" + tx.g15 + ")");
      if (tx.g48 > 0) items.push("48กก.(" + tx.g48 + ")");
      if (tx.cans > 0) items.push("กระป๋อง(" + tx.cans + ")");

      var stColor = tx.status.indexOf("ชำระแล้ว") !== -1 ? "#2E7D32" : "#E65100";
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;">${i + 1}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;font-weight:700;">${oId}<div style="font-size:10px;color:#777;">แถว ${tx.rowIdx}</div></td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;">${tmStr}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;font-weight:700;">${tx.store}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;">${items.join(", ") || "-"}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;">${tx.payMethod}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:right;font-weight:700;">${tx.total.toLocaleString("en")}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:right;color:#B71C1C;">${tx.fuelCost > 0 ? "-" + tx.fuelCost.toLocaleString("en") : "-"}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;">${tx.sender}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px 6px;text-align:center;font-weight:700;color:${stColor};">${tx.status}</td>
      </tr>`;
    }

    var html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; color: #111111; padding: 28px; font-size: 12.5px; }
      .hdr { background:#111111; color:#FFFFFF; padding:14px 18px; border-radius:8px; margin-bottom:14px; }
      .kpi-box { width:100%; border-collapse:collapse; margin-bottom:14px; background:#F8FBFE; border:1px solid #CBE6F6; border-radius:8px; }
      .kpi-td { padding:10px 12px; font-size:13px; border-right:1px solid #E0E0E0; }
      table.grid { width:100%; border-collapse:collapse; border:1px solid #CCCCCC; }
      table.grid th { background:#1DA1DB; color:#FFFFFF; padding:9px 6px; font-size:12px; text-align:center; }
    </style></head><body>
      <div class="hdr">
        <div style="font-size:20px;font-weight:700;">📊 ตารางสรุปยอดขายประจำวัน (${compName})</div>
        <div style="font-size:13px;color:#1DA1DB;margin-top:2px;">ประจำวันที่: ${dateStr} • จำนวนจัดส่งรวม ${summary.orderCount} บิล (15กก.=${summary.t15} | 48กก.=${summary.t48} | กระป๋อง=${summary.tCan})</div>
      </div>

      <table class="kpi-box">
        <tr>
          <td class="kpi-td"><b>💰 ยอดขายรวม:</b> <span style="color:#1DA1DB;font-weight:700;font-size:15px;">${summary.totalSales.toLocaleString("en")} บ.</span></td>
          <td class="kpi-td"><b>💵 รับเงินสด:</b> ${summary.cashSales.toLocaleString("en")} บ.<br><b>⛽ หักน้ำมัน:</b> <span style="color:#B71C1C;">-${summary.fuelTotal.toLocaleString("en")} บ.</span></td>
          <td class="kpi-td"><b>📲 โอนชำระแล้ว:</b> ${summary.transferPaidSales.toLocaleString("en")} บ.<br><b>⏳ โอนรอสลิป:</b> <span style="color:#E65100;">${summary.transferPendingSales.toLocaleString("en")} บ.</span></td>
          <td class="kpi-td" style="border-right:none;"><b>🧾 เครดิต:</b> ${summary.creditSales.toLocaleString("en")} บ.<br><b>🏦 เงินสดสุทธิเข้าบริษัท:</b> <span style="color:#2E7D32;font-weight:700;">${summary.netCashReturn.toLocaleString("en")} บ.</span></td>
        </tr>
      </table>

      <table class="grid">
        <thead>
          <tr>
            <th style="width:5%;">#</th>
            <th style="width:11%;">เลขบิล</th>
            <th style="width:7%;">เวลา</th>
            <th style="width:24%;text-align:left;">ชื่อร้านค้า</th>
            <th style="width:16%;text-align:left;">รายการแก๊ส</th>
            <th style="width:8%;">วิธีชำระ</th>
            <th style="width:9%;text-align:right;">ยอดรวม</th>
            <th style="width:7%;text-align:right;">น้ำมัน</th>
            <th style="width:6%;">ผู้ส่ง</th>
            <th style="width:7%;">สถานะ</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;

    var blob = Utilities.newBlob(html, MimeType.HTML).setName("DailySales_" + dateStr.replace(/\//g, "-") + ".pdf").getAs(MimeType.PDF);
    var folder = DB_GetSharedFolder("Gas_Invoices_PDF");
    var file = folder.createFile(blob);
    return {
      pdfUrl: file.getUrl(),
      imgUrl: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1200"
    };
  } catch (e) {
    Logger.log("PDF_CreateDailySalesTableJpeg Error: " + e.message);
    return { pdfUrl: "", imgUrl: "" };
  }
}

/**
 * [CASH DEPOSIT LOG TABLE JPEG GENERATOR]:
 * สร้างตารางแจกแจงรายการบิลเก็บเงินสดย้อนหลัง (ตั้งแต่บิลอะไรถึงบิลอะไร) เป็นรูปภาพ JPEG
 */
function PDF_CreateCashDepositTableJpeg(calc, targetDriver) {
  try {
    var compName = getConfigValue("COMPANY_NAME", "กอ.แก๊ส เชียงใหม่");
    var isSingle = (targetDriver && targetDriver !== "ALL" && calc.driverMap[targetDriver]);
    var bills = isSingle ? calc.driverMap[targetDriver].bills : calc.allCashBills;
    var titleDriver = isSingle ? ("พนักงาน: " + targetDriver) : "รวมพนักงานทุกคน";

    var totalCash = isSingle ? calc.driverMap[targetDriver].cash : calc.totalCash;
    var totalFuel = isSingle ? calc.driverMap[targetDriver].fuel : calc.totalFuel;
    var netCash = isSingle ? calc.driverMap[targetDriver].net : calc.netCashToDeposit;
    var rangeStr = bills.length > 0 ? (`ตั้งแต่บิล ${bills[0].orderId} ถึง ${bills[bills.length - 1].orderId}`) : "-";

    var rowsHtml = "";
    for (var i = 0; i < bills.length; i++) {
      var b = bills[i];
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:center;">${i + 1}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:center;font-weight:700;">${b.orderId} (แถว ${b.rowIdx})</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:center;">${b.dateStr}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;font-weight:700;">${b.store}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:center;">${b.driver}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:right;">${b.cash.toLocaleString("en")}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:right;color:#B71C1C;">${b.fuel > 0 ? "-" + b.fuel.toLocaleString("en") : "-"}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:8px;text-align:right;font-weight:700;color:#1DA1DB;">${b.net.toLocaleString("en")}</td>
      </tr>`;
    }

    var html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; color: #111111; padding: 28px; font-size: 13px; }
      .hdr { background:#111111; color:#FFFFFF; padding:14px 18px; border-radius:8px; margin-bottom:14px; }
      table.grid { width:100%; border-collapse:collapse; border:1px solid #CCCCCC; }
      table.grid th { background:#1DA1DB; color:#FFFFFF; padding:9px 8px; text-align:center; }
      .tot td { background:#F8FBFE; border-top:2px solid #1DA1DB; padding:11px 8px; font-weight:700; }
    </style></head><body>
      <div class="hdr">
        <div style="font-size:20px;font-weight:700;">💵 ตารางรายการบิลเงินสดรอฝากธนาคาร (${compName})</div>
        <div style="font-size:13px;color:#1DA1DB;margin-top:3px;">${titleDriver} • ${rangeStr} (รวม ${bills.length} บิล)</div>
      </div>

      <table class="grid">
        <thead>
          <tr>
            <th style="width:6%;">#</th>
            <th style="width:16%;">เลขบิล</th>
            <th style="width:15%;">วัน-เวลา</th>
            <th style="width:27%;text-align:left;">ชื่อร้านค้า</th>
            <th style="width:9%;">ผู้ส่ง</th>
            <th style="width:9%;text-align:right;">รับเงินสด</th>
            <th style="width:9%;text-align:right;">หักน้ำมัน</th>
            <th style="width:9%;text-align:right;">เงินสดสุทธิ</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="tot">
            <td colspan="5" style="text-align:right;">รวมสุทธิ (${bills.length} บิล)</td>
            <td style="text-align:right;">${totalCash.toLocaleString("en")}</td>
            <td style="text-align:right;color:#B71C1C;">-${totalFuel.toLocaleString("en")}</td>
            <td style="text-align:right;color:#2E7D32;font-size:15px;">${netCash.toLocaleString("en")} บ.</td>
          </tr>
        </tfoot>
      </table>
    </body></html>`;

    var blob = Utilities.newBlob(html, MimeType.HTML).setName("CashDepositLog_" + targetDriver + ".pdf").getAs(MimeType.PDF);
    var folder = DB_GetSharedFolder("Gas_Invoices_PDF");
    var file = folder.createFile(blob);
    return {
      pdfUrl: file.getUrl(),
      imgUrl: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1200"
    };
  } catch (e) {
    Logger.log("PDF_CreateCashDepositTableJpeg Error: " + e.message);
    return { pdfUrl: "", imgUrl: "" };
  }
}

function createInvoicePDFWithImage(storeName, bills, totalAmt, dateStr, billingCycleLabel, billingId, bName, bAcc, bOwner) {
  try {
    var compName = getConfigValue("COMPANY_NAME", "กอ.แก๊ส เชียงใหม่");
    var compAddr = getConfigValue("OFFICE_LOCATION", "8/4 ถนนพัฒนาช้างเผือก ตำบลช้างเผือก อ.เมือง จ.เชียงใหม่ 50300");
    var customerHeaderHtml = QUO_FormatCustomerHeaderHtml(storeName);

    var rowsHtml = "";
    for (var i = 0; i < bills.length; i++) {
      var b = bills[i];
      var itemDesc = b.itemDesc || "-";
      var senderTxt = b.sender ? `<div style="font-size:11px;color:#666666;">ผู้ส่ง: ${b.sender}</div>` : "";
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px 8px;text-align:center;">${i + 1}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px 8px;text-align:center;font-weight:600;">${b.id}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px 8px;text-align:center;">${b.date}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px 8px;text-align:left;font-weight:600;color:#111111;">${itemDesc}${senderTxt}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px 8px;text-align:right;font-weight:700;">${b.amt.toLocaleString('en')}</td>
      </tr>`;
    }

    var html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; color: #111111; padding: 34px; font-size: 13.5px; line-height: 1.45; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-bottom: 3px solid #1DA1DB; padding-bottom: 12px; }
      .brand-name { font-size: 25px; font-weight: 700; color: #111111; margin: 0; }
      .brand-slogan { font-size: 14px; font-weight: 600; color: #1DA1DB; margin-top: 2px; }
      .brand-meta { font-size: 12px; color: #555555; margin-top: 3px; }
      .doc-box { background-color: #111111; color: #FFFFFF; padding: 11px 16px; border-radius: 8px; text-align: right; }
      .doc-title { font-size: 17px; font-weight: 700; color: #FFFFFF; }
      .doc-sub { font-size: 12px; color: #E8F6FC; margin-top: 3px; }
      .cust-table { width: 100%; border-collapse: collapse; background-color: #F8FBFE; border: 1px solid #CBE6F6; border-radius: 8px; margin-bottom: 16px; }
      .cust-td { padding: 12px 16px; }
      .items-table { width: 100%; border-collapse: collapse; margin-top: 6px; border: 1px solid #E0E0E0; }
      .items-table th { background-color: #1DA1DB; color: #FFFFFF; padding: 10px 8px; text-align: center; font-weight: 700; }
      .total-row td { background-color: #F8FBFE; border-top: 2px solid #1DA1DB; padding: 13px 8px; font-weight: 700; }
      .bank-box { margin-top: 16px; padding: 11px 15px; background-color: #F4F5F7; border-radius: 6px; font-size: 13px; }
    </style></head><body>
      <table class="header-table">
        <tr>
          <td style="vertical-align:top; width:62%;">
            <div class="brand-name">${compName}</div>
            <div class="brand-slogan">“แก๊สหมดนึกถึงเรา” • เปิดบริการทุกวัน 09.00–20.00 น.</div>
            <div class="brand-meta">${compAddr}</div>
            <div class="brand-meta">โทร: 084-1965919, 085-0375760 | Line Official: @kgas</div>
          </td>
          <td style="vertical-align:top; width:38%; text-align:right;">
            <div class="doc-box">
              <div class="doc-title">ใบวางบิล / ใบแจ้งหนี้</div>
              <div class="doc-sub">รหัสอ้างอิง: ${billingId} (${billingCycleLabel})</div>
              <div class="doc-sub">วันที่ออกเอกสาร: ${dateStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <table class="cust-table">
        <tr>
          <td class="cust-td">
            ${customerHeaderHtml}
            <div style="font-size:12.5px;color:#444444;margin-top:3px;"><b>จำนวนบิลรวม:</b> ${bills.length} รายการ</div>
          </td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:8%;">ลำดับ</th>
            <th style="width:18%;">เลขที่บิล</th>
            <th style="width:20%;">วัน-เวลาที่ส่ง</th>
            <th style="width:36%;text-align:left;">รายการแก๊สที่จัดส่ง</th>
            <th style="width:18%;text-align:right;">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4" style="text-align:right;font-size:15px;">ยอดรวมค้างชำระสุทธิ (บาท)</td>
            <td style="text-align:right;font-size:18px;color:#B71C1C;">${totalAmt.toLocaleString('en')}</td>
          </tr>
        </tfoot>
      </table>

      <div class="bank-box">
        <b>🏦 ช่องทางชำระเงินโอน:</b> ${bName} &nbsp;เลขที่บัญชี <b>${bAcc}</b> &nbsp;(ชื่อบัญชี: ${bOwner})<br>
        <span style="font-size:12px;color:#555555;">เมื่อโอนชำระแล้ว สามารถส่งรูปสลิปโอนเงินลงในห้องแชท LINE นี้เพื่อให้ระบบตัดยอดอัตโนมัติได้ทันทีครับ</span>
      </div>
    </body></html>`;

    var safeName = String(storeName).split(/\r?\n|\|/)[0].replace(/[^a-zA-Z0-9ก-๙_-]/g, "_").substring(0, 30);
    var blob = Utilities.newBlob(html, MimeType.HTML).setName("Invoice_" + billingId + "_" + safeName + ".pdf").getAs(MimeType.PDF);
    var folder = DB_GetSharedFolder("Gas_Invoices_PDF");
    var file = folder.createFile(blob);

    return {
      pdfUrl: file.getUrl(),
      imgUrl: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1200"
    };
  } catch (e) {
    Logger.log("createInvoicePDFWithImage Error: " + e.message);
    return { pdfUrl: "-", imgUrl: "" };
  }
}

function createQuotationPDFWithImage(qData) {
  try {
    var compName = getConfigValue("COMPANY_NAME", "กอ.แก๊ส เชียงใหม่");
    var compAddr = getConfigValue("OFFICE_LOCATION", "8/4 ถนนพัฒนาช้างเผือก ตำบลช้างเผือก อ.เมือง จ.เชียงใหม่ 50300");
    var bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
    var bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
    var bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");
    var rowsHtml = "";

    for (var i = 0; i < qData.items.length; i++) {
      var item = qData.items[i];
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px;text-align:center;">${i + 1}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px;">${item.desc}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px;text-align:center;">${item.qty}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px;text-align:right;">${item.unitPrice.toLocaleString('en')}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:10px;text-align:right;font-weight:bold;">${item.total.toLocaleString('en')}</td>
      </tr>`;
    }

    var html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; color: #111111; padding: 34px; font-size: 13.5px; line-height: 1.45; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-bottom: 3px solid #1DA1DB; padding-bottom: 12px; }
      .brand-name { font-size: 25px; font-weight: 700; color: #111111; margin: 0; }
      .brand-slogan { font-size: 14px; font-weight: 600; color: #1DA1DB; margin-top: 2px; }
      .brand-meta { font-size: 12px; color: #555555; margin-top: 3px; }
      .doc-box { background-color: #111111; color: #FFFFFF; padding: 11px 16px; border-radius: 8px; text-align: right; }
      .doc-title { font-size: 17px; font-weight: 700; color: #FFFFFF; }
      .doc-sub { font-size: 12px; color: #E8F6FC; margin-top: 3px; }
      .items-table { width: 100%; border-collapse: collapse; margin-top: 12px; border: 1px solid #E0E0E0; }
      .items-table th { background-color: #1DA1DB; color: #FFFFFF; padding: 10px; text-align: center; font-weight: 700; }
      .total-row td { background-color: #F8FBFE; border-top: 2px solid #1DA1DB; padding: 13px 10px; font-weight: 700; }
    </style></head><body>
      <table class="header-table">
        <tr>
          <td style="vertical-align:top; width:62%;">
            <div class="brand-name">${compName}</div>
            <div class="brand-slogan">“แก๊สหมดนึกถึงเรา” • บริการเดินท่อและติดตั้งระบบแก๊สมาตรฐาน</div>
            <div class="brand-meta">${compAddr}</div>
            <div class="brand-meta">โทร: 084-1965919, 085-0375760 | Line Official: @kgas</div>
          </td>
          <td style="vertical-align:top; width:38%; text-align:right;">
            <div class="doc-box">
              <div class="doc-title">ใบเสนอราคา (QUOTATION)</div>
              <div class="doc-sub">เลขที่: ${qData.quoteNo}</div>
              <div class="doc-sub">วันที่: ${qData.dateStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:10%;">ลำดับ</th>
            <th style="width:45%;text-align:left;">รายการ</th>
            <th style="width:15%;">จำนวน</th>
            <th style="width:15%;text-align:right;">ราคา/หน่วย</th>
            <th style="width:15%;text-align:right;">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4" style="text-align:right;font-size:15px;">ยอดประเมินรวมสุทธิ (บาท)</td>
            <td style="text-align:right;font-size:18px;color:#1DA1DB;">${qData.grandTotal.toLocaleString('en')}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:16px;padding:11px 15px;background:#F4F5F7;border-radius:6px;font-size:13px;">
        <b>🏦 ช่องทางชำระเงินโอน:</b> ${bName} เลขที่บัญชี <b>${bAcc}</b> (${bOwner})
      </div>
    </body></html>`;

    var blob = Utilities.newBlob(html, MimeType.HTML).setName("Quotation_" + qData.quoteNo + ".pdf").getAs(MimeType.PDF);
    var folder = DB_GetSharedFolder("Gas_Quotations_PDF");
    var file = folder.createFile(blob);
    return {
      pdfUrl: file.getUrl(),
      imgUrl: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1200"
    };
  } catch (e) { return { pdfUrl: "-", imgUrl: "" }; }
}

function QUO_StartEstimateWizard(platform, userId, tokenOrChat) {
  var props = PropertiesService.getScriptProperties();
  var wiz = { step: 1, pipeLen: 0, heads: 0, distanceKm: 0, hours: 0 };
  props.setProperty("estimate_wizard_" + userId, JSON.stringify(wiz));

  var step1Flex = {
    type: "flex",
    altText: "🛠️ ขั้นตอนที่ 1/4: ระบุความยาวท่อแก๊ส",
    fallbackText: "🛠️ [ประเมินราคาเดินท่อแก๊ส - ขั้นตอนที่ 1/4]\nต้องการเดินท่อแก๊สความยาวประมาณกี่เมตรครับ?",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🛠️ ประเมินราคาท่อแก๊ส (1/4)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "ต้องการเดินท่อแก๊สความยาวประมาณกี่เมตรครับ? (แตะเลือกหรือพิมพ์ตัวเลขได้เลย)", size: "xs", color: "#111111", wrap: true },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn("📏 5 เมตร", "5", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("📏 10 เมตร", "10", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("📏 15 เมตร", "15", "#F0F8FC", "#111111", "xs", "#CBE6F6")
            ]
          },
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step1Flex], UI_GetAdminHomeQr());
}

function QUO_HandleEstimateWizard(platform, userId, tokenOrChat, userText, wizardDataStr) {
  var props = PropertiesService.getScriptProperties();
  var wizKey = "estimate_wizard_" + userId;
  var wiz = JSON.parse(wizardDataStr);

  if (wiz.step === 1) {
    wiz.pipeLen = parseNum(userText);
    wiz.step = 2;
    props.setProperty(wizKey, JSON.stringify(wiz));

    var step2Flex = {
      type: "flex",
      altText: "🛠️ ขั้นตอนที่ 2/4: จำนวนจุดเตาแก๊ส",
      fallbackText: "🛠️ [ขั้นตอนที่ 2/4] มีจุดเชื่อมต่อหัวเตาแก๊สกี่จุดครับ?",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🛠️ ประเมินราคาท่อแก๊ส (2/4)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `✅ ความยาวท่อ: ${wiz.pipeLen} เมตร\nต้องการต่อจุดหัวเตาแก๊สกี่จุดครับ?`, size: "xs", color: "#111111", wrap: true },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                UI_MakeFlexBoxBtn("🔥 1 จุด", "1", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🔥 2 จุด", "2", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🔥 3 จุด", "3", "#F0F8FC", "#111111", "xs", "#CBE6F6")
              ]
            },
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [step2Flex], UI_GetAdminHomeQr());
    return;
  }

  if (wiz.step === 2) {
    wiz.heads = parseNum(userText);
    wiz.step = 3;
    props.setProperty(wizKey, JSON.stringify(wiz));

    var step3Flex = {
      type: "flex",
      altText: "🛠️ ขั้นตอนที่ 3/4: ระยะทางหน้างาน",
      fallbackText: "🛠️ [ขั้นตอนที่ 3/4] ระบุระยะทาง (กม.) หรือพิมพ์ชื่อสถานที่หน้างาน:",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🛠️ ประเมินราคาท่อแก๊ส (3/4)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `✅ หัวเตา: ${wiz.heads} จุด\nเลือกหรือพิมพ์ระยะทางไป-กลับ (กม.) หรือชื่อสถานที่หน้างาน:`, size: "xs", color: "#111111", wrap: true },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                UI_MakeFlexBoxBtn("🚗 5 กม.", "5", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🚗 10 กม.", "10", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🚗 20 กม.", "20", "#F0F8FC", "#111111", "xs", "#CBE6F6")
              ]
            },
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [step3Flex], UI_GetAdminHomeQr());
    return;
  }

  if (wiz.step === 3) {
    var dist = /^\d+(\.\d+)?$/.test(userText.trim()) ? parseFloat(userText.trim()) : calculateDistanceKm(userText);
    wiz.distanceKm = dist !== null ? dist : 10;
    wiz.step = 4;
    props.setProperty(wizKey, JSON.stringify(wiz));

    var step4Flex = {
      type: "flex",
      altText: "🛠️ ขั้นตอนที่ 4/4: จำนวนชั่วโมงทำงาน",
      fallbackText: "🛠️ [ขั้นตอนที่ 4/4] ประเมินเวลาทำงานกี่ชั่วโมงครับ?",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🛠️ ประเมินราคาท่อแก๊ส (4/4)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `📍 ระยะทาง: ${wiz.distanceKm} กม.\nประเมินเวลาติดตั้งกี่ชั่วโมงครับ? (ช่าง 2 คน):`, size: "xs", color: "#111111", wrap: true },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                UI_MakeFlexBoxBtn("⏱️ 2 ชม.", "2", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("⏱️ 4 ชม.", "4", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("⏱️ 6 ชม.", "6", "#F0F8FC", "#111111", "xs", "#CBE6F6")
              ]
            },
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [step4Flex], UI_GetAdminHomeQr());
    return;
  }

  if (wiz.step === 4) {
    wiz.hours = parseNum(userText) || 2;
    props.deleteProperty(wizKey);

    var pipeRate = 350;
    var headRate = 850;
    var testFee = parseNum(getConfigValue("SYSTEM_TEST_FEE", "300"));
    var laborRate = parseNum(getConfigValue("HOURLY_LABOR_RATE", "150"));
    var travelCost = Math.round(wiz.distanceKm * 15);

    var pipeTotal = wiz.pipeLen * pipeRate;
    var headTotal = wiz.heads * headRate;
    var laborTotal = wiz.hours * 2 * laborRate;
    var grandTotal = pipeTotal + headTotal + testFee + laborTotal + travelCost;

    var quoteNo = "QT-" + Utilities.formatDate(new Date(), "GMT+7", "yyMMdd-HHmm");
    var qData = {
      quoteNo: quoteNo,
      dateStr: Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy"),
      grandTotal: grandTotal,
      items: [
        { desc: "งานเดินท่อแก๊สสเตนเลส/ท่อดำมาตรฐาน", qty: wiz.pipeLen + " ม.", unitPrice: pipeRate, total: pipeTotal },
        { desc: "ชุดวาล์วและหัวปรับแรงดันจุดเตาแก๊ส", qty: wiz.heads + " จุด", unitPrice: headRate, total: headTotal },
        { desc: "ค่าแรงทีมช่างติดตั้ง (2 คน x " + wiz.hours + " ชม.)", qty: wiz.hours + " ชม.", unitPrice: laborRate * 2, total: laborTotal },
        { desc: "ค่าเดินทางและขนส่งอุปกรณ์ (" + wiz.distanceKm + " กม.)", qty: "1 งาน", unitPrice: travelCost, total: travelCost },
        { desc: "ค่าบริการทดสอบแรงดันและตรวจเช็ครั่วซึม", qty: "1 งาน", unitPrice: testFee, total: testFee }
      ]
    };
    props.setProperty("last_quotation_" + userId, JSON.stringify(qData));

    var summaryFlex = {
      type: "flex",
      altText: `📋 สรุปใบประเมินราคาเบื้องต้น ${grandTotal.toLocaleString("en")} บาท`,
      fallbackText: `📋 [สรุปใบประเมินราคาเบื้องต้น #${quoteNo}] ยอดรวมสุทธิ: ${grandTotal.toLocaleString("en")} บาท`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `📋 สรุปใบประเมินราคา (${quoteNo})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `1. งานเดินท่อ (${wiz.pipeLen} ม.) : ${pipeTotal.toLocaleString("en")} บ.`, size: "xs", color: "#222222", maxLines: 1 },
            { type: "text", text: `2. ชุดหัวเตา (${wiz.heads} จุด) : ${headTotal.toLocaleString("en")} บ.`, size: "xs", color: "#222222", maxLines: 1 },
            { type: "text", text: `3. ค่าแรงช่าง (2 คน x ${wiz.hours} ชม.) : ${laborTotal.toLocaleString("en")} บ.`, size: "xs", color: "#222222", maxLines: 1 },
            { type: "text", text: `4. ค่าเดินทาง (${wiz.distanceKm} กม.) : ${travelCost.toLocaleString("en")} บ.`, size: "xs", color: "#222222", maxLines: 1 },
            { type: "text", text: `5. ค่าทดสอบระบบปลอดภัย : ${testFee.toLocaleString("en")} บ.`, size: "xs", color: "#222222", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E0E0E0" },
            {
              type: "box",
              layout: "horizontal",
              margin: "xs",
              contents: [
                { type: "text", text: "💰 ยอดประเมินรวมสุทธิ", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
                { type: "text", text: `${grandTotal.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
              ]
            },
            { type: "separator", margin: "sm", color: "#E0E0E0" },
            UI_MakeFlexBoxBtn("📄 ออกใบเสนอราคา (รูปภาพ/PDF)", "pdf", "#111111", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("🔄 ประเมินราคาใหม่", "estimate", "#F0F8FC", "#111111", "xs", "#CBE6F6")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [summaryFlex], UI_GetAdminHomeQr());
  }
}

function QUO_GenerateQuotationPdf(platform, userId, tokenOrChat) {
  var props = PropertiesService.getScriptProperties();
  var qStr = props.getProperty("last_quotation_" + userId);
  if (!qStr) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ไม่พบข้อมูล]\nยังไม่มีข้อมูลการประเมินราคา กรุณากดประเมินราคาใหม่ก่อนครับ" }], UI_GetAdminHomeQr());
    return;
  }
  var qData = JSON.parse(qStr);
  var res = createQuotationPDFWithImage(qData);

  var linkFlex = {
    type: "flex",
    altText: `📄 ใบเสนอราคา #${qData.quoteNo}`,
    fallbackText: `📄 [ใบเสนอราคา #${qData.quoteNo}]\n🔗 ลิงก์ PDF: ${res.pdfUrl}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "13px",
        contents: [
          { type: "text", text: `📄 ใบเสนอราคา #${qData.quoteNo}`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `💰 ยอดสุทธิ: ${qData.grandTotal.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
          { type: "text", text: `🔗 ลิงก์ไฟล์ PDF: ${res.pdfUrl}`, size: "xxs", color: "#555555", wrap: true },
          UI_MakeFlexBoxBtn("🔄 ประเมินราคาใบใหม่", "estimate", "#F0F8FC", "#111111", "xs", "#CBE6F6")
        ]
      }
    }
  };

  var msgs = [linkFlex];
  if (res.imgUrl) msgs.push({ type: "image", originalContentUrl: res.imgUrl, previewImageUrl: res.imgUrl });

  MSG_SendReply(platform, tokenOrChat, msgs, UI_GetAdminHomeQr());
}
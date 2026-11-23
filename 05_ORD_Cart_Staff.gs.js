// ==========================================
// 🧺 File: 05_ORD_Cart_Staff.gs
// Version: 47.0 (Google Maps URI Navigation, Distinct Dark/Green Queue CI & Cash Bill-Range Log)
// Prefix: ORD_ / Staff_
// หมวด 3: OPERATIONS & ORDER TEAM DELIVERY
// ==========================================

function DB_CalculateStoreDebtAndCylinders(storeName) {
  let details = DB_GetStoreDebtDetails(storeName);
  return {
    pendingDebt: details.pendingDebt || 0,
    missingCylinders: details.missingCylinders || 0,
    bills: details.bills || []
  };
}

function DB_GetCachedStoreDebt(storeName) {
  if (!storeName) return 0;
  let details = DB_GetStoreDebtDetails(storeName);
  return details.pendingDebt || 0;
}

function ORD_FormatCustomerHeaderHtml(storeInfo, scheduleLabel) {
  let rawBilling = String(storeInfo.billingName || storeInfo.storeName || "-").trim();
  let cleanStoreCode = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId);
  let phoneStr = (storeInfo.phone && storeInfo.phone !== "-") ? String(storeInfo.phone).trim() : "";

  let lines = rawBilling.split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
  let mainTitle = lines.length > 0 ? lines[0] : cleanStoreCode;
  let detailLines = lines.slice(1);

  let html = `<div style="font-size:15px;font-weight:700;color:#111111;margin-bottom:3px;">ชื่อลูกค้า / นามออกบิล: ${mainTitle}</div>`;

  if (detailLines.length > 0) {
    html += `<div style="font-size:13px;color:#222222;line-height:1.45;margin-bottom:4px;">${detailLines.join("<br>")}</div>`;
  }

  let metaParts = [`<b>รหัสร้านค้า:</b> ${cleanStoreCode}`];
  if (phoneStr && rawBilling.indexOf(phoneStr) === -1) {
    metaParts.push(`<b>เบอร์โทร:</b> ${phoneStr}`);
  }
  html += `<div style="font-size:12.5px;color:#444444;">${metaParts.join(" &nbsp;|&nbsp; ")}</div>`;

  if (scheduleLabel) {
    html += `<div style="font-size:13px;color:#E65100;font-weight:700;margin-top:4px;">⏰ กำหนดการจัดส่ง: ${scheduleLabel}</div>`;
  }
  return html;
}

function ORD_CreateOrderTaxInvoiceA4(orderId, storeInfo, cart, totalAmt, scheduleLabel) {
  try {
    let compName = getConfigValue("COMPANY_NAME", "กอ.แก๊ส เชียงใหม่");
    let compAddr = getConfigValue("OFFICE_LOCATION", "8/4 ถนนพัฒนาช้างเผือก ตำบลช้างเผือก อ.เมือง จ.เชียงใหม่ 50300");
    let bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
    let bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
    let bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");
    let dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm");

    let customerBlockHtml = ORD_FormatCustomerHeaderHtml(storeInfo, scheduleLabel);
    let rowsHtml = "";
    let rowIdx = 1;

    if (cart.g15 > 0) {
      let sub15 = cart.g15 * storeInfo.price15;
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${rowIdx++}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;font-weight:bold;">แก๊สหุงต้ม ขนาด 15 กก.</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${cart.g15} ถัง</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;">${storeInfo.price15.toLocaleString("en")}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;font-weight:bold;">${sub15.toLocaleString("en")}</td>
      </tr>`;
    }
    if (cart.g48 > 0) {
      let sub48 = cart.g48 * storeInfo.price48;
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${rowIdx++}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;font-weight:bold;">แก๊สหุงต้ม ขนาด 48 กก.</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${cart.g48} ถัง</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;">${storeInfo.price48.toLocaleString("en")}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;font-weight:bold;">${sub48.toLocaleString("en")}</td>
      </tr>`;
    }
    if (cart.can > 0) {
      let subCan = cart.can * storeInfo.priceCan;
      rowsHtml += `<tr>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${rowIdx++}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;font-weight:bold;">แก๊สกระป๋อง</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:center;">${cart.can} ลัง</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;">${storeInfo.priceCan.toLocaleString("en")}</td>
        <td style="border-bottom:1px solid #E0E0E0;padding:11px 10px;text-align:right;font-weight:bold;">${subCan.toLocaleString("en")}</td>
      </tr>`;
    }

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; color: #111111; padding: 34px; font-size: 14px; line-height: 1.45; }
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
      .items-table th { background-color: #1DA1DB; color: #FFFFFF; padding: 10px; text-align: center; font-weight: 700; }
      .total-row td { background-color: #F8FBFE; border-top: 2px solid #1DA1DB; padding: 13px 10px; font-weight: 700; }
      .bank-box { margin-top: 16px; padding: 11px 15px; background-color: #F4F5F7; border-radius: 6px; font-size: 13px; }
      .sign-table { width: 100%; border-collapse: collapse; margin-top: 48px; }
      .sign-td { width: 50%; text-align: center; font-size: 13px; color: #333333; }
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
              <div class="doc-title">ใบส่งของ / ใบเสร็จรับเงิน</div>
              <div class="doc-sub">เลขที่เอกสาร: ${orderId}</div>
              <div class="doc-sub">วันที่: ${dateStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <table class="cust-table">
        <tr>
          <td class="cust-td">${customerBlockHtml}</td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:10%;">ลำดับ</th>
            <th style="width:45%;text-align:left;">รายการสินค้า</th>
            <th style="width:15%;">จำนวน</th>
            <th style="width:15%;text-align:right;">ราคา/หน่วย</th>
            <th style="width:15%;text-align:right;">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4" style="text-align:right;font-size:15px;">ยอดเงินรวมสุทธิ (บาท)</td>
            <td style="text-align:right;font-size:18px;color:#1DA1DB;">${totalAmt.toLocaleString("en")}</td>
          </tr>
        </tfoot>
      </table>

      <div class="bank-box">
        <b>🏦 ช่องทางชำระเงินโอน:</b> ${bName} &nbsp;เลขที่บัญชี <b>${bAcc}</b> &nbsp;(ชื่อบัญชี: ${bOwner})
      </div>

      <table class="sign-table">
        <tr>
          <td class="sign-td">
            ลงชื่อ ....................................................... ผู้รับสินค้า<br>
            ( ....................................................... )<br>
            วันที่ ........../........../..........
          </td>
          <td class="sign-td">
            ลงชื่อ ....................................................... ผู้ส่งสินค้า / ผู้รับเงิน<br>
            ( พนักงานจัดส่ง ${compName} )<br>
            วันที่ ........../........../..........
          </td>
        </tr>
      </table>
    </body></html>`;

    let safeFileTitle = String(storeInfo.storeId || storeInfo.storeName || "Customer").replace(/[^a-zA-Z0-9ก-๙_-]/g, "_");
    let blob = Utilities.newBlob(html, MimeType.HTML).setName(`ใบส่งของ_${orderId}_${safeFileTitle}.pdf`).getAs(MimeType.PDF);
    let folder = DB_GetSharedFolder("Gas_Invoices_PDF");
    let file = folder.createFile(blob);

    return {
      pdfUrl: file.getUrl(),
      imgUrl: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1200"
    };
  } catch (e) {
    Logger.log("ORD_CreateOrderTaxInvoiceA4 Error: " + e.message);
    return { pdfUrl: "", imgUrl: "" };
  }
}

function FIN_ReplyStoreOwnDebt(platform, tokenOrChatId, storeData) {
  try {
    let cleanStoreName = DB_CleanStorePrefix(storeData.storeName, storeData.storeId);
    let debtDetails = DB_GetStoreDebtDetails(cleanStoreName);
    let totalDebt = debtDetails.pendingDebt || 0;
    let unpaidBills = debtDetails.bills || [];
    let cTerm = storeData.creditTerm || debtDetails.creditTerm || "";

    if (unpaidBills.length === 0 || totalDebt === 0) {
      let okFlex = {
        type: "flex",
        altText: `✅ ร้าน ${cleanStoreName} ไม่มียอดค้างชำระ`,
        fallbackText: `🏪 ร้าน: ${cleanStoreName}\n✅ ปัจจุบันไม่มียอดค้างชำระค่ะ`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#1DA1DB",
            paddingAll: "14px",
            contents: [
              { type: "text", text: "💳 สถานะยอดค้างชำระ", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
              { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "14px",
            backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: "✅ ปัจจุบันไม่มียอดค้างชำระค่ะ", size: "sm", weight: "bold", color: "#2E7D32", align: "center", maxLines: 1 },
              UI_MakeFlexBoxBtn("🛒 สั่งแก๊ส", "เลือกประเภทแก๊ส", "#1DA1DB", "#FFFFFF", "xs")
            ]
          }
        }
      };
      MSG_SendReply(platform, tokenOrChatId, [okFlex], UI_GetStoreHomeQr());
      return;
    }

    let bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
    let bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
    let bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");

    let headerTitle = (cTerm === "15" || cTerm === "30")
                      ? `🧾 ใบวางบิลเครดิต ${cTerm} วัน`
                      : "💳 รายการบิลค้างชำระ";

    let rawBilling = String(storeData.billingName || cleanStoreName).trim();
    let billingLines = rawBilling.split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);

    let bodyContents = [];
    if (billingLines.length > 1) {
      let headerBoxRows = billingLines.map((line, idx) => ({
        type: "text",
        text: line,
        size: idx === 0 ? "xs" : "xxs",
        weight: idx === 0 ? "bold" : "regular",
        color: idx === 0 ? "#111111" : "#555555",
        wrap: true
      }));
      bodyContents.push({
        type: "box",
        layout: "vertical",
        backgroundColor: "#F8FBFE",
        borderColor: "#CBE6F6",
        borderWidth: "1px",
        cornerRadius: "6px",
        paddingAll: "8px",
        margin: "xs",
        contents: headerBoxRows
      });
    }

    let fallbackLines = [`${headerTitle}: ${cleanStoreName}`];
    for (let i = 0; i < unpaidBills.length; i++) {
      let b = unpaidBills[i];
      let shortD = b.shortDateStr || String(b.dateStr || "").replace(/\/20(\d{2})$/, "/$1");
      fallbackLines.push(`• ${b.orderId} (${shortD}) : ${b.amount.toLocaleString("en")} บ.`);
      bodyContents.push({
        type: "box",
        layout: "horizontal",
        margin: "xs",
        contents: [
          { type: "text", text: `• ${b.orderId} (${shortD})`, size: "xs", color: "#222222", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `${b.amount.toLocaleString("en")} บ.`, size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      });
    }

    fallbackLines.push(`💰 ยอดรวมสุทธิ: ${totalDebt.toLocaleString("en")} บาท`);
    let stCode = storeData.storeId || cleanStoreName;

    bodyContents.push(
      { type: "separator", margin: "md", color: "#E0E0E0" },
      {
        type: "box",
        layout: "horizontal",
        margin: "sm",
        contents: [
          { type: "text", text: `รวมสุทธิ (${unpaidBills.length} บิล)`, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
          { type: "text", text: `${totalDebt.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#B71C1C", align: "end", flex: 3, maxLines: 1 }
        ]
      },
      {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F0F8FC",
        cornerRadius: "8px",
        paddingAll: "10px",
        margin: "sm",
        contents: [
          { type: "text", text: `🏦 ${bName} : ${bAcc}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `ชื่อบัญชี: ${bOwner}`, size: "xxs", color: "#555555", maxLines: 1 },
          { type: "text", text: "📸 โอนแล้วส่งรูปสลิปลงในห้องแชทนี้ได้ทันทีค่ะ", size: "xxs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "sm",
        contents: [
          UI_MakeFlexBoxBtn("📄 ดูใบแจ้งหนี้ (รูปภาพ)", `ขอดูใบแจ้งหนี้ ${stCode}`, "#111111", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("🛒 สั่งแก๊สเพิ่ม", "เลือกประเภทแก๊ส", "#1DA1DB", "#FFFFFF", "xs")
        ]
      }
    );

    let debtFlex = {
      type: "flex",
      altText: `${headerTitle} ${totalDebt.toLocaleString("en")} บาท (${cleanStoreName})`,
      fallbackText: fallbackLines.join("\n"),
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: headerTitle, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

    MSG_SendReply(platform, tokenOrChatId, [debtFlex], UI_GetStoreHomeQr());
  } catch (e) {
    Logger.log("FIN_ReplyStoreOwnDebt Error: " + e.message);
  }
}

function ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChatId, explicitStoreName, isAdminMode) {
  const cache = CacheService.getScriptCache();
  let targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");
  if (!targetStore) return;

  cache.remove("focus_type_" + sessionKey);
  let storeInfo = DB_GetStoreById(targetStore) || { storeName: targetStore, price15: 490, price48: 1530, priceCan: 790 };
  let debtDetails = DB_GetStoreDebtDetails(storeInfo.storeName);
  let cartStr = cache.get("cart_" + sessionKey);
  let currentCart = cartStr ? JSON.parse(cartStr) : null;

  let step1UI = UI_BuildStoreStep1Flex(storeInfo, debtDetails.pendingDebt, currentCart, Boolean(isAdminMode), debtDetails.bills);
  MSG_SendReply(platform, tokenOrChatId, [step1UI.flexMsg], step1UI.qr);
}

function ORD_ShowStep2QtySelection(platform, sessionKey, tokenOrChatId, explicitStoreName, itemType, isAdminMode) {
  const cache = CacheService.getScriptCache();
  let targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");
  if (!targetStore) return;

  cache.put("focus_type_" + sessionKey, itemType, 600);
  let storeInfo = DB_GetStoreById(targetStore) || { storeName: targetStore, price15: 490, price48: 1530, priceCan: 790 };
  let step2UI = UI_BuildStoreStep2QtyFlex(storeInfo, itemType, Boolean(isAdminMode));
  MSG_SendReply(platform, tokenOrChatId, [step2UI.flexMsg], step2UI.qr);
}

function ORD_SetCartItemQty(platform, sessionKey, tokenOrChatId, itemType, qty, explicitStoreName, isAdminMode) {
  const cache = CacheService.getScriptCache();
  let targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");

  if (!targetStore) {
    if (isAdminMode) {
      let allStores = DB_GetAllActiveStores();
      let dirUI = UI_BuildAllStoresDirectory(allStores, 1);
      MSG_SendReply(platform, tokenOrChatId, [dirUI.flexMsg], dirUI.qr);
    }
    return;
  }

  cache.remove("focus_type_" + sessionKey);
  const cartKey = "cart_" + sessionKey;
  let cartStr = cache.get(cartKey);
  let cart = cartStr ? JSON.parse(cartStr) : { store: targetStore, g15: 0, g48: 0, can: 0 };
  if (cart.store !== targetStore) cart = { store: targetStore, g15: 0, g48: 0, can: 0 };

  if (itemType === "15") cart.g15 = qty;
  if (itemType === "48") cart.g48 = qty;
  if (itemType === "can") cart.can = qty;
  cache.put(cartKey, JSON.stringify(cart), 1800);

  let storeInfo = DB_GetStoreById(targetStore) || { storeName: targetStore, price15: 490, price48: 1530, priceCan: 790 };
  let cachedDebt = DB_GetCachedStoreDebt(targetStore);
  let step3UI = UI_BuildStoreStep3CheckoutFlex(storeInfo, cart, cachedDebt, Boolean(isAdminMode));
  MSG_SendReply(platform, tokenOrChatId, [step3UI.flexMsg], step3UI.qr);
}

function ORD_LockStoreAndShowMenu(platform, userId, tokenOrChatId, storeIdOrName, isAdminMode) {
  try {
    let storeData = DB_GetStoreById(storeIdOrName);
    if (!storeData) {
      MSG_SendReply(platform, tokenOrChatId, [{ type: "text", text: "❌ [ไม่พบร้านค้า]\nไม่พบข้อมูลร้านค้านี้ในระบบ" }], UI_GetAdminHomeQr());
      return;
    }

    let debtDetails = DB_GetStoreDebtDetails(storeData.storeName);
    DB_ClearAdminSession(userId);
    DB_SetSession(userId, "locked_store", storeData.storeName, 1800);
    CacheService.getScriptCache().remove("cart_" + userId);

    let step1UI = UI_BuildStoreStep1Flex(storeData, debtDetails.pendingDebt, null, Boolean(isAdminMode), debtDetails.bills);
    MSG_SendReply(platform, tokenOrChatId, [step1UI.flexMsg], step1UI.qr);
  } catch (e) {
    Logger.log("ORD_LockStoreAndShowMenu Error: " + e.message);
  }
}

function ORD_AddToCart(platform, sessionKey, tokenOrChatId, itemType, qty, explicitStoreName, isAdminMode) {
  ORD_SetCartItemQty(platform, sessionKey, tokenOrChatId, itemType, qty, explicitStoreName, isAdminMode);
}

function ORD_ShowCart(platform, sessionKey, tokenOrChatId, explicitStoreName, isAdminMode) {
  const cache = CacheService.getScriptCache();
  let targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");
  if (!targetStore) return;

  let cartStr = cache.get("cart_" + sessionKey);
  if (!cartStr) {
    ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChatId, targetStore, isAdminMode);
    return;
  }

  let cart = JSON.parse(cartStr);
  let storeInfo = DB_GetStoreById(cart.store) || { storeName: cart.store, price15: 490, price48: 1530, priceCan: 790 };
  let cachedDebt = DB_GetCachedStoreDebt(cart.store);
  let step3UI = UI_BuildStoreStep3CheckoutFlex(storeInfo, cart, cachedDebt, Boolean(isAdminMode));
  MSG_SendReply(platform, tokenOrChatId, [step3UI.flexMsg], step3UI.qr);
}

function ORD_ConfirmOrder(platform, sessionKey, tokenOrChatId, explicitStoreName, isAdminMode) {
  const cache = CacheService.getScriptCache();
  const cartKey = "cart_" + sessionKey;
  let cartStr = cache.get(cartKey);
  let targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");

  if (!cartStr) {
    if (targetStore) {
      ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChatId, targetStore, isAdminMode);
    }
    return;
  }

  let cart = JSON.parse(cartStr);
  if ((cart.g15 || 0) === 0 && (cart.g48 || 0) === 0 && (cart.can || 0) === 0) return;

  let storeInfo = DB_GetStoreById(cart.store) || {
    storeName: cart.store,
    billingName: cart.store,
    price15: 490,
    price48: 1530,
    priceCan: 790,
    phone: "-",
    mapLink: "-"
  };
  let cleanStoreName = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId);
  let totalAmt = (cart.g15 * storeInfo.price15) + (cart.g48 * storeInfo.price48) + (cart.can * storeInfo.priceCan);
  let orderId = DB_GenerateNextQueueId();

  let now = new Date();
  let currentHour = parseInt(Utilities.formatDate(now, "Asia/Bangkok", "HH"), 10);
  let isAfter8PM = (currentHour >= 20 || currentHour < 9);
  let scheduleNote = isAfter8PM ? "[คิวส่งพรุ่งนี้ 09:00 น.]" : "";
  let scheduleLabel = isAfter8PM ? "พรุ่งนี้เช้า เวลา 09:00 น." : "จัดส่งวันนี้ (ตามคิวงาน)";

  let taxDoc = ORD_CreateOrderTaxInvoiceA4(orderId, storeInfo, cart, totalAmt, scheduleLabel);
  if (taxDoc.imgUrl) {
    cache.put("QUEUE_JPEG_" + orderId + "_" + String(storeInfo.billingName || "").length, taxDoc.imgUrl, 21600);
  }
  DB_CreateQueueOrder(cleanStoreName, cart.g15, cart.g48, cart.can, totalAmt, orderId, taxDoc.pdfUrl, scheduleNote);

  let timeStr = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm น.");
  let itemSummary = [];
  if (cart.g15 > 0) itemSummary.push(`15กก.(${cart.g15} ถัง)`);
  if (cart.g48 > 0) itemSummary.push(`48กก.(${cart.g48} ถัง)`);
  if (cart.can > 0) itemSummary.push(`กระป๋อง(${cart.can} ลัง)`);

  let tgMsg = `🚚 [คิวส่งแก๊สใหม่: ${orderId}] ${scheduleNote}\n` +
              `🏪 ร้าน: ${cleanStoreName}\n` +
              `📦 รายการ: ${itemSummary.join(", ")}\n` +
              `💰 ยอดเก็บลูกค้า: ${totalAmt.toLocaleString("en")} บาท\n` +
              `⏰ กำหนดส่ง: ${scheduleLabel}`;

  cache.removeAll([cartKey, "focus_type_" + sessionKey]);

  if (isAdminMode) {
    DB_ClearAdminSession(sessionKey);

    let confirmAdminFlex = {
      type: "flex",
      altText: `✅ เปิดคิวงาน ${orderId} สำเร็จ (${totalAmt.toLocaleString("en")} บ.)`,
      fallbackText: tgMsg,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `✅ เปิดคิวงาน ${orderId} สำเร็จ!`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `📦 รายการ: ${itemSummary.join(", ")}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `💰 ยอดรวมสุทธิ: ${totalAmt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
            { type: "text", text: `⏰ รอบจัดส่ง: ${scheduleLabel}`, size: "xs", weight: "bold", color: isAfter8PM ? "#E65100" : "#2E7D32", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              margin: "sm",
              contents: [
                UI_MakeFlexBoxBtn("🖨️ ดูใบเสร็จ JPEG", `ขอดูใบเสร็จ ${orderId}`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🛒 สั่งร้านอื่นต่อ", "admin_order", "#1DA1DB", "#FFFFFF", "xs")
              ]
            },
            UI_MakeFlexBoxBtn(`❌ ยกเลิกคิว ${orderId}`, `cancel_q_${orderId}`, "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChatId, [confirmAdminFlex], UI_GetAdminHomeQr());
  } else {
    let confirmStoreFlex = {
      type: "flex",
      altText: `✅ รับออร์เดอร์ ${orderId} เรียบร้อยค่ะ`,
      fallbackText: tgMsg,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `✅ รับออร์เดอร์ ${orderId} เรียบร้อยค่ะ`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${cleanStoreName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `📦 รายการ: ${itemSummary.join(", ")}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `💰 ยอดรวมสุทธิ: ${totalAmt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
            { type: "text", text: `⏰ กำหนดจัดส่ง: ${scheduleLabel}`, size: "xs", weight: "bold", color: isAfter8PM ? "#E65100" : "#2E7D32", maxLines: 1 }
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChatId, [confirmStoreFlex], UI_GetStoreHomeQr());
  }

  let queueFlex = Staff_BuildSingleQueueFlexCard({
    orderId: orderId,
    store: cleanStoreName,
    billingName: storeInfo.billingName,
    time: timeStr,
    g15: cart.g15,
    g48: cart.g48,
    cans: cart.can,
    total: totalAmt,
    phone: storeInfo.phone,
    mapLink: storeInfo.mapLink,
    pdfUrl: taxDoc.pdfUrl,
    note: scheduleNote
  }, 1, 1, false);

  MSG_PushLine(DB_GetStaffGroupId(), [queueFlex], UI_GetStaffHomeQr());
  TG_SendNotification(tgMsg);
}

function ORD_ClearCart(platform, sessionKey, tokenOrChatId, explicitStoreName, isAdminMode) {
  const cache = CacheService.getScriptCache();
  cache.removeAll(["cart_" + sessionKey, "focus_type_" + sessionKey]);

  if (isAdminMode) {
    DB_ClearAdminSession(sessionKey);
    let clearFlex = {
      type: "flex",
      altText: "✅ ยกเลิกรายการและปลดล็อคร้านค้าเรียบร้อย",
      fallbackText: "✅ ยกเลิกรายการและปลดล็อคร้านค้าเรียบร้อยครับ",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "13px",
          contents: [
            { type: "text", text: "✅ ยกเลิกรายการเรียบร้อย", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "ล้างตะกร้าและปลดล็อคร้านค้าเรียบร้อยครับ", size: "xs", color: "#333333", maxLines: 1 },
            UI_MakeFlexBoxBtn("🛒 เลือกร้านสั่งแก๊สใหม่", "admin_order", "#1DA1DB", "#FFFFFF", "xs")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChatId, [clearFlex], UI_GetAdminHomeQr());
  } else {
    let targetStore = explicitStoreName || "";
    ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChatId, targetStore, false);
  }
}

// ==========================================
// 🚚 DISTINCT CI QUEUE CARD + GOOGLE MAPS NAVIGATION BUTTON + BILLING HEADER EDIT
// ==========================================

function Staff_BuildSingleQueueFlexCard(qItem, indexNum, totalCount, isAdminView, navButtonsOptional) {
  let cleanStore = DB_CleanStorePrefix(qItem.store);
  let storeInfo = DB_GetStoreById(cleanStore) || { storeId: cleanStore, storeName: cleanStore };
  let stCode = storeInfo.storeId || cleanStore;
  let rawBilling = String(storeInfo.billingName || qItem.billingName || cleanStore).trim();
  let bFirstLine = rawBilling.split(/\r?\n|\|/)[0].trim();
  let phone = qItem.phone || storeInfo.phone || "-";
  let mapUri = (typeof DB_GetStoreGoogleMapUri === "function") ? DB_GetStoreGoogleMapUri(storeInfo) : "https://www.google.com/maps";
  let isMorningQueue = qItem.note && qItem.note.indexOf("09:00") !== -1;

  let items = [];
  if (qItem.g15 > 0) items.push(`15กก.(${qItem.g15} ถัง)`);
  if (qItem.g48 > 0) items.push(`48กก.(${qItem.g48} ถัง)`);
  if (qItem.cans > 0) items.push(`กระป๋อง(${qItem.cans} ลัง)`);

  let bodyRows = [
    { type: "text", text: `🏪 ${cleanStore}`, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
    { type: "text", text: `🧾 หัวบิล: ${bFirstLine}`, size: "xxs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
    {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F0F8FC",
      borderColor: "#1DA1DB",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "sm",
      contents: [
        { type: "text", text: `📦 ${items.join(", ") || "-"}`, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `${Number(qItem.total || 0).toLocaleString("en")} บ.`, size: "sm", weight: "bold", color: "#0277BD", align: "end", flex: 2, maxLines: 1 }
      ]
    },
    {
      type: "text",
      text: isMorningQueue ? "🌅 กำหนดส่ง: พรุ่งนี้เช้า 09:00 น." : `⏰ เวลาสั่ง: ${qItem.time}`,
      size: "xxs",
      weight: "bold",
      color: isMorningQueue ? "#E65100" : "#2E7D32",
      maxLines: 1
    }
  ];

  if (phone && phone !== "-") {
    bodyRows.push({ type: "text", text: `📞 โทร: ${phone}`, size: "xxs", color: "#333333", maxLines: 1 });
  }

  bodyRows.push({ type: "separator", margin: "sm", color: "#E5E5E5" });

  // ปุ่มกดจบงานสีเขียวสด (#1B873F) แยกจากปุ่มข้อมูลทั่วไปอย่างชัดเจน
  bodyRows.push(UI_MakeFlexBoxBtn(`✅ จัดส่งแล้ว ${qItem.orderId} (บันทึกส่งงาน)`, `จัดส่งแล้ว ${qItem.orderId}`, "#1B873F", "#FFFFFF", "sm"));

  // แถวปุ่มนำทาง Google Maps + ปุ่มใบเสร็จ JPEG + ปุ่มแก้หัวบิล
  bodyRows.push({
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    margin: "xs",
    contents: [
      UI_MakeFlexUriBtn("📍 นำทาง Map", mapUri, "#E8F5E9", "#1B5E20", "xs", "#A5D6A7"),
      UI_MakeFlexBoxBtn("🖨️ ใบเสร็จ JPEG", `ขอดูใบเสร็จ ${qItem.orderId}`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
      UI_MakeFlexBoxBtn("🧾 แก้หัวบิล", `ตั้งหัวบิล_${stCode}`, "#F4F5F7", "#111111", "xxs")
    ]
  });

  if (isAdminView) {
    bodyRows.push(UI_MakeFlexBoxBtn(`❌ ยกเลิกคิว ${qItem.orderId}`, `cancel_q_${qItem.orderId}`, "#FFF3E0", "#B71C1C", "xxs", "#FFCC80"));
  }

  if (navButtonsOptional && navButtonsOptional.length > 0) {
    bodyRows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "sm",
      contents: navButtonsOptional
    });
  }

  // หัวการ์ดคิวส่งแก๊สใช้โทนสีดำเข้ม (#111111) ตัดกับป้ายคิวสีฟ้าสด (#1DA1DB) เพื่อให้ลูกน้องแยกออกจากข้อความบอททั่วไปได้ทันที
  return {
    type: "flex",
    altText: `🚚 คิวส่งแก๊ส ${qItem.orderId} (${cleanStore})`,
    fallbackText: `🚚 [คิวส่งแก๊ส ${indexNum}/${totalCount}] (${qItem.orderId})\n🏪 ร้าน: ${cleanStore}\n📦 รายการ: ${items.join(", ")}\n💰 ยอดเก็บ: ${Number(qItem.total || 0).toLocaleString("en")} บ.`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#111111",
        paddingAll: "13px",
        alignItems: "center",
        contents: [
          { type: "text", text: `🚚 คิวส่งแก๊ส ${qItem.orderId}`, weight: "bold", size: "md", color: "#FFFFFF", flex: 3, maxLines: 1 },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#1DA1DB",
            cornerRadius: "6px",
            paddingAll: "4px",
            flex: 2,
            contents: [
              { type: "text", text: `คิวที่ ${indexNum}/${totalCount}`, size: "xxs", weight: "bold", color: "#FFFFFF", align: "center", maxLines: 1 }
            ]
          }
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
}

function Staff_ReplyQueueReceiptJpeg(platform, tokenOrChat, queueOrderId) {
  try {
    let targetId = String(queueOrderId || "").trim().toUpperCase();
    if (!targetId.startsWith("#")) targetId = "#" + targetId;

    let qItem = DB_GetQueueOrderById(targetId);
    if (!qItem) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบคิวงาน]\nไม่พบคิวงาน ${targetId} ในระบบครับ` }], UI_GetStaffHomeQr());
      return;
    }

    let stInfo = DB_GetStoreById(qItem.store) || { storeName: qItem.store, billingName: qItem.store, price15: 490, price48: 1530, priceCan: 790 };
    let cache = CacheService.getScriptCache();
    let cacheKey = "QUEUE_JPEG_" + targetId + "_" + String(stInfo.billingName || "").length;
    let cachedImg = cache.get(cacheKey);

    if (!cachedImg) {
      let doc = ORD_CreateOrderTaxInvoiceA4(targetId, stInfo, { g15: qItem.g15, g48: qItem.g48, can: qItem.cans }, qItem.total, "จัดส่งตามคิวงาน");
      cachedImg = doc.imgUrl;
      if (cachedImg) cache.put(cacheKey, cachedImg, 21600);
    }

    if (cachedImg) {
      let mapUri = (typeof DB_GetStoreGoogleMapUri === "function") ? DB_GetStoreGoogleMapUri(stInfo) : "https://www.google.com/maps";
      let actCard = {
        type: "flex",
        altText: `🖨️ ใบเสร็จคิวงาน ${targetId}`,
        fallbackText: `🖨️ ใบเสร็จคิวงาน ${targetId}`,
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
              UI_MakeFlexBoxBtn(`✅ จัดส่งแล้ว ${targetId} (บันทึกส่งงาน)`, `จัดส่งแล้ว ${targetId}`, "#1B873F", "#FFFFFF", "sm"),
              {
                type: "box",
                layout: "horizontal",
                spacing: "xs",
                contents: [
                  UI_MakeFlexUriBtn("📍 นำทาง Map", mapUri, "#E8F5E9", "#1B5E20", "xs", "#A5D6A7"),
                  UI_MakeFlexBoxBtn("🧾 แก้หัวบิล", `ตั้งหัวบิล_${stInfo.storeId || qItem.store}`, "#F4F5F7", "#111111", "xs")
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
    } else {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบใบเสร็จ]\nไม่สามารถสร้างไฟล์ใบเสร็จของคิว ${targetId} ได้ครับ` }], UI_GetStaffHomeQr());
    }
  } catch (e) {
    Logger.log("Staff_ReplyQueueReceiptJpeg Error: " + e.message);
  }
}

function Staff_ReplyPendingOrdersBubbles(platform, tokenOrChat, page, isAdminView) {
  try {
    let pendingOrders = DB_GetPendingOrders(false);
    let homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();

    if (!pendingOrders || pendingOrders.length === 0) {
      let emptyFlex = {
        type: "flex",
        altText: "✨ ไม่มีออร์เดอร์ค้างส่งในระบบขณะนี้ครับ",
        fallbackText: "✨ ไม่มีออร์เดอร์ค้างส่งในระบบขณะนี้ครับ!",
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#111111",
            paddingAll: "14px",
            contents: [
              { type: "text", text: "🚚 คิวส่งแก๊สวันนี้", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: "✨ จัดส่งครบทุกคิวแล้ว ไม่มีออร์เดอร์ค้างส่งครับ!", size: "xs", weight: "bold", color: "#2E7D32", align: "center", maxLines: 1, adjustMode: "shrink-to-fit" }
            ]
          }
        }
      };
      MSG_SendReply(platform, tokenOrChat, [emptyFlex], homeQr);
      return;
    }

    let pageSize = 3;
    let totalPages = Math.ceil(pendingOrders.length / pageSize);
    let curPage = Math.max(1, Math.min(page || 1, totalPages));
    let startIdx = (curPage - 1) * pageSize;
    let slice = pendingOrders.slice(startIdx, startIdx + pageSize);

    let navBtns = [];
    if (curPage > 1) {
      navBtns.push(UI_MakeFlexBoxBtn(`⬅️ คิวก่อนหน้า (${curPage - 1}/${totalPages})`, `staff_queue_page_${curPage - 1}`, "#F4F5F7", "#111111", "xs"));
    }
    if (curPage < totalPages) {
      navBtns.push(UI_MakeFlexBoxBtn(`➡️ คิวถัดไป (${curPage + 1}/${totalPages})`, `staff_queue_page_${curPage + 1}`, "#1DA1DB", "#FFFFFF", "xs"));
    }

    let bubbles = [];
    for (let i = 0; i < slice.length; i++) {
      let item = slice[i];
      let qNum = startIdx + i + 1;
      let isLastInSlice = (i === slice.length - 1);
      bubbles.push(Staff_BuildSingleQueueFlexCard(item, qNum, pendingOrders.length, isAdminView, isLastInSlice ? navBtns : null));
    }

    MSG_SendReply(platform, tokenOrChat, bubbles, homeQr);
  } catch (e) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [เกิดข้อผิดพลาด]\n" + e.message }], []);
  }
}

// ==========================================
// ⏱️ 5-MINUTE TIMEOUT STAFF DELIVERY WORKFLOW
// ==========================================

function Staff_GetFlowState(userId, roomId) {
  let cache = CacheService.getScriptCache();
  let raw = cache.get("STAFF_FLOW_" + userId) || (roomId ? cache.get("STAFF_FLOW_" + roomId) : null);
  if (!raw) return null;
  try {
    let state = JSON.parse(raw);
    if (state.updatedAt && ((new Date().getTime() - state.updatedAt) > 300000)) {
      Staff_ClearFlowState(userId, roomId);
      return null;
    }
    return state;
  } catch (e) { return null; }
}

function Staff_SaveFlowState(userId, roomId, stateObj) {
  let cache = CacheService.getScriptCache();
  stateObj.updatedAt = new Date().getTime();
  let str = JSON.stringify(stateObj);
  cache.put("STAFF_FLOW_" + userId, str, 300);
  if (roomId) cache.put("STAFF_FLOW_" + roomId, str, 300);
}

function Staff_ClearFlowState(userId, roomId) {
  let cache = CacheService.getScriptCache();
  cache.remove("STAFF_FLOW_" + userId);
  if (roomId) cache.remove("STAFF_FLOW_" + roomId);
}

function Staff_StartDeliveryStep1_Driver(platform, tokenOrChat, queueOrderId, isAdminView) {
  let targetId = String(queueOrderId || "").trim().toUpperCase();
  if (!targetId.startsWith("#")) targetId = "#" + targetId;

  let qItem = DB_GetQueueOrderById(targetId);
  let homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();
  if (!qItem) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบคิวงาน]\nไม่พบคิวงาน ${targetId} หรือคิวนี้ถูกตัดจัดส่งไปแล้วครับ` }], homeQr);
    return;
  }

  let drivers = DB_GetStaffDrivers();
  let items = [];
  if (qItem.g15 > 0) items.push(`15กก.(${qItem.g15})`);
  if (qItem.g48 > 0) items.push(`48กก.(${qItem.g48})`);
  if (qItem.cans > 0) items.push(`กระป๋อง(${qItem.cans})`);

  let buttonRows = [
    {
      type: "text",
      text: "แตะเลือกชื่อผู้ส่งแก๊สสำหรับคิวนี้:",
      size: "xs",
      weight: "bold",
      color: "#111111",
      maxLines: 1
    }
  ];

  for (let i = 0; i < drivers.length; i += 2) {
    let d1 = drivers[i];
    let rowBtns = [
      UI_MakeFlexBoxBtn(`${i + 1}. ${d1}`, `ผู้ส่ง ${targetId} ${d1}`, "#F8FBFE", "#111111", "xs", "#CBE6F6")
    ];

    if (i + 1 < drivers.length) {
      let d2 = drivers[i + 1];
      rowBtns.push(UI_MakeFlexBoxBtn(`${i + 2}. ${d2}`, `ผู้ส่ง ${targetId} ${d2}`, "#F8FBFE", "#111111", "xs", "#CBE6F6"));
    } else {
      rowBtns.push(UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกส่งงาน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80"));
    }

    buttonRows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: rowBtns
    });
  }

  if (drivers.length % 2 === 0) {
    buttonRows.push(UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกส่งงาน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80"));
  }

  let step1Flex = {
    type: "flex",
    altText: `👤 ขั้นที่ 1: เลือกชื่อผู้ส่ง (${targetId})`,
    fallbackText: `👤 [ขั้นที่ 1: เลือกชื่อผู้ส่ง (${targetId})]\n🏪 ${qItem.store} • ${items.join(", ")} (${qItem.total.toLocaleString("en")} บ.)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `👤 ขั้นที่ 1 : เลือกชื่อผู้ส่ง (${targetId})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${qItem.store} • ${items.join(", ")} (${qItem.total.toLocaleString("en")} บ.)`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: buttonRows
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step1Flex], homeQr);
}

function Staff_SelectDriverStep2_Receipt(platform, userId, roomId, tokenOrChat, queueOrderId, driverName, isAdminView) {
  let targetId = String(queueOrderId || "").trim().toUpperCase();
  if (!targetId.startsWith("#")) targetId = "#" + targetId;

  let qItem = DB_GetQueueOrderById(targetId);
  let homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();
  if (!qItem) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบคิวงาน]\nไม่พบคิวงาน ${targetId} ในระบบครับ` }], homeQr);
    return;
  }

  let stateObj = {
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

  let step2Flex = {
    type: "flex",
    altText: `📸 ขั้นที่ 2: ถ่ายรูปใบเสร็จส่งแก๊ส (${targetId})`,
    fallbackText: `📸 [ขั้นที่ 2: ถ่ายรูปใบเสร็จส่งแก๊ส]\nผู้ส่ง: ${driverName} | ร้าน: ${qItem.store}\nกรุณาถ่ายรูปใบเสร็จส่งแก๊สส่งลงในห้องนี้ (ภายใน 5 นาที) ครับ`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📸 ขั้นที่ 2 : ถ่ายรูปใบเสร็จส่งแก๊ส", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `👤 ผู้ส่ง: ${driverName} • 🏪 ${qItem.store}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "text",
            text: "📸 กรุณาถ่ายรูป 'ใบเสร็จส่งแก๊ส' ส่งลงในห้องนี้เพื่อยืนยันการจัดส่งครับ (Time Out 5 นาที)",
            size: "xs",
            weight: "bold",
            color: "#111111",
            wrap: true
          },
          {
            type: "text",
            text: `💰 ยอดตามบิล: ${qItem.total.toLocaleString("en")} บาท`,
            size: "xs",
            color: "#1DA1DB",
            weight: "bold",
            maxLines: 1
          },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("❌ ยกเลิกส่งงาน", "ยกเลิกส่งงาน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step2Flex], homeQr);
}

function Staff_SendStep3_AskFuelCard(platform, tokenOrChat, state) {
  let qId = state.queueOrderId;
  let step3Flex = {
    type: "flex",
    altText: `⛽ ขั้นที่ 3: มีเบิกค่าน้ำมันหรือไม่? (${qId})`,
    fallbackText: `⛽ [ขั้นที่ 3: รอบนี้มีเบิกค่าน้ำมันหรือไม่?]\nกดเลือก ไม่มีเบิกน้ำมัน หรือ มีเบิกค่าน้ำมัน`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "⛽ ขั้นที่ 3 : มีเบิกค่าน้ำมันหรือไม่?", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `✅ รับรูปใบเสร็จแล้ว • 👤 ผู้ส่ง: ${state.driver}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "รอบส่งนี้มีการเบิกค่าน้ำมันรถหรือไม่ครับ?", size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          UI_MakeFlexBoxBtn("✅ ไม่มีเบิกน้ำมัน (ไปต่อทันที)", `ไม่มีเบิกน้ำมัน ${qId}`, "#1DA1DB", "#FFFFFF", "sm"),
          UI_MakeFlexBoxBtn("⛽ มีเบิกค่าน้ำมัน", `มีเบิกค่าน้ำมัน ${qId}`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกส่งงาน", "#FFF3E0", "#B71C1C", "xxs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step3Flex], UI_GetStaffHomeQr());
}

function Staff_HandleFuelChoiceStep3(platform, userId, roomId, tokenOrChat, queueOrderId, hasFuel, isAdminView) {
  let state = Staff_GetFlowState(userId, roomId);
  if (!state) return;

  if (!hasFuel) {
    state.fuelCost = 0;
    state.fuelSlipUrl = "";
    state.step = "WAIT_PAYMENT_METHOD";
    Staff_SaveFlowState(userId, roomId, state);
    Staff_SendStep4_AskPaymentCard(platform, tokenOrChat, state);
    return;
  }

  state.step = "WAIT_FUEL_AMOUNT";
  Staff_SaveFlowState(userId, roomId, state);

  let qId = state.queueOrderId;
  let fuelAmtFlex = {
    type: "flex",
    altText: `⛽ ระบุยอดเบิกค่าน้ำมัน (${state.driver})`,
    fallbackText: `⛽ [ระบุยอดเบิกค่าน้ำมัน - ผู้ส่ง: ${state.driver}]\nกรุณาแตะเลือกหรือพิมพ์ตัวเลขยอดเงินค่าน้ำมันส่งมาในแชทครับ:`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `⛽ ระบุยอดเบิกน้ำมัน (${state.driver})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "แตะเลือกยอดเงินด้านล่าง หรือพิมพ์ตัวเลขได้เลยครับ:", size: "xs", color: "#333333", wrap: true },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn("⛽ 300 บาท", "300", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("⛽ 500 บาท", "500", "#F0F8FC", "#111111", "xs", "#CBE6F6")
            ]
          },
          UI_MakeFlexBoxBtn("✅ เปลี่ยนเป็น ไม่มีเบิกน้ำมัน", `ไม่มีเบิกน้ำมัน ${qId}`, "#F4F5F7", "#111111", "xs")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [fuelAmtFlex], UI_GetStaffHomeQr());
}

function Staff_TryHandleFuelAmountText(platform, userId, roomId, tokenOrChat, userText, isAdminView) {
  let state = Staff_GetFlowState(userId, roomId);
  if (!state || state.step !== "WAIT_FUEL_AMOUNT") return false;

  let m = String(userText || "").trim().match(/^(\d+)(?:\s*บาท|\s*บ\.?)?$/);
  if (!m) return false;

  let amt = parseInt(m[1], 10);
  state.fuelCost = amt;
  state.step = "WAIT_FUEL_IMG";
  Staff_SaveFlowState(userId, roomId, state);

  let askFuelImgFlex = {
    type: "flex",
    altText: `📸 ถ่ายรูปบิลน้ำมัน ${amt.toLocaleString("en")} บาท`,
    fallbackText: `📸 [ถ่ายรูปบิลน้ำมัน ${amt.toLocaleString("en")} บาท]\nกรุณาถ่ายรูปบิลน้ำมันส่งลงในห้องนี้ 1 รูปครับ`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `📸 ถ่ายรูปบิลน้ำมัน (${amt.toLocaleString("en")} บ.)`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "📸 กรุณาถ่ายรูป 'บิลน้ำมัน' ส่งลงในห้องนี้ 1 รูปครับ (ภายใน 5 นาที)", size: "xs", weight: "bold", color: "#111111", wrap: true },
          UI_MakeFlexBoxBtn("✅ เปลี่ยนเป็น ไม่มีเบิกน้ำมัน", `ไม่มีเบิกน้ำมัน ${state.queueOrderId}`, "#F4F5F7", "#333333", "xs")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [askFuelImgFlex], UI_GetStaffHomeQr());
  return true;
}

function Staff_SendStep4_AskPaymentCard(platform, tokenOrChat, state) {
  let qId = state.queueOrderId;
  let step4Flex = {
    type: "flex",
    altText: `💰 ขั้นที่ 4: เลือกวิธีชำระเงิน (${qId})`,
    fallbackText: `💰 [ขั้นที่ 4: เลือกวิธีชำระเงิน (${qId})]\nยอดค่าแก๊ส: ${state.total.toLocaleString("en")} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `💰 ขั้นที่ 4 : เลือกวิธีชำระเงิน (${qId})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `👤 ผู้ส่ง: ${state.driver} • 🏪 ${state.store}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดค่าแก๊สตามบิล", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
              { type: "text", text: `${state.total.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
            ]
          },
          (state.fuelCost > 0
            ? { type: "text", text: `⛽ หักเบิกค่าน้ำมัน: -${state.fuelCost.toLocaleString("en")} บาท`, size: "xxs", weight: "bold", color: "#B71C1C", maxLines: 1 }
            : { type: "text", text: "⛽ เบิกค่าน้ำมัน: ไม่มี", size: "xxs", color: "#888888", maxLines: 1 }),
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("💵 รับเงินสด", `ชำระด้วย ${qId} เงินสด`, "#1DA1DB", "#FFFFFF", "sm"),
          UI_MakeFlexBoxBtn("📲 ลูกค้าโอนเงิน", `ชำระด้วย ${qId} เงินโอน`, "#0288D1", "#FFFFFF", "sm"),
          UI_MakeFlexBoxBtn("🧾 เซ็นบิลเครดิต", `ชำระด้วย ${qId} เครดิต`, "#111111", "#FFFFFF", "sm")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step4Flex], UI_GetStaffHomeQr());
}

function Staff_SelectPaymentStep4(platform, userId, roomId, tokenOrChat, queueOrderId, payMethod, isAdminView) {
  let state = Staff_GetFlowState(userId, roomId);
  if (!state) return;

  state.payMethod = payMethod;

  if (payMethod === "เงินโอน") {
    state.step = "WAIT_TRANSFER_SLIP_CHOICE";
    Staff_SaveFlowState(userId, roomId, state);

    let qId = state.queueOrderId;
    let step5Flex = {
      type: "flex",
      altText: `📸 ขั้นที่ 5: มีรูปสลิปโอนเงินหน้างานหรือไม่? (${qId})`,
      fallbackText: `📸 [ขั้นที่ 5: มีรูปสลิปโอนเงินลูกค้าหน้างานหรือไม่?]`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0288D1",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `📸 ขั้นที่ 5 : สลิปโอนเงินหน้างาน (${qId})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${state.store} • ยอดโอน ${state.total.toLocaleString("en")} บ.`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "มีรูปสลิปโอนเงินจากลูกค้าที่หน้างานหรือไม่ครับ?", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("📸 มีรูปสลิปหน้างาน (ถ่ายส่งตอนนี้)", `มีสลิปหน้างาน ${qId}`, "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("💬 ยังไม่โอน / ลูกค้าส่งสลิปผ่าน LINE", `ส่งสลิปผ่านไลน์ ${qId}`, "#111111", "#FFFFFF", "xs")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [step5Flex], UI_GetStaffHomeQr());
    return;
  }

  Staff_FinalizeAndRecordDelivery(platform, userId, roomId, tokenOrChat, state, isAdminView);
}

function Staff_HandleTransferSlipChoiceStep5(platform, userId, roomId, tokenOrChat, queueOrderId, hasSlipAtSite, isAdminView) {
  let state = Staff_GetFlowState(userId, roomId);
  if (!state) return;

  if (hasSlipAtSite) {
    state.step = "WAIT_TRANSFER_SLIP_IMG";
    Staff_SaveFlowState(userId, roomId, state);

    let askSlipFlex = {
      type: "flex",
      altText: `📸 ส่งรูปสลิปโอนเงินหน้างาน (${state.store})`,
      fallbackText: `📸 กรุณาส่งรูปสลิปโอนเงินลูกค้า (${state.store}) ลงในห้องนี้ได้เลยครับ`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0288D1",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "📸 ส่งรูปสลิปโอนเงินหน้างาน", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `กรุณาถ่ายหรือส่งรูป "สลิปโอนเงินลูกค้า" (${state.store} ยอด ${state.total.toLocaleString("en")} บ.) ลงในห้องนี้ภายใน 5 นาทีครับ`, size: "xs", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("💬 เปลี่ยนเป็น ลูกค้าส่งผ่าน LINE", `ส่งสลิปผ่านไลน์ ${state.queueOrderId}`, "#F4F5F7", "#111111", "xs")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [askSlipFlex], UI_GetStaffHomeQr());
    return;
  }

  state.note = "ลูกค้าส่งสลิปโอนผ่าน LINE";
  Staff_FinalizeAndRecordDelivery(platform, userId, roomId, tokenOrChat, state, isAdminView);
}

function Staff_HandleIncomingPhoto(platform, userId, roomId, tokenOrChat, blob) {
  let state = Staff_GetFlowState(userId, roomId);
  if (!state) return false;

  let folder = DB_GetSharedFolder("Gas_Transfer_Slips");
  let file = folder.createFile(blob);
  let directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

  if (state.step === "WAIT_RECEIPT_IMG") {
    state.receiptUrl = directUrl;
    state.step = "WAIT_FUEL_CHOICE";
    Staff_SaveFlowState(userId, roomId, state);
    Staff_SendStep3_AskFuelCard(platform, tokenOrChat, state);
    return true;
  }

  if (state.step === "WAIT_FUEL_IMG") {
    state.fuelSlipUrl = directUrl;
    state.step = "WAIT_PAYMENT_METHOD";
    Staff_SaveFlowState(userId, roomId, state);
    Staff_SendStep4_AskPaymentCard(platform, tokenOrChat, state);
    return true;
  }

  if (state.step === "WAIT_TRANSFER_SLIP_IMG") {
    state.transferSlipUrl = directUrl;
    state.note = "แนบสลิปโอนหน้างาน";
    Staff_FinalizeAndRecordDelivery(platform, userId, roomId, tokenOrChat, state, false);
    return true;
  }

  return false;
}

function Staff_FinalizeAndRecordDelivery(platform, userId, roomId, tokenOrChat, state, isAdminView) {
  Staff_ClearFlowState(userId, roomId);

  let rec = DB_RecordStaffDeliveryToMainSheet(state);
  if (!rec.success) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [บันทึกข้อมูลไม่สำเร็จ]\n${rec.msg}` }], UI_GetStaffHomeQr());
    return;
  }

  let remaining = DB_GetPendingOrders(true);
  let statusBadge = rec.status === "ชำระแล้ว" ? "✅ ชำระแล้ว" : `⏳ ${rec.status}`;
  let slipNote = rec.hasTransferSlip ? "📸 แนบสลิปโอนลงช่อง X เรียบร้อย" : (rec.payMethod === "เงินโอน" ? "💬 รอลูกค้าส่งสลิปโอนผ่าน LINE" : "");

  let bodyRows = [
    { type: "text", text: `👤 ผู้ส่ง: ${rec.driver} • ตัดคิว ${state.queueOrderId} แล้ว`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
    { type: "text", text: `💰 ยอดค่าแก๊ส: ${rec.total.toLocaleString("en")} บ. (${rec.payMethod})`, size: "xs", weight: "bold", color: "#1DA1DB", maxLines: 1 },
    (rec.fuelCost > 0
      ? { type: "text", text: `⛽ เบิกค่าน้ำมัน: -${rec.fuelCost.toLocaleString("en")} บ.`, size: "xxs", weight: "bold", color: "#B71C1C", maxLines: 1 }
      : { type: "text", text: "⛽ เบิกค่าน้ำมัน: ไม่มี", size: "xxs", color: "#888888", maxLines: 1 }),
    { type: "text", text: `📌 สถานะบิล: ${statusBadge}`, size: "xs", weight: "bold", color: rec.status === "ชำระแล้ว" ? "#2E7D32" : "#E65100", maxLines: 1 }
  ];

  if (slipNote) {
    bodyRows.push({ type: "text", text: slipNote, size: "xxs", color: "#0288D1", maxLines: 1 });
  }

  bodyRows.push({ type: "separator", margin: "sm", color: "#E5E5E5" });

  if (remaining.length > 0) {
    bodyRows.push({
      type: "text",
      text: `📋 คิวค้างส่งคงเหลือวันนี้: ${remaining.length} คิว`,
      size: "xs",
      weight: "bold",
      color: "#111111",
      align: "center",
      margin: "xs",
      maxLines: 1
    });
    bodyRows.push(UI_MakeFlexBoxBtn(`🚚 ดูคิวที่เหลือ (${remaining.length} คิว)`, "order ส่งแก๊สวันนี้", "#1B873F", "#FFFFFF", "xs"));
  } else {
    bodyRows.push({
      type: "text",
      text: "✨ จัดส่งครบทุกคิวแล้ววันนี้",
      size: "xs",
      weight: "bold",
      color: "#2E7D32",
      align: "center",
      margin: "xs",
      maxLines: 1
    });
  }

  let doneFlex = {
    type: "flex",
    altText: `✅ บันทึกส่งแก๊ส ${rec.orderId} สำเร็จ (${rec.storeName})`,
    fallbackText: `✅ [บันทึกส่งแก๊สสำเร็จ ${rec.orderId} • แถวที่ ${rec.rowIdx}]\n🏪 ร้าน: ${rec.storeName}\n👤 ผู้ส่ง: ${rec.driver} | 💰 ยอด: ${rec.total.toLocaleString("en")} บ. (${rec.payMethod})\n📌 สถานะ: ${rec.status}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1B873F",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `✅ บันทึกส่งสำเร็จ (${rec.orderId} • แถว ${rec.rowIdx})`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `🏪 ${rec.storeName}`, size: "xs", color: "#E8F5E9", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  MSG_SendReply(platform, tokenOrChat, [doneFlex], isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr());

  let adminAlertTxt = `🔔 [ส่งแก๊สเสร็จ ${rec.orderId} • แถวที่ ${rec.rowIdx}]\n🏪 ร้าน: ${rec.storeName}\n👤 ผู้ส่ง: ${rec.driver}\n💰 ยอด: ${rec.total.toLocaleString("en")} บ. (${rec.payMethod})\n📌 สถานะ: ${rec.status}`;
  TG_SendNotification(adminAlertTxt);
}

function Staff_CancelDeliveryFlow(platform, userId, roomId, tokenOrChat, isAdminView) {
  Staff_ClearFlowState(userId, roomId);
  MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ยกเลิกส่งงาน]\nยกเลิกขั้นตอนการบันทึกส่งงานเรียบร้อยครับ" }], isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr());
}

function Staff_CompleteQueueOrder(platform, tokenOrChat, queueOrderId, isAdminView) {
  Staff_StartDeliveryStep1_Driver(platform, tokenOrChat, queueOrderId, isAdminView);
}

function Staff_CancelQueueOrder(platform, tokenOrChat, queueOrderId) {
  let res = DB_UpdateQueueStatusById(queueOrderId, "ยกเลิก");
  if (res.success) {
    let remaining = DB_GetPendingOrders(true);
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: `🗑️ [ยกเลิกคิวงานสำเร็จ]\nยกเลิกคิวงาน ${res.orderId} (${res.storeName}) ออกจากหน้างานเรียบร้อยแล้วครับ (คิวคงเหลือ ${remaining.length} คิว)`
    }], UI_GetAdminHomeQr());
  } else {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ยกเลิกไม่สำเร็จ]\n${res.msg}` }], UI_GetAdminHomeQr());
  }
}

// ==========================================
// 💵 ระบบนับเงินสดรอฝากรายคน + ช่วงเลขที่บิล (ตั้งแต่บิล #... ถึง #...) + ออกรูปตาราง JPEG
// ==========================================

function Staff_GetDriverResetMap() {
  const props = PropertiesService.getScriptProperties();
  let minCashCutoffMs = (CONFIG.CUTOFF_CASH instanceof Date) ? CONFIG.CUTOFF_CASH.getTime() : new Date(2026, 10, 1, 0, 0, 0).getTime();
  let savedResetMs = parseInt(props.getProperty("CASH_DEPOSIT_LAST_RESET_MS") || "0", 10);
  let globalResetMs = Math.max(minCashCutoffMs, (!isNaN(savedResetMs) ? savedResetMs : 0));

  let driverResetMap = {};
  let rawMap = props.getProperty("CASH_DEPOSIT_DRIVER_MAP_V43");
  if (rawMap) {
    try { driverResetMap = JSON.parse(rawMap); } catch (e) { driverResetMap = {}; }
  }

  let driverHistoryMap = {};
  let rawHist = props.getProperty("CASH_DEPOSIT_DRIVER_HISTORY_V43");
  if (rawHist) {
    try { driverHistoryMap = JSON.parse(rawHist); } catch (e) { driverHistoryMap = {}; }
  }

  return {
    globalResetMs: globalResetMs,
    driverResetMap: driverResetMap,
    driverHistoryMap: driverHistoryMap,
    lastGlobalInfo: props.getProperty("CASH_DEPOSIT_LAST_INFO") || "เริ่มนับตั้งแต่วันที่ 01/11/2026",
    hasUndoBackup: Boolean(props.getProperty("CASH_DEPOSIT_BACKUP_V45_2"))
  };
}

function Staff_CalculateAccumulatedCash() {
  let state = Staff_GetDriverResetMap();
  let recentTx = DB_GetRecentTransactions(150);

  let totalCash = 0;
  let totalFuel = 0;
  let billCount = 0;
  let driverMap = {};
  let allCashBills = [];

  for (let i = 0; i < recentTx.length; i++) {
    let tx = recentTx[i];
    if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว") continue;
    let dObj = parseSheetDate(tx.date);
    if (!dObj) continue;

    let sender = tx.sender || "ไม่ระบุ";
    if (sender === "ป่าน") sender = "ปาน";
    let driverSpecificMs = state.driverResetMap[sender] ? parseInt(state.driverResetMap[sender], 10) : 0;
    let effectiveCutoffMs = Math.max(state.globalResetMs, driverSpecificMs);

    if (dObj.getTime() < effectiveCutoffMs) continue;

    let cashPart = 0;
    if (tx.payMethod.indexOf("สด") !== -1 && tx.payMethod.indexOf("ผสม") === -1) {
      cashPart = tx.total;
    } else if (tx.payMethod.indexOf("ผสม") !== -1) {
      cashPart = tx.cashReceived;
    }

    let fuelPart = tx.fuelCost || 0;
    if (cashPart > 0 || fuelPart > 0) {
      totalCash += cashPart;
      totalFuel += fuelPart;
      billCount++;

      let oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
      let dtStr = Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yy HH:mm");

      if (!driverMap[sender]) {
        let sinceStr = Utilities.formatDate(new Date(effectiveCutoffMs), "Asia/Bangkok", "dd/MM HH:mm");
        driverMap[sender] = {
          cash: 0,
          fuel: 0,
          net: 0,
          orders: 0,
          sinceStr: sinceStr,
          firstBillId: oId,
          lastBillId: oId,
          bills: []
        };
      }
      driverMap[sender].cash += cashPart;
      driverMap[sender].fuel += fuelPart;
      driverMap[sender].net = driverMap[sender].cash - driverMap[sender].fuel;
      driverMap[sender].orders += 1;
      driverMap[sender].lastBillId = oId;

      let billRecord = {
        rowIdx: tx.rowIdx,
        orderId: oId,
        dateStr: dtStr,
        store: tx.store,
        driver: sender,
        cash: cashPart,
        fuel: fuelPart,
        net: cashPart - fuelPart
      };
      driverMap[sender].bills.push(billRecord);
      allCashBills.push(billRecord);
    }
  }

  let globalSinceStr = Utilities.formatDate(new Date(state.globalResetMs), "Asia/Bangkok", "dd/MM/yyyy HH:mm น.");
  return {
    sinceStr: globalSinceStr,
    billCount: billCount,
    totalCash: totalCash,
    totalFuel: totalFuel,
    netCashToDeposit: totalCash - totalFuel,
    driverMap: driverMap,
    allCashBills: allCashBills,
    driverHistoryMap: state.driverHistoryMap,
    lastDepositInfo: state.lastGlobalInfo,
    hasUndoBackup: state.hasUndoBackup
  };
}

function Staff_ReplyAccumulatedCash(platform, tokenOrChat, isAdminView) {
  let calc = Staff_CalculateAccumulatedCash();
  let drivers = Object.keys(calc.driverMap);
  let bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
  let bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
  let bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");

  let bodyContents = [];
  let fallbackLines = ["🏦 [สรุปเงินสดรอฝากธนาคาร (เริ่มนับ 1 พ.ย. 69)]"];

  if (drivers.length === 0) {
    bodyContents.push({
      type: "text",
      text: "✨ ไม่มีเงินสดค้างรอฝากในขณะนี้ (ยอดรอฝาก = 0 บาท)",
      size: "xs",
      weight: "bold",
      color: "#2E7D32",
      align: "center",
      maxLines: 1
    });
    if (calc.lastDepositInfo) {
      bodyContents.push({
        type: "text",
        text: `📌 ประวัติฝากล่าสุด: ${calc.lastDepositInfo}`,
        size: "xxs",
        color: "#666666",
        align: "center",
        wrap: true
      });
    }
    fallbackLines.push("✨ ไม่มีรายการเงินสดค้างรอฝาก (0 บาท)");
  } else {
    for (let i = 0; i < drivers.length; i++) {
      let name = drivers[i];
      let d = calc.driverMap[name];
      let billRangeTxt = (d.firstBillId === d.lastBillId)
                         ? `บิล ${d.firstBillId}`
                         : `ตั้งแต่บิล ${d.firstBillId} ถึง ${d.lastBillId}`;
      fallbackLines.push(`👤 ${name} (${d.orders} บิล: ${billRangeTxt}): สุทธิ ${d.net.toLocaleString("en")} บ.`);

      let driverBox = [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `👤 ${name} (${d.orders} บิล)`, size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
            { type: "text", text: `นับจาก ${d.sinceStr}`, size: "xxs", color: "#666666", align: "end", flex: 2, maxLines: 1 }
          ]
        },
        {
          type: "text",
          text: `🧾 ช่วงบิล: ${billRangeTxt}`,
          size: "xxs",
          weight: "bold",
          color: "#0277BD",
          margin: "xs",
          maxLines: 1,
          adjustMode: "shrink-to-fit"
        },
        {
          type: "text",
          text: `รับเงินสด: ${d.cash.toLocaleString("en")} บ. | หักน้ำมัน: -${d.fuel.toLocaleString("en")} บ.`,
          size: "xxs",
          color: "#444444",
          margin: "xs",
          maxLines: 1
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "xs",
          contents: [
            { type: "text", text: `👉 ${name} ถือเงินสดสุทธิ`, size: "xs", weight: "bold", color: "#1DA1DB", flex: 3, maxLines: 1 },
            { type: "text", text: `${d.net.toLocaleString("en")} บาท`, size: "xs", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
          ]
        }
      ];

      if (d.net > 0 || d.orders > 0) {
        driverBox.push({
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          margin: "sm",
          contents: [
            UI_MakeFlexBoxBtn(`✅ เคลียร์ ${name} ฝากแล้ว`, `ฝากเงิน_${name}`, "#111111", "#FFFFFF", "xxs"),
            UI_MakeFlexBoxBtn(`🖼️ ดูตาราง ${name}`, `cash_log_jpeg_${name}`, "#FFFFFF", "#111111", "xxs", "#CBE6F6")
          ]
        });
      }

      bodyContents.push({
        type: "box",
        layout: "vertical",
        backgroundColor: "#F8FBFE",
        borderColor: "#CBE6F6",
        borderWidth: "1px",
        cornerRadius: "8px",
        paddingAll: "10px",
        contents: driverBox
      });
    }
  }

  bodyContents.push({ type: "separator", margin: "md", color: "#E0E0E0" });
  bodyContents.push({
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: "💰 รวมเงินสดสุทธิรอฝาก", size: "xs", weight: "bold", color: "#111111", flex: 3, maxLines: 1 },
      { type: "text", text: `${calc.netCashToDeposit.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", align: "end", flex: 2, maxLines: 1 }
    ]
  });
  bodyContents.push({
    type: "text",
    text: `🏦 ${bName} ${bAcc} (${bOwner})`,
    size: "xxs",
    color: "#555555",
    maxLines: 1
  });

  if (calc.netCashToDeposit > 0 || calc.billCount > 0) {
    bodyContents.push(UI_MakeFlexBoxBtn("🖼️ ออกตารางบิลเงินสดรอฝากทั้งหมด (JPEG)", "cash_log_jpeg", "#0288D1", "#FFFFFF", "xs"));
    bodyContents.push(UI_MakeFlexBoxBtn(`✅ เคลียร์ฝากรวมทุกคน (${calc.netCashToDeposit.toLocaleString("en")} บาท)`, "ฝากเงิน_ALL", "#1DA1DB", "#FFFFFF", "xs"));
  }

  if (calc.hasUndoBackup) {
    bodyContents.push(UI_MakeFlexBoxBtn("↩️ ยกเลิกการกดฝากล่าสุด (Undo)", "undo_cash_deposit", "#FFF3E0", "#E65100", "xxs", "#FFCC80"));
  }

  let cashFlex = {
    type: "flex",
    altText: `🏦 เงินสดรอฝากธนาคาร ${calc.netCashToDeposit.toLocaleString("en")} บาท`,
    fallbackText: fallbackLines.join("\n"),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🏦 สรุปเงินสดรอฝากธนาคาร (แยกรายคน)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "ระบุช่วงเลขบิลชัดเจน • ออกตารางรูปภาพ JPEG ได้ทันที", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
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

  MSG_SendReply(platform, tokenOrChat, [cashFlex], UI_GetAdminHomeQr());
}

function Staff_ReplyCashDepositLogJpeg(platform, tokenOrChat, targetDriver) {
  let calc = Staff_CalculateAccumulatedCash();
  if (calc.allCashBills.length === 0) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ตารางเงินสดรอฝาก]\nปัจจุบันไม่มีรายการบิลเงินสดค้างรอฝากครับ" }], UI_GetAdminHomeQr());
    return;
  }

  if (typeof PDF_CreateCashDepositTableJpeg === "function") {
    let doc = PDF_CreateCashDepositTableJpeg(calc, targetDriver || "ALL");
    if (doc && doc.imgUrl) {
      MSG_SendReply(platform, tokenOrChat, [
        { type: "image", originalContentUrl: doc.imgUrl, previewImageUrl: doc.imgUrl }
      ], UI_GetAdminHomeQr());
      return;
    }
  }
  MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ ไม่สามารถสร้างรูปตารางเงินสดได้ในขณะนี้ครับ" }], UI_GetAdminHomeQr());
}

function Staff_AskConfirmCashDeposit(platform, tokenOrChat, targetDriver, isAdminView) {
  let calc = Staff_CalculateAccumulatedCash();
  let driverKey = (!targetDriver || targetDriver === "ALL") ? "ALL" : targetDriver;

  let targetAmt = calc.netCashToDeposit;
  let targetTitle = "ทุกคนรวมกัน";
  let billRangeTxt = "";

  if (driverKey !== "ALL" && calc.driverMap[driverKey]) {
    let dObj = calc.driverMap[driverKey];
    targetAmt = dObj.net;
    targetTitle = `คุณ ${driverKey}`;
    billRangeTxt = `ตั้งแต่บิล ${dObj.firstBillId} ถึง ${dObj.lastBillId} (${dObj.orders} บิล)`;
  } else if (calc.allCashBills.length > 0) {
    billRangeTxt = `ตั้งแต่บิล ${calc.allCashBills[0].orderId} ถึง ${calc.allCashBills[calc.allCashBills.length - 1].orderId} (${calc.billCount} บิล)`;
  }

  let confirmCmd = `ยืนยันฝากเงิน_${driverKey}`;
  let confirmLabel = `✔️ ยืนยันฝาก (${driverKey === "ALL" ? "ทุกคน" : driverKey})`;

  let askFlex = {
    type: "flex",
    altText: `⚠️ ยืนยันการนำเงินสดเข้าธนาคาร (${targetAmt.toLocaleString("en")} บ.)`,
    fallbackText: `⚠️ ยืนยันการนำเงินสดเข้าธนาคาร (${targetTitle}: ${targetAmt.toLocaleString("en")} บาท)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "⚠️ ยืนยันการนำเงินสดเข้าธนาคาร", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `👤 ผู้ฝากเงิน: ${targetTitle}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          (billRangeTxt ? { type: "text", text: `🧾 ช่วงบิลที่เคลียร์: ${billRangeTxt}`, size: "xs", color: "#0277BD", weight: "bold", wrap: true } : { type: "separator", margin: "xs", color: "#FFFFFF" }),
          { type: "text", text: `💰 ยอดเงินสดสุทธิ: ${targetAmt.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", maxLines: 1 },
          { type: "text", text: `ระบบจะบันทึก Log ช่วงบิลและเคลียร์ยอดของ [${targetTitle}] เป็น 0 บาททันที`, size: "xxs", color: "#555555", wrap: true },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn(confirmLabel, confirmCmd, "#1DA1DB", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "เงินสดรอฝาก", "#F4F5F7", "#333333", "xs")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [askFlex], UI_GetAdminHomeQr());
}

function Staff_ConfirmCashDepositReset(platform, tokenOrChat, userId, targetDriver, isAdminView) {
  let calc = Staff_CalculateAccumulatedCash();
  let state = Staff_GetDriverResetMap();
  let driverKey = (!targetDriver || targetDriver === "ALL") ? "ALL" : targetDriver;

  let now = new Date();
  let nowMs = now.getTime();
  let nowStr = Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy HH:mm น.");
  const props = PropertiesService.getScriptProperties();

  let backupSnapshot = {
    globalResetMs: state.globalResetMs,
    driverResetMap: JSON.parse(JSON.stringify(state.driverResetMap || {})),
    driverHistoryMap: JSON.parse(JSON.stringify(state.driverHistoryMap || {})),
    lastGlobalInfo: state.lastGlobalInfo
  };
  props.setProperty("CASH_DEPOSIT_BACKUP_V45_2", JSON.stringify(backupSnapshot));

  let clearedAmt = 0;
  let clearedCash = 0;
  let clearedFuel = 0;
  let clearedOrders = 0;
  let billRangeStr = "-";
  let targetTitle = "";

  if (driverKey !== "ALL" && calc.driverMap[driverKey]) {
    let dInfo = calc.driverMap[driverKey];
    clearedAmt = dInfo.net;
    clearedCash = dInfo.cash;
    clearedFuel = dInfo.fuel;
    clearedOrders = dInfo.orders;
    billRangeStr = `${dInfo.firstBillId} ถึง ${dInfo.lastBillId}`;
    targetTitle = driverKey;

    state.driverResetMap[driverKey] = nowMs + 1000;
    state.driverHistoryMap[driverKey] = `${nowStr} (${billRangeStr} = ${clearedAmt.toLocaleString("en")} บ.)`;
    props.setProperty("CASH_DEPOSIT_DRIVER_MAP_V43", JSON.stringify(state.driverResetMap));
    props.setProperty("CASH_DEPOSIT_DRIVER_HISTORY_V43", JSON.stringify(state.driverHistoryMap));
  } else {
    clearedAmt = calc.netCashToDeposit;
    clearedCash = calc.totalCash;
    clearedFuel = calc.totalFuel;
    clearedOrders = calc.billCount;
    if (calc.allCashBills.length > 0) {
      billRangeStr = `${calc.allCashBills[0].orderId} ถึง ${calc.allCashBills[calc.allCashBills.length - 1].orderId}`;
    }
    targetTitle = "รวมทุกคน";

    let allDrivers = Object.keys(calc.driverMap);
    for (let i = 0; i < allDrivers.length; i++) {
      let dName = allDrivers[i];
      let dObj = calc.driverMap[dName];
      state.driverResetMap[dName] = nowMs + 1000;
      state.driverHistoryMap[dName] = `${nowStr} (${dObj.firstBillId}-${dObj.lastBillId} = ${dObj.net.toLocaleString("en")} บ.)`;
    }
    props.setProperty("CASH_DEPOSIT_LAST_RESET_MS", String(nowMs + 1000));
    props.setProperty("CASH_DEPOSIT_DRIVER_MAP_V43", JSON.stringify(state.driverResetMap));
    props.setProperty("CASH_DEPOSIT_DRIVER_HISTORY_V43", JSON.stringify(state.driverHistoryMap));
  }

  let recordStr = `${nowStr} [${targetTitle}: บิล ${billRangeStr} ยอด ${clearedAmt.toLocaleString("en")} บ.]`;
  props.setProperty("CASH_DEPOSIT_LAST_INFO", recordStr);

  if (typeof DB_LogCashDepositHistory === "function") {
    DB_LogCashDepositHistory(targetTitle, billRangeStr, clearedOrders, clearedCash, clearedFuel, clearedAmt);
  }

  let doneFlex = {
    type: "flex",
    altText: `✅ บันทึกการฝากเงินสด ${clearedAmt.toLocaleString("en")} บาท สำเร็จ`,
    fallbackText: `✅ บันทึกการฝากเงินสดของ [${targetTitle}] ช่วงบิล ${billRangeStr} ยอด ${clearedAmt.toLocaleString("en")} บาท เรียบร้อยครับ`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "✅ บันทึกฝากเงินสดสำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `👤 ผู้ฝากเงิน: ${targetTitle}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          { type: "text", text: `🧾 ช่วงบิลที่เคลียร์: ${billRangeStr} (${clearedOrders} บิล)`, size: "xs", weight: "bold", color: "#0277BD", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `💵 ยอดนำเข้าธนาคาร: ${clearedAmt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#2E7D32", maxLines: 1 },
          { type: "text", text: `⏰ เวลาเคลียร์ยอด: ${nowStr}`, size: "xxs", color: "#555555", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("💵 ดูเงินสดรอฝากคงเหลือ", "เงินสดรอฝาก", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
          UI_MakeFlexBoxBtn("↩️ กดผิด? ยกเลิกการฝากล่าสุด (Undo)", "undo_cash_deposit", "#FFF3E0", "#E65100", "xxs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [doneFlex], UI_GetAdminHomeQr());
  TG_SendNotification(`🏦 [แจ้งเตือนนำเงินสดเข้าธนาคาร]\n👤 พนักงาน: ${targetTitle}\n🧾 ช่วงบิล: ${billRangeStr}\n💰 ยอดเงินสดนำฝาก: ${clearedAmt.toLocaleString("en")} บาท`);
}

function Staff_UndoLastCashDeposit(platform, tokenOrChat, isAdminView) {
  const props = PropertiesService.getScriptProperties();
  let rawBackup = props.getProperty("CASH_DEPOSIT_BACKUP_V45_2");
  if (!rawBackup) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ไม่มีประวัติย้อนกลับ]\nไม่มีประวัติการกดฝากล่าสุดให้ย้อนกลับครับ" }], UI_GetAdminHomeQr());
    return;
  }

  try {
    let backup = JSON.parse(rawBackup);
    props.setProperty("CASH_DEPOSIT_LAST_RESET_MS", String(backup.globalResetMs || 0));
    props.setProperty("CASH_DEPOSIT_DRIVER_MAP_V43", JSON.stringify(backup.driverResetMap || {}));
    props.setProperty("CASH_DEPOSIT_DRIVER_HISTORY_V43", JSON.stringify(backup.driverHistoryMap || {}));
    props.setProperty("CASH_DEPOSIT_LAST_INFO", backup.lastGlobalInfo || "");
    props.deleteProperty("CASH_DEPOSIT_BACKUP_V45_2");

    TG_SendNotification("↩️ [Undo Cash Deposit] ยกเลิกการกดเคลียร์เงินสดล่าสุด และดึงยอดเงินสดรอฝากกลับคืนมาเรียบร้อยครับ");
    Staff_ReplyAccumulatedCash(platform, tokenOrChat, true);
  } catch (e) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ย้อนกลับไม่สำเร็จ]\n" + e.message }], UI_GetAdminHomeQr());
  }
}

function ORD_CalculateUsage() {
  try {
    let props = PropertiesService.getScriptProperties();
    let p15 = parseNum(props.getProperty("pending_15"));
    let p48 = parseNum(props.getProperty("pending_48"));
    let pCan = parseNum(props.getProperty("pending_can"));
    let recentTx = DB_GetRecentTransactions(80);
    let todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
    let today15 = 0, today48 = 0, todayCan = 0;

    for (let i = 0; i < recentTx.length; i++) {
      let tx = recentTx[i];
      let dObj = parseSheetDate(tx.date);
      if (dObj && Utilities.formatDate(dObj, "Asia/Bangkok", "dd/MM/yyyy") === todayStr && tx.status !== "ยกเลิก" && tx.status !== "รอดำเนินการ") {
        today15 += tx.g15 || 0;
        today48 += tx.g48 || 0;
        todayCan += tx.cans || 0;
      }
    }
    let c15 = Math.max(p15, today15), c48 = Math.max(p48, today48), cCan = Math.max(pCan, todayCan);
    return `📦 ยอดเบิกสะสมรอสั่งเข้า Office (${todayStr}):\n` +
           `• ถัง 15 กก.: ${c15} ถัง (วันนี้เบิก ${today15} ถัง)\n` +
           `• ถัง 48 กก.: ${c48} ถัง (วันนี้เบิก ${today48} ถัง)\n` +
           `• แก๊สกระป๋อง: ${cCan} ลัง (วันนี้เบิก ${todayCan} ลัง)\n` +
           (((c15 >= 2) || (c48 >= 2) || (cCan >= 5))
            ? `🚨 แนะนำให้สั่งเติมสต็อกเข้า Office!`
            : `✅ สต็อกเพียงพอ (ยังไม่ถึงเกณฑ์ขั้นต่ำ)`);
  } catch (e) { return "❌ ไม่สามารถคำนวณสต็อกได้: " + e.message; }
}

function buildGasReorderBubble() {
  var props = PropertiesService.getScriptProperties();
  var c15 = parseNum(props.getProperty("pending_15"));
  var c48 = parseNum(props.getProperty("pending_48"));
  var cCan = parseNum(props.getProperty("pending_can"));
  if (c15 < 2 && c48 < 2 && cCan < 5) return null;

  return "🏭 [แจ้งเตือนสั่งแก๊สเข้า Office]\n--------------------------------------\n" +
         "• ถัง 15 กก.: สะสม " + c15 + " ถัง " + (c15 >= 2 ? "🚨 (ครบเกณฑ์ >= 2)" : "⏳") + "\n" +
         "• ถัง 48 กก.: สะสม " + c48 + " ถัง " + (c48 >= 2 ? "🚨 (ครบเกณฑ์ >= 2)" : "⏳") + "\n" +
         "• แก๊สกระป๋อง: สะสม " + cCan + " ลัง " + (cCan >= 5 ? "🚨 (ครบเกณฑ์ >= 5)" : "⏳") + "\n\n" +
         "💡 กดปุ่ม รีเซ็ตถัง เมื่อรับแก๊สเข้าคลังแล้ว";
}
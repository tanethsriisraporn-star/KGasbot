// ==========================================
// 🎨 File: 04_UI_Notifier.gs
// Version: 47.0 (Latest Order Banner, Google Maps URI Button & Full Store Profile Editor Flex)
// Prefix: UI_ / MSG_ / SYS_ / TG_
// หมวด 2: UI, NOTIFIER & DIAGNOSTIC
// ==========================================

function UI_MakeFlexBoxBtn(label, cmd, bgColor, textColor, fontSize, borderColor) {
  let boxObj = {
    type: "box",
    layout: "vertical",
    flex: 1,
    backgroundColor: bgColor || "#F0F8FC",
    cornerRadius: "8px",
    paddingAll: "10px",
    justifyContent: "center",
    alignItems: "center",
    action: {
      type: "message",
      label: String(label || "").substring(0, 20),
      text: cmd
    },
    contents: [
      {
        type: "text",
        text: String(label || "-"),
        size: fontSize || "xs",
        weight: "bold",
        color: textColor || "#111111",
        align: "center",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      }
    ]
  };
  if (borderColor) {
    boxObj.borderColor = borderColor;
    boxObj.borderWidth = "1px";
  }
  return boxObj;
}

/**
 * [GOOGLE MAPS URI BUTTON BUILDER]:
 * สร้างปุ่มกดเปิดลิงก์ภายนอก (เช่น เปิดแอป Google Maps นำทางไปส่งแก๊สทันที)
 */
function UI_MakeFlexUriBtn(label, uriUrl, bgColor, textColor, fontSize, borderColor) {
  let safeUri = (uriUrl && /^https?:\/\//i.test(String(uriUrl).trim()))
                ? String(uriUrl).trim()
                : "https://www.google.com/maps";
  let boxObj = {
    type: "box",
    layout: "vertical",
    flex: 1,
    backgroundColor: bgColor || "#E8F5E9",
    cornerRadius: "8px",
    paddingAll: "10px",
    justifyContent: "center",
    alignItems: "center",
    action: {
      type: "uri",
      label: String(label || "เปิดแผนที่").substring(0, 20),
      uri: safeUri
    },
    contents: [
      {
        type: "text",
        text: String(label || "📍 เปิด Google Maps"),
        size: fontSize || "xs",
        weight: "bold",
        color: textColor || "#1B5E20",
        align: "center",
        maxLines: 1,
        adjustMode: "shrink-to-fit"
      }
    ]
  };
  if (borderColor) {
    boxObj.borderColor = borderColor;
    boxObj.borderWidth = "1px";
  }
  return boxObj;
}

function UI_MakeAppleRowBtn(leftTitle, rightPriceText, cmd, bgColor, borderColor) {
  let rowContents = [
    {
      type: "text",
      text: String(leftTitle || "-"),
      size: "xs",
      weight: "bold",
      color: "#111111",
      flex: rightPriceText ? 4 : 1,
      maxLines: 1,
      adjustMode: "shrink-to-fit"
    }
  ];

  if (rightPriceText) {
    rowContents.push({
      type: "text",
      text: String(rightPriceText),
      size: "xs",
      weight: "bold",
      color: "#1DA1DB",
      align: "end",
      flex: 2,
      maxLines: 1,
      adjustMode: "shrink-to-fit"
    });
  }

  let box = {
    type: "box",
    layout: "horizontal",
    backgroundColor: bgColor || "#F8FBFE",
    cornerRadius: "8px",
    paddingAll: "11px",
    borderColor: borderColor || "#CBE6F6",
    borderWidth: "1px",
    alignItems: "center",
    contents: rowContents
  };

  if (cmd && cmd !== "none") {
    box.action = {
      type: "message",
      label: String(leftTitle || "").substring(0, 20),
      text: cmd
    };
  }
  return box;
}

function UI_GetAdminHomeQr() {
  return [{ type: "action", action: { type: "message", label: "🎛️ เมนูหลัก", text: "1003" } }];
}

function UI_GetStaffHomeQr() {
  return [{ type: "action", action: { type: "message", label: "🚚 ดูคิวส่งแก๊ส", text: "order ส่งแก๊สวันนี้" } }];
}

function UI_GetStoreHomeQr() {
  return [{ type: "action", action: { type: "message", label: "🛒 เมนูสั่งแก๊ส", text: "เลือกประเภทแก๊ส" } }];
}

function UI_FilterToSingleHomeQr(quickReplyItems) {
  if (!quickReplyItems || quickReplyItems.length === 0) return [];
  for (let i = 0; i < quickReplyItems.length; i++) {
    let act = quickReplyItems[i].action;
    if (act && act.text === "1003") return UI_GetAdminHomeQr();
  }
  for (let i = 0; i < quickReplyItems.length; i++) {
    let act = quickReplyItems[i].action;
    if (act && act.text === "order ส่งแก๊สวันนี้") return UI_GetStaffHomeQr();
  }
  for (let i = 0; i < quickReplyItems.length; i++) {
    let act = quickReplyItems[i].action;
    if (act && (act.text === "เลือกประเภทแก๊ส" || act.text.indexOf("เลือกประเภท_") === 0 || act.text === "เปลี่ยนประเภทแก๊ส")) {
      return UI_GetStoreHomeQr();
    }
  }
  return [quickReplyItems[quickReplyItems.length - 1]];
}

function UI_WrapTextAsAppleFlex(rawText) {
  let text = String(rawText || "-").trim();
  if (text.startsWith("#LINK-") || text.startsWith("LINK-") || text.startsWith("StoreID:")) {
    return { type: "text", text: text };
  }

  let lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("---"));
  let headerTitle = "กอ.แก๊ส เชียงใหม่";
  let headerBg = "#1DA1DB";

  if (lines.length > 0) {
    let firstLine = lines[0];
    if (firstLine.startsWith("❌") || firstLine.startsWith("⚠️")) {
      headerBg = "#111111";
    }
    if (lines.length > 1 && firstLine.length <= 48) {
      headerTitle = firstLine.replace(/^\[|\]$/g, "");
      lines = lines.slice(1);
    }
  }

  let bodyText = lines.join("\n") || text;

  return {
    type: "flex",
    altText: text.replace(/\n/g, " ").substring(0, 380),
    fallbackText: text,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerBg,
        paddingAll: "13px",
        contents: [
          {
            type: "text",
            text: headerTitle,
            weight: "bold",
            size: "sm",
            color: "#FFFFFF",
            maxLines: 1,
            adjustMode: "shrink-to-fit"
          }
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
            type: "text",
            text: bodyText,
            size: "xs",
            color: "#111111",
            wrap: true
          }
        ]
      }
    }
  };
}

// ==========================================
// 🍎 APPLE UX 3-STEP ORDERING + LATEST ORDER & CART TRACKER BANNER
// ==========================================

function UI_BuildStoreStep1Flex(storeInfo, pendingDebt, currentCart, isAdminMode, unpaidBillsList) {
  let sName = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId) || "-";
  let stCode = storeInfo.storeId || sName;
  let p15 = storeInfo.price15 || 490;
  let p48 = storeInfo.price48 || 1530;
  let pCan = storeInfo.priceCan || 790;
  let cTerm = storeInfo.creditTerm || "";
  let hasCart = currentCart && ((currentCart.g15 || 0) > 0 || (currentCart.g48 || 0) > 0 || (currentCart.can || 0) > 0);

  let bodyContents = [];

  // 🔔 1. แจ้งเตือน "ออเดอร์ล่าสุดที่สั่งไปแล้ว" (ป้องกันการเผลอกดสั่งซ้ำโดยไม่รู้ตัว)
  let latestOrder = (typeof DB_GetLatestStoreOrderInfo === "function") ? DB_GetLatestStoreOrderInfo(sName) : null;
  if (latestOrder) {
    let bgLatest = latestOrder.isPendingQueue ? "#E3F2FD" : "#E8F5E9";
    let borderLatest = latestOrder.isPendingQueue ? "#90CAF9" : "#A5D6A7";
    let titleColor = latestOrder.isPendingQueue ? "#0277BD" : "#2E7D32";

    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: bgLatest,
      borderColor: borderLatest,
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      contents: [
        { type: "text", text: latestOrder.statusLabel, size: "xs", weight: "bold", color: titleColor, maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `🔖 ${latestOrder.orderId} : ${latestOrder.itemDesc} (${latestOrder.total.toLocaleString("en")} บ.)`, size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `⏰ เวลา: ${latestOrder.timeStr}`, size: "xxs", color: "#555555", maxLines: 1 }
      ]
    });
    bodyContents.push({ type: "separator", margin: "sm", color: "#E5E5E5" });
  }

  // 🧺 2. หากมีตะกร้าที่เลือกค้างไว้แต่ยังไม่ได้กดยืนยัน แจ้งรายละเอียดตะกร้าเดิมก่อนทันที
  if (hasCart) {
    let cartItemsTxt = [];
    if (currentCart.g15 > 0) cartItemsTxt.push(`15กก.(${currentCart.g15} ถัง)`);
    if (currentCart.g48 > 0) cartItemsTxt.push(`48กก.(${currentCart.g48} ถัง)`);
    if (currentCart.can > 0) cartItemsTxt.push(`กระป๋อง(${currentCart.can} ลัง)`);
    let cartSum = ((currentCart.g15 || 0) * p15) + ((currentCart.g48 || 0) * p48) + ((currentCart.can || 0) * pCan);

    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFF8E1",
      borderColor: "#FFE082",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      contents: [
        { type: "text", text: "🧺 รายการในตะกร้าที่เลือกค้างไว้ (ยังไม่ยืนยัน):", size: "xs", weight: "bold", color: "#E65100", maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: `📦 ${cartItemsTxt.join(", ")} = ${cartSum.toLocaleString("en")} บาท`, size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          margin: "sm",
          contents: [
            UI_MakeFlexBoxBtn("✅ ยืนยันสั่งตะกร้านี้", "ยืนยันสั่งซื้อ", "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("🗑️ ล้างตะกร้า", "ล้างตะกร้า", "#FFFFFF", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      ]
    });
    bodyContents.push({ type: "separator", margin: "sm", color: "#E5E5E5" });
  }

  // 💳 3. แสดงยอดค้างชำระ (ถ้ามี)
  if (pendingDebt && pendingDebt > 0) {
    let debtTitle = (cTerm === "15" || cTerm === "30") ? `🧾 ยอดวางบิลเครดิต ${cTerm} วัน` : "💳 ยอดค้างชำระ";
    let debtBoxContents = [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: debtTitle, size: "xs", weight: "bold", color: "#B71C1C", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `${pendingDebt.toLocaleString("en")} บาท`, size: "xs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      }
    ];

    if (unpaidBillsList && unpaidBillsList.length > 0) {
      let showLimit = Math.min(unpaidBillsList.length, 3);
      for (let i = 0; i < showLimit; i++) {
        let b = unpaidBillsList[i];
        let shortD = b.shortDateStr || String(b.dateStr || "").replace(/\/20(\d{2})$/, "/$1");
        debtBoxContents.push({
          type: "box",
          layout: "horizontal",
          margin: "xs",
          contents: [
            { type: "text", text: `• ${b.orderId} (${shortD})`, size: "xs", color: "#333333", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `${b.amount.toLocaleString("en")} บ.`, size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        });
      }
      if (unpaidBillsList.length > 3) {
        debtBoxContents.push({
          type: "text",
          text: `...และอีก ${unpaidBillsList.length - 3} บิล`,
          size: "xxs",
          color: "#666666",
          margin: "xs",
          maxLines: 1
        });
      }
    }

    if (isAdminMode && unpaidBillsList && unpaidBillsList.length > 0) {
      let firstRowKey = "ROW-" + unpaidBillsList[0].rowIdx;
      debtBoxContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        margin: "sm",
        contents: [
          UI_MakeFlexBoxBtn("📲 จับคู่สลิป", `match ${firstRowKey}`, "#0288D1", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("✅ ชำระแล้ว", `setstatus_${firstRowKey}_ชำระแล้ว`, "#111111", "#FFFFFF", "xs")
        ]
      });
      debtBoxContents.push({
        type: "box",
        layout: "horizontal",
        margin: "xs",
        contents: [
          UI_MakeFlexBoxBtn("📄 ดูใบแจ้งหนี้ (รูปภาพ)", `ขอดูใบแจ้งหนี้ ${stCode}`, "#FFFFFF", "#111111", "xs", "#CBE6F6")
        ]
      });
    } else {
      debtBoxContents.push({
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        margin: "sm",
        contents: [
          UI_MakeFlexBoxBtn("💳 ดูรายการบิล", "เช็คบิลหนี้ค้าง", "#FFFFFF", "#B71C1C", "xs", "#FFCC80"),
          UI_MakeFlexBoxBtn("📄 ดูใบแจ้งหนี้", `ขอดูใบแจ้งหนี้ ${stCode}`, "#111111", "#FFFFFF", "xs")
        ]
      });
    }

    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFF8F0",
      borderColor: "#FFCC80",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      contents: debtBoxContents
    });
    bodyContents.push({ type: "separator", margin: "md", color: "#E5E5E5" });
  }

  // 🛒 4. รายการปุ่มเลือกสั่งแก๊ส
  bodyContents.push(
    { type: "text", text: "🛒 เลือกประเภทแก๊สที่ต้องการสั่ง", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 },
    UI_MakeAppleRowBtn("📦 แก๊สถัง 15 กก.", `${p15.toLocaleString("en")} บ./ถัง`, "เลือกประเภท_15"),
    UI_MakeAppleRowBtn("📦 แก๊สถัง 48 กก.", `${p48.toLocaleString("en")} บ./ถัง`, "เลือกประเภท_48"),
    UI_MakeAppleRowBtn("🥫 แก๊สกระป๋อง", `${pCan.toLocaleString("en")} บ./ลัง`, "เลือกประเภท_can")
  );

  if (isAdminMode) {
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      margin: "sm",
      contents: [
        UI_MakeFlexBoxBtn("🧾 แก้หัวบิล", `ตั้งหัวบิล_${stCode}`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn("📋 แก้ข้อมูลร้าน", `จัดการร้าน_${stCode}`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn("🔄 เปลี่ยนร้าน", "admin_order", "#F4F5F7", "#333333", "xxs")
      ]
    });
  }

  let flexMsg = {
    type: "flex",
    altText: `🏪 ${sName}`,
    fallbackText: `🏪 [${sName}]\n💰 เรทราคา: 15กก.=${p15} | 48กก.=${p48} | กระป๋อง=${pCan}`,
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
          { type: "text", text: `🏪 ${sName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `15กก.=${p15} | 48กก.=${p48} | กระป๋อง=${pCan}`, size: "xxs", color: "#FFFFFF", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  return { flexMsg: flexMsg, qr: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
}

function UI_BuildStoreStep2QtyFlex(storeInfo, itemType, isAdminMode) {
  let sName = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId) || "-";
  if (itemType === "can") {
    let pCan = storeInfo.priceCan || 790;
    let flexCan = {
      type: "flex",
      altText: `🥫 เลือกจำนวนแก๊สกระป๋อง (${sName})`,
      fallbackText: `🥫 [สั่งแก๊สกระป๋อง (${pCan} บ./ลัง)] เลือกจำนวนลังที่ต้องการ:`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: `🥫 สั่งแก๊สกระป๋อง (${pCan.toLocaleString("en")} บ./ลัง)`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `🏪 ${sName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "แตะเลือกจำนวนลัง (หรือพิมพ์ตัวเลขได้เลยค่ะ)", size: "xs", weight: "bold", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
            UI_MakeAppleRowBtn("🥫 จำนวน 1 ลัง", `${(pCan * 1).toLocaleString("en")} บาท`, "เลือกจำนวน_can_1"),
            UI_MakeAppleRowBtn("🥫 จำนวน 5 ลัง", `${(pCan * 5).toLocaleString("en")} บาท`, "เลือกจำนวน_can_5"),
            UI_MakeAppleRowBtn("🥫 จำนวน 10 ลัง", `${(pCan * 10).toLocaleString("en")} บาท`, "เลือกจำนวน_can_10"),
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("🔙 เปลี่ยนประเภทแก๊ส", "เปลี่ยนประเภทแก๊ส", "#F4F5F7", "#333333", "xs")
          ]
        }
      }
    };
    return { flexMsg: flexCan, qr: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
  }

  let is48 = (itemType === "48");
  let unitPrice = is48 ? (storeInfo.price48 || 1530) : (storeInfo.price15 || 490);
  let sizeLabel = is48 ? "48 กก." : "15 กก.";
  let cmdPrefix = is48 ? "เลือกจำนวน_48_" : "เลือกจำนวน_15_";

  let flexCyl = {
    type: "flex",
    altText: `📦 เลือกจำนวนแก๊สถัง ${sizeLabel}`,
    fallbackText: `📦 [สั่งแก๊สถัง ${sizeLabel} (${unitPrice} บ./ถัง)] เลือกจำนวนถังที่ต้องการ:`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `📦 สั่งแก๊สถัง ${sizeLabel} (${unitPrice.toLocaleString("en")} บ./ถัง)`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `🏪 ${sName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "แตะเลือกจำนวนถัง (หรือพิมพ์ตัวเลขได้เลยค่ะ)", size: "xs", weight: "bold", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn(`📦 1 ถัง (${(unitPrice * 1).toLocaleString("en")}บ.)`, `${cmdPrefix}1`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn(`📦 2 ถัง (${(unitPrice * 2).toLocaleString("en")}บ.)`, `${cmdPrefix}2`, "#F0F8FC", "#111111", "xs", "#CBE6F6")
            ]
          },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn(`📦 3 ถัง (${(unitPrice * 3).toLocaleString("en")}บ.)`, `${cmdPrefix}3`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn(`📦 4 ถัง (${(unitPrice * 4).toLocaleString("en")}บ.)`, `${cmdPrefix}4`, "#F0F8FC", "#111111", "xs", "#CBE6F6")
            ]
          },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("🔙 เปลี่ยนประเภทแก๊ส", "เปลี่ยนประเภทแก๊ส", "#F4F5F7", "#333333", "xs")
        ]
      }
    }
  };
  return { flexMsg: flexCyl, qr: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
}

function UI_BuildStoreStep3CheckoutFlex(storeInfo, cart, pendingDebt, isAdminMode) {
  let sName = DB_CleanStorePrefix(storeInfo.storeName || cart.store, storeInfo.storeId) || "-";
  let p15 = storeInfo.price15 || 490;
  let p48 = storeInfo.price48 || 1530;
  let pCan = storeInfo.priceCan || 790;
  let totalAmt = ((cart.g15 || 0) * p15) + ((cart.g48 || 0) * p48) + ((cart.can || 0) * pCan);

  let itemRows = [];
  if (cart.g15 > 0) itemRows.push(UI_MakeAppleRowBtn(`• ถัง 15 กก. (x ${cart.g15})`, `${(cart.g15 * p15).toLocaleString("en")} บาท`, "none", "#FFFFFF", "#FFFFFF"));
  if (cart.g48 > 0) itemRows.push(UI_MakeAppleRowBtn(`• ถัง 48 กก. (x ${cart.g48})`, `${(cart.g48 * p48).toLocaleString("en")} บาท`, "none", "#FFFFFF", "#FFFFFF"));
  if (cart.can > 0) itemRows.push(UI_MakeAppleRowBtn(`• แก๊สกระป๋อง (x ${cart.can})`, `${(cart.can * pCan).toLocaleString("en")} บาท`, "none", "#FFFFFF", "#FFFFFF"));

  let nowHour = parseInt(Utilities.formatDate(new Date(), "Asia/Bangkok", "HH"), 10);
  if (nowHour >= 20 || nowHour < 9) {
    itemRows.push({
      type: "box", layout: "vertical", backgroundColor: "#FFF8E1", cornerRadius: "6px", paddingAll: "8px", margin: "sm",
      contents: [{ type: "text", text: "🌙 สั่งหลัง 20:00 น. จัดเป็นคิวส่งพรุ่งนี้ 09:00 น.", size: "xxs", weight: "bold", color: "#E65100", align: "center", maxLines: 1, adjustMode: "shrink-to-fit" }]
    });
  }

  let bodyContents = itemRows.concat([
    { type: "separator", margin: "md", color: "#CCCCCC" },
    {
      type: "box", layout: "horizontal", margin: "md",
      contents: [
        { type: "text", text: "ยอดรวมสุทธิ", size: "sm", weight: "bold", color: "#111111", flex: 2, maxLines: 1 },
        { type: "text", text: `${totalAmt.toLocaleString("en")} บาท`, size: "md", weight: "bold", color: "#1DA1DB", align: "end", flex: 3, maxLines: 1 }
      ]
    },
    { type: "separator", margin: "md", color: "#E5E5E5" },
    UI_MakeFlexBoxBtn("✅ ยืนยันสั่งซื้อ (ส่งออร์เดอร์)", "ยืนยันสั่งซื้อ", "#1DA1DB", "#FFFFFF", "sm"),
    {
      type: "box", layout: "horizontal", spacing: "sm",
      contents: [
        UI_MakeFlexBoxBtn("➕ สั่งเพิ่ม", "สั่งรายการอื่นเพิ่ม", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
        UI_MakeFlexBoxBtn("🗑️ ล้างตะกร้า", "ล้างตะกร้า", "#F4F5F7", "#B71C1C", "xs")
      ]
    }
  ]);

  let flexCheckout = {
    type: "flex",
    altText: `🧺 สรุปรายการสั่งแก๊ส ${totalAmt.toLocaleString("en")} บาท`,
    fallbackText: `🧺 [สรุปรายการสั่งแก๊ส: ${sName}]\n💰 ยอดรวมสุทธิ: ${totalAmt.toLocaleString("en")} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "สรุปรายการสั่งแก๊ส", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${sName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  return { flexMsg: flexCheckout, qr: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
}

// ==========================================
// 📋 FULL STORE PROFILE & BILLING HEADER EDITOR FLEX CARD
// ==========================================

function UI_BuildStoreFullEditorFlex(storeData) {
  let st = storeData;
  let cleanTitle = DB_CleanStorePrefix(st.storeName, st.storeId);
  let cTerm = st.creditTerm ? `เครดิต ${st.creditTerm} วัน` : "สด/โอนรายบิล";
  let mapUri = (typeof DB_GetStoreGoogleMapUri === "function") ? DB_GetStoreGoogleMapUri(st) : "https://www.google.com/maps";

  let flexMsg = {
    type: "flex",
    altText: `📋 จัดการข้อมูลร้าน ${cleanTitle}`,
    fallbackText: `📋 [จัดการข้อมูลร้าน: ${cleanTitle}]\nหัวบิล: ${st.billingName}\nราคา: 15กก.=${st.price15} | 48กก.=${st.price48} | กระป๋อง=${st.priceCan}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `📋 จัดการข้อมูลร้าน (${st.storeId})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${cleanTitle}`, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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
            layout: "vertical",
            backgroundColor: "#F8FBFE",
            borderColor: "#CBE6F6",
            borderWidth: "1px",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "🧾 หัวบิลทางการ (BillingName):", size: "xxs", weight: "bold", color: "#0288D1", maxLines: 1 },
              { type: "text", text: String(st.billingName || cleanTitle), size: "xs", weight: "bold", color: "#111111", wrap: true, margin: "xs" },
              { type: "text", text: `📞 โทร: ${st.phone} | 💳 รอบบิล: ${cTerm}`, size: "xxs", color: "#555555", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
              { type: "text", text: `📍 พิกัด: ${st.mapLink}`, size: "xxs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" }
            ]
          },
          UI_MakeFlexBoxBtn("🧾 ตั้งหัวบิลบริษัท 3 ขั้นตอน (ชื่อ/ที่อยู่/เลขภาษี)", `ตั้งหัวบิล_${st.storeId}`, "#1DA1DB", "#FFFFFF", "xs"),
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          { type: "text", text: "แตะช่องที่ต้องการแก้ไขทีละรายการ:", size: "xxs", weight: "bold", color: "#555555", margin: "xs", maxLines: 1 },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            contents: [
              UI_MakeFlexBoxBtn(`15กก. (${st.price15})`, `แก้ช่อง_${st.storeId}_price15`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
              UI_MakeFlexBoxBtn(`48กก. (${st.price48})`, `แก้ช่อง_${st.storeId}_price48`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
              UI_MakeFlexBoxBtn(`กระป๋อง (${st.priceCan})`, `แก้ช่อง_${st.storeId}_pricecan`, "#F0F8FC", "#111111", "xxs", "#CBE6F6")
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            contents: [
              UI_MakeFlexBoxBtn("✏️ แก้ชื่อร้าน", `แก้ช่อง_${st.storeId}_storename`, "#F4F5F7", "#111111", "xxs"),
              UI_MakeFlexBoxBtn("📞 แก้เบอร์โทร", `แก้ช่อง_${st.storeId}_phone`, "#F4F5F7", "#111111", "xxs"),
              UI_MakeFlexBoxBtn("🏷️ แก้ฉายาร้าน", `แก้ช่อง_${st.storeId}_alias`, "#F4F5F7", "#111111", "xxs")
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            contents: [
              UI_MakeFlexBoxBtn("📍 แก้ลิงก์ Google Map", `แก้ช่อง_${st.storeId}_googlemap`, "#E8F5E9", "#1B5E20", "xxs", "#A5D6A7"),
              UI_MakeFlexUriBtn("🗺️ ทดสอบเปิด Map", mapUri, "#FFFFFF", "#1B5E20", "xxs", "#A5D6A7")
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            contents: [
              UI_MakeFlexBoxBtn("💵 สด/โอน", `setcredit_${st.storeId}_0`, "#F4F5F7", "#111111", "xxs"),
              UI_MakeFlexBoxBtn("🧾 เครดิต 15 วัน", `setcredit_${st.storeId}_15`, "#F4F5F7", "#111111", "xxs"),
              UI_MakeFlexBoxBtn("🧾 เครดิต 30 วัน", `setcredit_${st.storeId}_30`, "#F4F5F7", "#111111", "xxs")
            ]
          },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("📋 ขอดู Template ข้อมูลร้านนี้ (ก๊อปปี้แก้ทั้งแถว)", `ขอเทมเพลต_${st.storeId}`, "#111111", "#FFFFFF", "xxs"),
          UI_MakeFlexBoxBtn("🛒 ไปหน้าสั่งแก๊สร้านนี้", `#เลือกร้าน-${st.storeId}`, "#F0F8FC", "#1DA1DB", "xs", "#1DA1DB")
        ]
      }
    }
  };

  return { flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

// ==========================================
// 🎛️ ADMIN DASHBOARD FLEX CARD (1003)
// ==========================================

function UI_BuildAdminFlexCard() {
  let makeBoxBtn = UI_MakeFlexBoxBtn;

  let flexContents = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1DA1DB",
      paddingAll: "15px",
      contents: [
        { type: "text", text: "กอ.แก๊ส เชียงใหม่", weight: "bold", size: "xl", color: "#FFFFFF", maxLines: 1 },
        { type: "text", text: "“แก๊สหมดนึกถึงเรา” • Line : @kgas", size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "13px",
      backgroundColor: "#FFFFFF",
      contents: [
        { type: "text", text: "🛒 หมวดปฏิบัติการและทีมรับออเดอร์", weight: "bold", size: "xs", color: "#111111", maxLines: 1 },
        makeBoxBtn("🛒 สั่งแก๊สแทนลูกค้า / แก้ข้อมูลร้าน", "admin_order", "#1DA1DB", "#FFFFFF", "sm"),
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("🚚 คิวส่งแก๊ส", "order ส่งแก๊สวันนี้", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            makeBoxBtn("💵 เงินสดรอฝาก", "เงินสดรอฝาก", "#F0F8FC", "#111111", "xs", "#CBE6F6")
          ]
        },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("🏭 เช็ค stock", "store_stock", "#F4F5F7", "#222222", "xs"),
            makeBoxBtn("🔄 รีเซ็ตถัง", "resetgas", "#F4F5F7", "#222222", "xs")
          ]
        },
        { type: "separator", margin: "md", color: "#E5E5E5" },
        { type: "text", text: "📊 หมวดรายงานยอดขาย (SALES REPORTS)", weight: "bold", size: "xs", color: "#111111", margin: "sm", maxLines: 1 },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("📅 Today", "today", "#111111", "#FFFFFF", "xs"),
            makeBoxBtn("⏪ Yesterday", "yesterday", "#F4F5F7", "#111111", "xs")
          ]
        },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("📆 Weekly", "weekly", "#F4F5F7", "#111111", "xs"),
            makeBoxBtn("🗓️ Monthly", "monthly", "#F4F5F7", "#111111", "xs")
          ]
        },
        { type: "separator", margin: "md", color: "#E5E5E5" },
        { type: "text", text: "💰 หมวดการเงินและวางบิลเครดิต", weight: "bold", size: "xs", color: "#111111", margin: "sm", maxLines: 1 },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("📋 บิลรอโอน", "pending", "#0288D1", "#FFFFFF", "xs"),
            makeBoxBtn("💵 เงินรอฝากรายคน", "เงินรอฝากรายคน", "#F0F8FC", "#111111", "xs", "#CBE6F6")
          ]
        },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("🧾 เครดิต 15 วัน", "invoice15", "#F4F5F7", "#111111", "xs"),
            makeBoxBtn("🧾 เครดิต 30 วัน", "invoice30", "#F4F5F7", "#111111", "xs")
          ]
        },
        makeBoxBtn("📊 สรุปลูกหนี้รวมทั้งหมด", "debt", "#F4F5F7", "#111111", "xs"),
        { type: "separator", margin: "md", color: "#E5E5E5" },
        { type: "text", text: "⚙️ หมวดงานช่างและตั้งค่าระบบ", weight: "bold", size: "xs", color: "#111111", margin: "sm", maxLines: 1 },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("🔗 โค้ดผูกห้อง/แก้หัวบิล", "menu_autolink", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            makeBoxBtn("🔌 ยกเลิกผูกห้อง", "menu_unlink_list", "#FFF3E0", "#E65100", "xs", "#FFCC80")
          ]
        },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("⚙️ ตั้งค่าผู้ส่งแก๊ส", "ตั้งค่าทีมรับออเดอร์", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            makeBoxBtn("➕ สมัครร้านค้าใหม่", "register_store", "#1DA1DB", "#FFFFFF", "xs")
          ]
        },
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            makeBoxBtn("🛠️ ประเมินราคาท่อ", "estimate", "#F4F5F7", "#111111", "xs"),
            makeBoxBtn("🩺 เช็คระบบ / ซ่อมวันที่", "diagnostic", "#111111", "#FFFFFF", "xs")
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F0F8FC",
      paddingAll: "10px",
      contents: [
        {
          type: "text",
          text: "📞 084-1965919, 085-0375760 • เปิด 09:00–20:00 น.",
          size: "xxs",
          color: "#555555",
          align: "center",
          maxLines: 1,
          adjustMode: "shrink-to-fit"
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "🎛️ แผงควบคุมระบบ กอ.แก๊ส เชียงใหม่ (K.Gas Admin)",
    contents: flexContents
  };
}

function UI_BuildAllStoresDirectory(allStores, page) {
  if (!allStores || allStores.length === 0) {
    return {
      flexMsg: UI_WrapTextAsAppleFlex("🛒 [สั่งแก๊สแทนลูกค้า]\n❌ ยังไม่มีรายชื่อร้านค้าในระบบ กรุณากดสมัครร้านค้าใหม่ก่อนครับ"),
      qr: UI_GetAdminHomeQr()
    };
  }

  let pageSize = 8;
  let totalPages = Math.ceil(allStores.length / pageSize);
  let curPage = Math.max(1, Math.min(page || 1, totalPages));
  let startIdx = (curPage - 1) * pageSize;
  let pageStores = allStores.slice(startIdx, startIdx + pageSize);

  let rows = [];
  let fallbackLines = [`🛒 [เลือกร้านค้าเพื่อสั่งแก๊ส หน้า ${curPage}/${totalPages}]`];

  for (let i = 0; i < pageStores.length; i++) {
    let st = pageStores[i];
    let cleanTitle = DB_CleanStorePrefix(st.storeName, st.storeId);
    let termTag = st.creditTerm ? ` • เครดิต ${st.creditTerm} วัน` : "";
    let priceLine = `15กก.=${st.price15} | 48กก.=${st.price48} | กระป๋อง=${st.priceCan}${termTag}`;
    fallbackLines.push(`${cleanTitle} (${priceLine})`);

    rows.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8FBFE",
      borderColor: "#CBE6F6",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      action: { type: "message", label: `${st.storeId}`.substring(0, 20), text: `#เลือกร้าน-${st.storeId}` },
      contents: [
        { type: "text", text: cleanTitle, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: priceLine, size: "xxs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
      ]
    });
  }

  let navButtons = [];
  if (curPage > 1) {
    navButtons.push(UI_MakeFlexBoxBtn(`⬅️ หน้า ${curPage - 1}/${totalPages}`, `admin_order_page_${curPage - 1}`, "#F4F5F7", "#111111", "xs"));
  }
  if (curPage < totalPages) {
    navButtons.push(UI_MakeFlexBoxBtn(`➡️ หน้า ${curPage + 1}/${totalPages}`, `admin_order_page_${curPage + 1}`, "#1DA1DB", "#FFFFFF", "xs"));
  }
  if (navButtons.length > 0) rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: navButtons });

  let flexMsg = {
    type: "flex",
    altText: `🛒 เลือกร้านค้าสั่งแก๊ส (หน้า ${curPage}/${totalPages})`,
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
          { type: "text", text: `🛒 เลือกร้านค้าเพื่อสั่งแก๊ส (${curPage}/${totalPages})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `ทั้งหมด ${allStores.length} ร้าน • แตะชื่อร้านหรือพิมพ์ค้นหาได้เลย`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  return { text: fallbackLines.join("\n"), flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildAutoLinkMenu(allStores, page) {
  let pageSize = 8;
  let stores = allStores || [];
  let totalPages = Math.max(1, Math.ceil(stores.length / pageSize));
  let curPage = Math.max(1, Math.min(page || 1, totalPages));
  let startIdx = (curPage - 1) * pageSize;
  let pageStores = stores.slice(startIdx, startIdx + pageSize);

  let bodyRows = [
    {
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      contents: [
        UI_MakeFlexBoxBtn("👷 ผูกโค้ดทีมรับออเดอร์", "genlink_staff", "#111111", "#FFFFFF", "xxs"),
        UI_MakeFlexBoxBtn("👑 โค้ดห้อง Admin", "genlink_admin", "#111111", "#FFFFFF", "xxs")
      ]
    },
    UI_MakeFlexBoxBtn("⚙️ ตั้งค่าผู้ส่งแก๊ส (เพิ่ม/ลดชื่อผู้ส่ง)", "ตั้งค่าทีมรับออเดอร์", "#F0F8FC", "#1DA1DB", "xs", "#1DA1DB"),
    { type: "separator", margin: "sm", color: "#E5E5E5" }
  ];

  let fallbackLines = [`🔗 [สร้างรหัสผูกห้อง & แก้ไขข้อมูลร้าน (หน้า ${curPage}/${totalPages})]`];

  for (let i = 0; i < pageStores.length; i++) {
    let st = pageStores[i];
    let cleanTitle = DB_CleanStorePrefix(st.storeName, st.storeId);
    let rightBadge = st.creditTerm ? `เครดิต ${st.creditTerm} วัน` : (st.groupId ? "🟢 ผูกแล้ว" : "ตั้งค่า");
    fallbackLines.push(`• ${cleanTitle}`);

    bodyRows.push(UI_MakeAppleRowBtn(cleanTitle, rightBadge, `#สร้างโค้ดร้าน-${st.storeId}`));
  }

  let navBtns = [];
  if (curPage > 1) {
    navBtns.push(UI_MakeFlexBoxBtn(`⬅️ หน้า ${curPage - 1}/${totalPages}`, `menu_autolink_page_${curPage - 1}`, "#F4F5F7", "#111111", "xs"));
  }
  if (curPage < totalPages) {
    navBtns.push(UI_MakeFlexBoxBtn(`➡️ หน้า ${curPage + 1}/${totalPages}`, `menu_autolink_page_${curPage + 1}`, "#1DA1DB", "#FFFFFF", "xs"));
  }
  if (navBtns.length > 0) bodyRows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: navBtns });

  let flexMsg = {
    type: "flex",
    altText: `🔗 รหัสผูกห้อง & แก้ข้อมูลร้าน (${curPage}/${totalPages})`,
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
          { type: "text", text: `🔗 ผูกห้อง / แก้หัวบิล (${curPage}/${totalPages})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "แตะชื่อร้านเพื่อรับโค้ดผูกห้อง ตั้งหัวบิล หรือแก้ข้อมูลร้าน", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: "#FFFFFF",
        contents: bodyRows
      }
    }
  };

  return { text: fallbackLines.join("\n"), flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildStaffSettingsFlex(driversList) {
  let list = driversList || DB_GetStaffDrivers();
  let rows = [
    { type: "text", text: `รายชื่อทีมรับออเดอร์ปัจจุบัน (${list.length} คน):`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
    { type: "text", text: "แตะที่ชื่อเพื่อลบออก หรือกดปุ่ม ➕ ด้านล่างเพื่อเพิ่ม", size: "xxs", color: "#666666", maxLines: 1, adjustMode: "shrink-to-fit" }
  ];

  for (let i = 0; i < list.length; i++) {
    let name = list[i];
    rows.push(UI_MakeAppleRowBtn(`${i + 1}. ${name}`, "➖ ลบชื่อนี้", `ลบพนักงาน_${name}`, "#F8FBFE", "#CBE6F6"));
  }

  rows.push({ type: "separator", margin: "md", color: "#E5E5E5" });
  rows.push(UI_MakeFlexBoxBtn("➕ เพิ่มพนักงานใหม่", "staff_add_mode", "#1DA1DB", "#FFFFFF", "xs"));
  rows.push({
    type: "box", layout: "horizontal", spacing: "sm",
    contents: [
      UI_MakeFlexBoxBtn("👷 ผูกโค้ดทีมรับออเดอร์", "genlink_staff", "#111111", "#FFFFFF", "xxs"),
      UI_MakeFlexBoxBtn("🔙 กลับหน้าผูกห้อง", "menu_autolink", "#F4F5F7", "#111111", "xxs")
    ]
  });

  let flexMsg = {
    type: "flex",
    altText: "⚙️ ตั้งค่าทีมรับออเดอร์ (เพิ่ม/ลดพนักงาน)",
    fallbackText: `⚙️ รายชื่อทีมรับออเดอร์ปัจจุบัน: ${list.join(", ")}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "⚙️ ตั้งค่าทีมรับออเดอร์", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "เพิ่ม/ลดรายชื่อผู้ส่งแก๊สสำหรับแสดงบนการ์ดจบงาน", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  return { flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildStorePairingCodeFlex(storeData) {
  let cleanTitle = DB_CleanStorePrefix(storeData.storeName, storeData.storeId);
  let cTerm = storeData.creditTerm ? `เครดิต ${storeData.creditTerm} วัน` : "ร้านปกติ (สด/โอนรายบิล)";
  let flexMsg = {
    type: "flex",
    altText: `🔗 รหัสผูกห้อง & ตั้งค่าร้าน ${cleanTitle}`,
    fallbackText: `🏪 ร้าน: ${cleanTitle}\nรหัสผูกห้อง: #LINK-${storeData.storeId}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🔗 รหัสผูกห้อง & ตั้งค่าข้อมูลร้าน", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${cleanTitle}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `สถานะการเงิน: ${cTerm}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
          { type: "text", text: `🧾 หัวบิล: ${storeData.billingName}`, size: "xxs", color: "#555555", wrap: true },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("🧾 ตั้งค่าหัวบิลบริษัท (ชื่อ/ที่อยู่/เลขภาษี)", `ตั้งหัวบิล_${storeData.storeId}`, "#111111", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("📋 แก้ไขข้อมูลร้านค้าทุกช่อง / Template", `จัดการร้าน_${storeData.storeId}`, "#1DA1DB", "#FFFFFF", "xs"),
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn("🧾 เครดิต 15 วัน", `setcredit_${storeData.storeId}_15`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("🧾 เครดิต 30 วัน", `setcredit_${storeData.storeId}_30`, "#F0F8FC", "#111111", "xs", "#CBE6F6")
            ]
          },
          UI_MakeFlexBoxBtn("💵 ตั้งเป็นร้านปกติ (เงินสด / โอนรายบิล)", `setcredit_${storeData.storeId}_0`, "#F4F5F7", "#111111", "xs"),
          UI_MakeFlexBoxBtn("🔙 เลือกร้านอื่น", "menu_autolink", "#F8FBFE", "#1DA1DB", "xs", "#CBE6F6")
        ]
      }
    }
  };

  return { flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildUnlinkStoresFlex(linkedStores, page) {
  let list = linkedStores || [];
  if (list.length === 0) {
    let emptyFlex = {
      type: "flex",
      altText: "🔌 ยกเลิกผูกห้องร้านค้า",
      fallbackText: "🔌 ปัจจุบันยังไม่มีร้านค้าที่ผูกห้อง LINE อยู่ในระบบครับ",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🔌 จัดการยกเลิกผูกห้องร้านค้า", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          paddingAll: "16px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "✨ ปัจจุบันไม่มีร้านค้าที่ผูกห้องค้างไว้ครับ", size: "xs", color: "#333333", align: "center", maxLines: 1 },
            UI_MakeFlexBoxBtn("🎛️ กลับเมนูหลัก", "1003", "#111111", "#FFFFFF", "xs")
          ]
        }
      }
    };
    return { flexMsg: emptyFlex, qr: UI_GetAdminHomeQr() };
  }

  let pageSize = 8;
  let totalPages = Math.ceil(list.length / pageSize);
  let curPage = Math.max(1, Math.min(page || 1, totalPages));
  let startIdx = (curPage - 1) * pageSize;
  let pageItems = list.slice(startIdx, startIdx + pageSize);

  let rows = [
    { type: "text", text: "แตะชื่อร้านด้านล่างเพื่อยกเลิกผูกห้องจากหน้า Admin ทันที", size: "xxs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" }
  ];

  for (let i = 0; i < pageItems.length; i++) {
    let item = pageItems[i];
    rows.push(UI_MakeAppleRowBtn(`🔌 ${DB_CleanStorePrefix(item.name, item.targetId)}`, "กดยกเลิก", `admin_unlink_${item.targetId}`, "#FFF8F0", "#FFCC80"));
  }

  let navBtns = [];
  if (curPage > 1) {
    navBtns.push(UI_MakeFlexBoxBtn(`⬅️ หน้า ${curPage - 1}/${totalPages}`, `menu_unlink_page_${curPage - 1}`, "#F4F5F7", "#111111", "xs"));
  }
  if (curPage < totalPages) {
    navBtns.push(UI_MakeFlexBoxBtn(`➡️ หน้าถัดไป (${curPage + 1}/${totalPages})`, `menu_unlink_page_${curPage + 1}`, "#111111", "#FFFFFF", "xs"));
  }
  if (navBtns.length > 0) rows.push({ type: "box", layout: "horizontal", spacing: "sm", margin: "sm", contents: navBtns });

  let flexMsg = {
    type: "flex",
    altText: `🔌 ยกเลิกผูกห้องร้านค้า (${list.length} ร้าน)`,
    fallbackText: `🔌 รายชื่อร้านค้าที่ผูกห้องอยู่ (${list.length} ร้าน)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `🔌 ยกเลิกผูกห้องร้านค้า (${curPage}/${totalPages})`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `แสดงเฉพาะร้านที่ผูกห้องอยู่ในระบบ (${list.length} ร้าน)`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
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

  return { flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildAdminFaqText() {
  let text = "📖 [คู่มือการใช้งานระบบ กอ.แก๊ส เชียงใหม่ V.47.0]\n" +
             "--------------------------------------\n" +
             "👷 1. ห้องทีมรับออเดอร์ & Google Maps:\n" +
             "• การ์ดคิวส่งแก๊สสีดำ-เขียว มีปุ่มกด '📍 เปิดนำทาง Google Maps' และปุ่มแก้หัวบิลหน้างาน\n\n" +
             "🧾 2. แก้ไขหัวบิล & ข้อมูลร้านค้า:\n" +
             "• กดปุ่ม '🔗 โค้ดผูกห้อง/แก้หัวบิล' แล้วแตะชื่อร้าน เพื่อตั้งหัวบิล 3 ขั้นตอน หรือแก้ข้อมูลร้านทุกช่อง";

  let flexFaq = {
    type: "flex",
    altText: "📖 คู่มือการใช้งานแอดมิน (FAQ)",
    fallbackText: text,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📖 คู่มือการใช้งานแอดมิน (FAQ)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "กอ.แก๊ส เชียงใหม่ • Apple Dynamic Flex V.47.0", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: text, size: "xs", color: "#222222", wrap: true },
          UI_MakeFlexBoxBtn("🔗 ไปหน้าผูกห้อง / แก้ข้อมูลร้าน", "menu_autolink", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
          UI_MakeFlexBoxBtn("🎛️ กลับเมนูหลัก", "1003", "#111111", "#FFFFFF", "xs")
        ]
      }
    }
  };

  return { text: text, flexMsg: flexFaq, qr: UI_GetAdminHomeQr() };
}

function UI_BuildAdminMenu() {
  let text = "🎛️ [แผงควบคุมระบบ กอ.แก๊ส เชียงใหม่]\nเลือกหมวดหมู่คำสั่งที่ต้องการใช้งานครับ:";
  let flexMsg = UI_BuildAdminFlexCard();
  return { text: text, messages: [flexMsg], qr: UI_GetAdminHomeQr() };
}

function UI_BuildSalesMenu() {
  return { text: "📊 [หมวดรายงานยอดขาย]", qr: UI_GetAdminHomeQr() };
}

function UI_BuildFinanceMenu() {
  return { text: "💰 [หมวดการเงินและวางบิลเครดิต]", qr: UI_GetAdminHomeQr() };
}

function UI_BuildSystemMenu() {
  return { text: "⚙️ [หมวดตั้งค่าและดูแลระบบ]", qr: UI_GetAdminHomeQr() };
}

function UI_BuildStoreStockMenu() {
  let stockReport = (typeof ORD_CalculateUsage === "function")
                    ? ORD_CalculateUsage()
                    : "🏭 [รายงานสต็อกแก๊ส Office]";
  let flexStock = {
    type: "flex",
    altText: "🏭 รายงานสต็อกแก๊ส Office",
    fallbackText: stockReport,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🏭 รายงานสต็อกแก๊ส Office", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: stockReport, size: "xs", color: "#222222", wrap: true },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn("🔄 รีเซ็ตถังตั้งต้น", "resetgas", "#1DA1DB", "#FFFFFF", "xs"),
              UI_MakeFlexBoxBtn("🎛️ เมนูหลัก", "1003", "#F4F5F7", "#111111", "xs")
            ]
          }
        ]
      }
    }
  };
  return { text: stockReport, flexMsg: flexStock, qr: UI_GetAdminHomeQr() };
}

function UI_GetStoreQuickReply(pendingDebt, hasCartItems, isAdminMode) {
  return { items: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
}

function UI_GetCartReviewMenu(pendingDebt, isAdminMode) {
  return UI_GetStoreQuickReply(pendingDebt || 0, true, Boolean(isAdminMode));
}

function UI_BuildAutoLinkSearchResults(matchedStores, query) {
  if (!matchedStores || matchedStores.length === 0) {
    let emptyFlex = UI_WrapTextAsAppleFlex(`🔍 [ไม่พบร้านค้าที่ค้นหา]\nไม่พบร้านค้าที่ตรงกับ "${query}" กรุณาพิมพ์ชื่อร้านใหม่ หรือกดดูรายชื่อทั้งหมดครับ`);
    return { text: `ไม่พบร้าน "${query}"`, flexMsg: emptyFlex, qr: UI_GetAdminHomeQr() };
  }

  let rows = [];
  let limit = Math.min(matchedStores.length, 8);
  for (let i = 0; i < limit; i++) {
    let st = matchedStores[i];
    let cleanTitle = DB_CleanStorePrefix(st.storeName, st.storeId);
    rows.push(UI_MakeAppleRowBtn(cleanTitle, "ตั้งค่า/โค้ด", `#สร้างโค้ดร้าน-${st.storeId}`));
  }
  rows.push(UI_MakeFlexBoxBtn("📋 ดูรายชื่อทั้งหมด", "menu_autolink", "#F4F5F7", "#111111", "xs"));

  let flexMsg = {
    type: "flex",
    altText: `🔗 ผลค้นหาร้าน "${query}"`,
    fallbackText: `🔗 ผลค้นหาร้าน "${query}"`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🔗 เลือกร้านเพื่อรับโค้ด / แก้หัวบิล", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `คำค้นหา: "${query}"`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
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

  return { text: `🔗 ผลค้นหา: ${query}`, flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function UI_BuildStoreSearchResults(matchedStores, query) {
  if (!matchedStores || matchedStores.length === 0) {
    let emptyFlex = UI_WrapTextAsAppleFlex(`🔍 [ไม่พบร้านค้าที่ค้นหา]\nไม่พบร้านค้าที่ตรงกับ "${query}" กดดูรายชื่อร้านทั้งหมดได้เลยครับ`);
    return { text: `ไม่พบร้าน "${query}"`, flexMsg: emptyFlex, qr: UI_GetAdminHomeQr() };
  }

  let rows = [];
  let limit = Math.min(matchedStores.length, 8);
  for (let i = 0; i < limit; i++) {
    let st = matchedStores[i];
    let cleanTitle = DB_CleanStorePrefix(st.storeName, st.storeId);
    let priceLine = `15กก.=${st.price15} | 48กก.=${st.price48} | กระป๋อง=${st.priceCan}`;
    rows.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F8FBFE",
      borderColor: "#CBE6F6",
      borderWidth: "1px",
      cornerRadius: "8px",
      paddingAll: "10px",
      action: { type: "message", label: st.storeId.substring(0, 20), text: `#เลือกร้าน-${st.storeId}` },
      contents: [
        { type: "text", text: cleanTitle, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
        { type: "text", text: priceLine, size: "xxs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
      ]
    });
  }
  rows.push(UI_MakeFlexBoxBtn("📋 ดูรายชื่อทั้งหมด", "admin_order", "#F4F5F7", "#111111", "xs"));

  let flexMsg = {
    type: "flex",
    altText: `🔍 ผลการค้นหา "${query}"`,
    fallbackText: `🔍 ผลการค้นหา "${query}"`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `🔍 ผลการค้นหาร้านค้า (${matchedStores.length} ร้าน)`, weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `คำค้นหา: "${query}"`, size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
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

  return { text: `🔍 ผลค้นหา: ${query}`, flexMsg: flexMsg, qr: UI_GetAdminHomeQr() };
}

function appendQuickReply(messages, dynamicNextCmd, billIdsArray) {
  if (!messages || messages.length === 0) return messages;
  messages[messages.length - 1].quickReply = { items: UI_GetAdminHomeQr() };
  return messages;
}

function MSG_FormatLineBubbles(messagesArray, quickReplyItems) {
  let sliced = messagesArray.slice(0, 5);
  let singleHomeQr = UI_FilterToSingleHomeQr(quickReplyItems);

  return sliced.map((msg, index) => {
    let obj = {};
    if (msg.type === "flex" && msg.contents) {
      obj.type = "flex";
      obj.altText = String(msg.altText || "กอ.แก๊ส เชียงใหม่").substring(0, 390);
      obj.contents = msg.contents;
    } else if (msg.type === "image" || msg.originalContentUrl) {
      obj.type = "image";
      obj.originalContentUrl = msg.originalContentUrl;
      obj.previewImageUrl = msg.previewImageUrl || msg.originalContentUrl;
    } else {
      let wrapped = UI_WrapTextAsAppleFlex(msg.text || "-");
      if (wrapped.type === "flex") {
        obj.type = "flex";
        obj.altText = String(wrapped.altText || "กอ.แก๊ส เชียงใหม่").substring(0, 390);
        obj.contents = wrapped.contents;
      } else {
        obj.type = "text";
        obj.text = String(wrapped.text || "-");
      }
    }

    if (index === sliced.length - 1) {
      if (singleHomeQr && singleHomeQr.length > 0) {
        obj.quickReply = { items: singleHomeQr };
      } else if (msg.quickReply && msg.quickReply.items) {
        obj.quickReply = { items: UI_FilterToSingleHomeQr(msg.quickReply.items) };
      }
    }
    return obj;
  });
}

function MSG_ReplyLine(replyToken, messagesArray, quickReplyItems) {
  try {
    let token = getConfigLineToken();
    if (!token || !replyToken || !messagesArray || !messagesArray.length) return false;

    let formattedMessages = MSG_FormatLineBubbles(messagesArray, quickReplyItems);
    let resp = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
      payload: JSON.stringify({ replyToken: replyToken, messages: formattedMessages }),
      muteHttpExceptions: true
    });
    return resp.getResponseCode() === 200;
  } catch (e) { return false; }
}

function MSG_PushLine(targetId, messagesArray, quickReplyItems) {
  try {
    let token = getConfigLineToken();
    let toId = targetId || CONFIG.ADMIN_GROUP_ID;
    if (!token || !toId || !messagesArray || !messagesArray.length) return false;

    let formattedMessages = MSG_FormatLineBubbles(messagesArray, quickReplyItems);
    let resp = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
      payload: JSON.stringify({ to: toId, messages: formattedMessages }),
      muteHttpExceptions: true
    });

    let code = resp.getResponseCode();
    if (code !== 200) {
      let cache = CacheService.getScriptCache();
      if (!cache.get("LINE_PUSH_ERR_ALERT")) {
        cache.put("LINE_PUSH_ERR_ALERT", "1", 1800);
        let reason = (code === 429) ? "โควต้าข้อความ Push รายเดือนของ LINE OA เต็ม (HTTP 429)" : `HTTP Error ${code}`;
        sendTelegramMessage(`⚠️ [แจ้งเตือนฉุกเฉิน LINE OA]\nส่งข้อความ Push เข้ากลุ่ม LINE ไม่สำเร็จ (${reason})\n💡 แนะนำให้ใช้งานหรือเช็คผ่าน Telegram นี้ได้เลยครับ`);
      }
      return false;
    }
    return true;
  } catch (e) { return false; }
}

function getActiveTelegramChatId(chatId) {
  if (chatId) return String(chatId);
  let saved = PropertiesService.getScriptProperties().getProperty("ACTIVE_TG_CHAT_ID");
  if (saved) return saved;
  return CONFIG.TELEGRAM_CHAT_ID;
}

function buildTelegramKeyboardFromQr(quickReplyItems) {
  return {
    keyboard: [
      [{ text: "1003" }, { text: "today" }, { text: "pending" }],
      [{ text: "invoice15" }, { text: "เงินรอฝากรายคน" }, { text: "order ส่งแก๊สวันนี้" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function MSG_ReplyTelegram(chatId, text, quickReplyItems) {
  try {
    let token = CONFIG.TELEGRAM_TOKEN;
    let targetChat = getActiveTelegramChatId(chatId);
    if (!token || !targetChat || !text) return;

    let cleanText = String(text).replace(/<\/?[^>]+(>|$)/g, "");
    let url = "https://api.telegram.org/bot" + token + "/sendMessage";
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: targetChat, text: cleanText, reply_markup: buildTelegramKeyboardFromQr(quickReplyItems) }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function sendTelegramMessage(text) {
  MSG_ReplyTelegram(null, text, null);
}

function TG_SendNotification(text) {
  MSG_ReplyTelegram(null, "🔔 [ระบบ กอ.แก๊ส Alert]\n" + text, null);
}

function sendTelegramPhoto(photoUrl, caption, chatId) {
  try {
    let token = CONFIG.TELEGRAM_TOKEN;
    let targetChat = getActiveTelegramChatId(chatId);
    if (!token || !targetChat || !photoUrl) return;

    let url = "https://api.telegram.org/bot" + token + "/sendPhoto";
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: targetChat, photo: photoUrl, caption: caption || "", reply_markup: buildTelegramKeyboardFromQr(null) }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function MSG_SendReply(platform, tokenOrChatId, messagesArray, quickReplyItems) {
  if (platform === "LINE") {
    MSG_ReplyLine(tokenOrChatId, messagesArray, quickReplyItems);
  } else {
    for (let i = 0; i < messagesArray.length; i++) {
      let m = messagesArray[i];
      if (m.type === "flex") {
        let tgText = m.fallbackText || m.altText || "🎛️ [แผงควบคุม กอ.แก๊ส เชียงใหม่]";
        MSG_ReplyTelegram(tokenOrChatId, tgText, (i === messagesArray.length - 1) ? quickReplyItems : null);
      } else if (m.type === "image" || m.originalContentUrl) {
        sendTelegramPhoto(m.originalContentUrl, "", tokenOrChatId);
      } else if (m.text) {
        MSG_ReplyTelegram(tokenOrChatId, m.text, (i === messagesArray.length - 1) ? quickReplyItems : null);
      }
    }
  }
}

function sendLineReply(replyToken, messages, dynamicNextCmd, billIdsArray) {
  let enriched = appendQuickReply(messages, dynamicNextCmd, billIdsArray);
  MSG_ReplyLine(replyToken, enriched, null);
}

function sendLinePush(messages) {
  let enriched = appendQuickReply(messages, null, null);
  let adminRoomId = (typeof DB_GetAdminGroupId === "function") ? DB_GetAdminGroupId() : CONFIG.ADMIN_GROUP_ID;
  MSG_PushLine(adminRoomId, enriched, null);
}

function sendDualPush(msgText) {
  sendLinePush([{ type: "text", text: msgText }]);
  sendTelegramMessage(msgText);
}

function sendDualPushMultiple(messages) {
  sendLinePush(messages);
  let fullText = "";
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].type === "text") fullText += messages[i].text + "\n\n";
    else if (messages[i].type === "flex" && messages[i].fallbackText) fullText += messages[i].fallbackText + "\n\n";
  }
  if (fullText) sendTelegramMessage(fullText.trim());
}

function TG_AutoBindWebhook() {
  try {
    let token = CONFIG.TELEGRAM_TOKEN;
    if (!token) return { ok: false, msg: "ไม่พบ TELEGRAM_TOKEN" };

    let webAppUrl = "";
    try { webAppUrl = ScriptApp.getService().getUrl(); } catch (e) {}

    if (webAppUrl && webAppUrl.startsWith("https://")) {
      let setUrl = "https://api.telegram.org/bot" + token + "/setWebhook?url=" + encodeURIComponent(webAppUrl) + "&drop_pending_updates=true";
      UrlFetchApp.fetch(setUrl, { method: "get", muteHttpExceptions: true });
    }

    let infoResp = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", { method: "get", muteHttpExceptions: true });
    let infoJson = JSON.parse(infoResp.getContentText());
    if (infoJson.ok && infoJson.result) {
      let boundUrl = infoJson.result.url || "";
      let err = infoJson.result.last_error_message || "ไม่มี Error";
      return { ok: Boolean(boundUrl), boundUrl: boundUrl, lastError: err };
    }
    return { ok: false, msg: "ตรวจสอบ Webhook ไม่สำเร็จ" };
  } catch (e) { return { ok: false, msg: e.message }; }
}

function Diag_RunSystemDiagnostic() {
  DB_ClearStoreCache();
  DB_ClearTxCache();

  let cleanRes = DB_MigrateAndCleanBotRowsFromMainSheet(true);
  let drivers = DB_GetStaffDrivers();
  let log = ["🩺 [รายงานตรวจและซ่อมวันที่จากรูปใบเสร็จ V.47.0]\n--------------------------------------"];
  let hasError = false;

  try {
    let ss = DB_GetSpreadsheet();
    let mainSheet = ss.getSheetByName(CONFIG.SHEET_MAIN_SALES);
    let qSheet = DB_GetQueueSheetSafe();

    if (mainSheet) {
      log.push(`🟢 แท็บขายหลัก (${CONFIG.SHEET_MAIN_SALES}): โหมด Zero-Delete (${mainSheet.getLastRow()} แถว)`);
      log.push(`🟢 ซ่อมวันที่สลับเดือน/อนาคต: ${cleanRes.healedDates || 0} แถว | เช็ครูป Drive สะสม: ${cleanRes.driveVerified || 0} แถว`);
      log.push(`🟢 เติมรหัสบิลช่อง V: ${cleanRes.filledOrderIds || 0} แถว`);
    } else {
      log.push(`🔴 แท็บขายหลัก: ไม่พบแท็บ '${CONFIG.SHEET_MAIN_SALES}'`);
      hasError = true;
    }

    if (qSheet) log.push(`🟢 แท็บคิวสั่งแก๊ส (${CONFIG.SHEET_QUEUE}): แยกอิสระพร้อมใช้งาน`);

    let storeSheet = DB_GetStoreSheetSafe();
    if (storeSheet) {
      let allStores = DB_GetAllActiveStores(true);
      log.push(`🟢 แท็บร้านค้า (${CONFIG.SHEET_STORES}): พร้อมใช้งาน (${allStores.length} ร้าน)`);
      log.push(`🟢 ทีมรับออเดอร์ (${drivers.length} คน): ${drivers.join(", ")}`);
    } else {
      log.push(`🔴 แท็บร้านค้า: ไม่พบข้อมูล`);
      hasError = true;
    }

    let tgStatus = TG_AutoBindWebhook();
    if (tgStatus.ok) {
      log.push(`🟢 Telegram Webhook: เชื่อมต่อสำเร็จ (${tgStatus.lastError})`);
      sendTelegramMessage("✅ [กอ.แก๊ส เชียงใหม่ V.47.0] ซ่อมวันที่จากรูปใบเสร็จ + จัดเรียงตารางใหม่เรียบร้อยครับ!");
    } else {
      log.push(`🟡 Telegram Webhook: รอผูกลิงก์`);
    }
  } catch (e) {
    log.push(`🔴 Database Error: ${e.message}`);
    hasError = true;
  }

  log.push("--------------------------------------");
  log.push(hasError ? "⚠️ พบข้อผิดพลาดบางจุด" : "✅ ระบบทั้งหมดทำงานสมบูรณ์ 100%");
  return log.join("\n");
}

function SYS_RunHealthCheck(platform, targetIdOrToken) {
  let reportText = Diag_RunSystemDiagnostic();
  let diagFlex = {
    type: "flex",
    altText: "🩺 รายงานตรวจและซ่อมวันที่จากรูปใบเสร็จ V.47.0",
    fallbackText: reportText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🩺 รายงานซ่อมวันที่ & ตรวจระบบ V.47.0", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: reportText, size: "xs", color: "#111111", wrap: true },
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              UI_MakeFlexBoxBtn("📋 ดูบิลรอโอน", "pending", "#0288D1", "#FFFFFF", "xs"),
              UI_MakeFlexBoxBtn("🩺 ซ่อมชุดถัดไป", "diagnostic", "#1DA1DB", "#FFFFFF", "xs")
            ]
          }
        ]
      }
    }
  };

  if (platform === "LINE") {
    let ok = MSG_ReplyLine(targetIdOrToken, [diagFlex], UI_GetAdminHomeQr());
    if (!ok) MSG_PushLine(DB_GetAdminGroupId(), [diagFlex], UI_GetAdminHomeQr());
  } else {
    MSG_SendReply(platform, targetIdOrToken, [diagFlex], UI_GetAdminHomeQr());
  }
}
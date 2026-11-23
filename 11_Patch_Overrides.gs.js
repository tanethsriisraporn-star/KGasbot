// ============================================================================
// 🚀 File: 11_Patch_Overrides.gs (REPLY-FIRST ORDER ENGINE, CREDIT 15/30 & WIZARD)
// Version: 66.0 (0.15s Reply-First ConfirmOrder + Direct Order Map + Smart Credit 15/30)
// ============================================================================

/**
 * 📌 1. ปุ่ม Quick Reply มาตรฐานห้องลูกค้า (19 ตัวอักษร ไม่โดนตัดคำแหว่ง 100%)
 */
function UI_GetStoreHomeQr() {
  return [{ type: "action", action: { type: "message", label: "🔄 อัปเดต / สั่งแก๊ส", text: "update" } }];
}

/**
 * 📌 2. แยกบิลเครดิต 15 วัน และ 30 วัน:
 * - accBills: ยอดสั่งสะสมในรอบปัจจุบัน (ยังไม่ถึงกำหนดชำระ)
 * - dueBills: ยอดครบกำหนดชำระ (ตัดรอบวันที่ 16 เวลา 00:01 น. และวันที่ 1 เวลา 00:01 น.)
 */
function DB_SplitCreditBillsByDueStatus(unpaidBillsList, creditTerm) {
  var dueBills = [];
  var accBills = [];
  var dueTotal = 0;
  var accTotal = 0;

  var now = new Date();
  var curY = now.getFullYear();
  var curM = now.getMonth();
  var curD = now.getDate();

  var list = unpaidBillsList || [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var bDate = parseSheetDate(b.date || b.dateStr);
    if (!bDate) {
      dueBills.push(b);
      dueTotal += (b.amount || 0);
      continue;
    }

    var bY = bDate.getFullYear();
    var bM = bDate.getMonth();
    var bD = bDate.getDate();
    var isSameMonth = (bY === curY && bM === curM);

    if (creditTerm === "15") {
      if (isSameMonth && ((curD <= 15 && bD <= 15) || (curD >= 16 && bD >= 16))) {
        accBills.push(b);
        accTotal += (b.amount || 0);
      } else {
        dueBills.push(b);
        dueTotal += (b.amount || 0);
      }
    } else if (creditTerm === "30") {
      if (isSameMonth) {
        accBills.push(b);
        accTotal += (b.amount || 0);
      } else {
        dueBills.push(b);
        dueTotal += (b.amount || 0);
      }
    } else {
      dueBills.push(b);
      dueTotal += (b.amount || 0);
    }
  }

  var nextDueHint = "";
  if (creditTerm === "15") {
    nextDueHint = (curD <= 15) ? "ตัดรอบวางบิลวันที่ 16 เวลา 00:01 น." : "ตัดรอบวางบิลวันที่ 1 ของเดือนถัดไป";
  } else if (creditTerm === "30") {
    nextDueHint = "ตัดรอบวางบิลวันที่ 1 ของเดือนถัดไป";
  }

  return {
    dueBills: dueBills,
    accBills: accBills,
    dueTotal: dueTotal,
    accTotal: accTotal,
    nextDueHint: nextDueHint
  };
}

/**
 * 📌 3. การ์ดหน้าหลักร้านค้า (UI_BuildStoreStep1Flex) รองรับเครดิต 15/30 วัน & เช็คสถานะจัดส่งล่าสุด
 */
function UI_BuildStoreStep1Flex(storeInfo, pendingDebt, currentCart, isAdminMode, unpaidBillsList) {
  if (!storeInfo || typeof storeInfo !== "object") {
    storeInfo = { storeId: "ST-000", storeName: "ร้านค้า", price15: 490, price48: 1530, priceCan: 790, creditTerm: "" };
  }

  var sName = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId) || "-";
  var stCode = storeInfo.storeId || sName;
  var p15 = storeInfo.price15 || 490;
  var p48 = storeInfo.price48 || 1530;
  var pCan = storeInfo.priceCan || 790;
  var cTerm = String(storeInfo.creditTerm || "").trim();
  var isCreditStore = (cTerm === "15" || cTerm === "30");
  var hasCart = currentCart && ((currentCart.g15 || 0) > 0 || (currentCart.g48 || 0) > 0 || (currentCart.can || 0) > 0);

  var bodyContents = [];

  // 🚚 1. แถบแจ้งสถานะออร์เดอร์ล่าสุด (กำลังจัดส่ง / จัดส่งสำเร็จวันนี้ + ปุ่มดูรูปสินค้า)
  var latestOrder = (typeof DB_GetLatestStoreOrderInfo === "function" && stCode !== "ST-000")
    ? DB_GetLatestStoreOrderInfo(sName)
    : null;
  if (latestOrder) {
    var bgLatest = latestOrder.isPendingQueue ? "#E3F2FD" : "#E8F5E9";
    var borderLatest = latestOrder.isPendingQueue ? "#90CAF9" : "#A5D6A7";
    var titleColor = latestOrder.isPendingQueue ? "#0277BD" : "#2E7D32";

    var latestBoxItems = [
      { type: "text", text: latestOrder.statusLabel, size: "xs", weight: "bold", color: titleColor, maxLines: 1, adjustMode: "shrink-to-fit" },
      { type: "text", text: "🧾 " + latestOrder.orderId + " : " + latestOrder.itemDesc + " (" + latestOrder.total.toLocaleString("en") + " บ.)", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
      { type: "text", text: "🕒 เวลา: " + latestOrder.timeStr, size: "xxs", color: "#555555", maxLines: 1 }
    ];

    if (latestOrder.isPendingQueue) {
      latestBoxItems.push({
        type: "box", layout: "horizontal", margin: "sm",
        contents: [UI_MakeFlexBoxBtn("🔄 เช็คสถานะจัดส่ง", "update", "#FFFFFF", "#0277BD", "xs", "#90CAF9")]
      });
    } else if (latestOrder.slipUrl) {
      var rowRef = latestOrder.rowIdx ? ("ROW-" + latestOrder.rowIdx) : latestOrder.orderId;
      latestBoxItems.push({
        type: "box", layout: "horizontal", margin: "sm",
        contents: [UI_MakeFlexBoxBtn("📸 รูปสินค้าที่ส่งแล้ว", "ดูรูปสินค้า_" + rowRef, "#FFFFFF", "#1B5E20", "xs", "#81C784")]
      });
    }

    bodyContents.push({
      type: "box", layout: "vertical", backgroundColor: bgLatest, borderColor: borderLatest,
      borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px", contents: latestBoxItems
    });
    bodyContents.push({ type: "separator", margin: "sm", color: "#E5E5E5" });
  }

  // 🧺 2. ตะกร้าสินค้าที่เลือกค้างไว้ (ถ้ามี)
  if (hasCart) {
    var cartItemsTxt = [];
    if (currentCart.g15 > 0) cartItemsTxt.push("15กก.(" + currentCart.g15 + " ถัง)");
    if (currentCart.g48 > 0) cartItemsTxt.push("48กก.(" + currentCart.g48 + " ถัง)");
    if (currentCart.can > 0) cartItemsTxt.push("กระป๋อง(" + currentCart.can + " ลัง)");
    var cartSum = ((currentCart.g15 || 0) * p15) + ((currentCart.g48 || 0) * p48) + ((currentCart.can || 0) * pCan);

    bodyContents.push({
      type: "box", layout: "vertical", backgroundColor: "#FFF8E1", borderColor: "#FFE082",
      borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px",
      contents: [
        { type: "text", text: "🧺 รายการในตะกร้า (รอพุ่งส่ง):", size: "xs", weight: "bold", color: "#E65100", maxLines: 1 },
        { type: "text", text: "📦 " + cartItemsTxt.join(", ") + " = " + cartSum.toLocaleString("en") + " บาท", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 },
        {
          type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
          contents: [
            UI_MakeFlexBoxBtn("✅ ยืนยันสั่งซื้อ", "ยืนยันสั่งซื้อ", "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("🗑️ ล้างตะกร้า", "ล้างตะกร้า", "#FFFFFF", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      ]
    });
    bodyContents.push({ type: "separator", margin: "sm", color: "#E5E5E5" });
  }

  // 💳 3. ยอดค้างชำระ (แยกเครดิต 15/30 วัน vs ร้านโอนรายบิล)
  if (pendingDebt && pendingDebt > 0 && unpaidBillsList && unpaidBillsList.length > 0) {
    var lastBillObj = unpaidBillsList[unpaidBillsList.length - 1];
    var latestUnpaidRowKey = lastBillObj.rowIdx ? ("ROW-" + lastBillObj.rowIdx) : lastBillObj.orderId;

    if (isCreditStore) {
      var split = DB_SplitCreditBillsByDueStatus(unpaidBillsList, cTerm);

      // 3A. ยอดครบกำหนดชำระ (พ้นวันตัดรอบวันที่ 16 หรือวันที่ 1)
      if (split.dueBills.length > 0) {
        var dueBox = [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "🔔 ยอดครบกำหนดชำระ (เครดิต " + cTerm + " วัน)", size: "xs", weight: "bold", color: "#B71C1C", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
              { type: "text", text: split.dueTotal.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
            ]
          }
        ];
        for (var i = 0; i < Math.min(split.dueBills.length, 3); i++) {
          var b = split.dueBills[i];
          dueBox.push({
            type: "box", layout: "horizontal", margin: "xs",
            contents: [
              { type: "text", text: "• " + b.orderId + " (" + (b.shortDateStr || b.dateStr) + ")", size: "xs", color: "#333333", flex: 4, maxLines: 1 },
              { type: "text", text: b.amount.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1 }
            ]
          });
        }
        dueBox.push({
          type: "text",
          text: "🙏 ครบกำหนดรอบวางบิลแล้วนะคะ โอนแล้วส่งรูปสลิปในแชทนี้ได้เลยค่ะ 💙",
          size: "xxs", color: "#B71C1C", wrap: true, margin: "xs"
        });
        dueBox.push({
          type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
          contents: [
            UI_MakeFlexBoxBtn("📄 รูปใบแจ้งหนี้", "ขอดูใบแจ้งหนี้_" + stCode, "#111111", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("📸 รูปสินค้าที่ส่งแล้ว", "ดูรูปสินค้า_" + latestUnpaidRowKey, "#FFFFFF", "#1B5E20", "xs", "#81C784")
          ]
        });
        bodyContents.push({
          type: "box", layout: "vertical", backgroundColor: "#FFF8F0", borderColor: "#FFCC80",
          borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px", contents: dueBox
        });
      }

      // 3B. ยอดสั่งสะสมในรอบปัจจุบัน (ยังไม่ถึงวันตัดรอบ -> ไม่ทวงเงิน)
      if (split.accBills.length > 0) {
        var accBox = [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "📋 ยอดสั่งสะสมรอบปัจจุบัน (เครดิต " + cTerm + " วัน)", size: "xs", weight: "bold", color: "#0277BD", flex: 4, maxLines: 1, adjustMode: "shrink-to-fit" },
              { type: "text", text: split.accTotal.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#0277BD", align: "end", flex: 2, maxLines: 1 }
            ]
          }
        ];
        for (var j = 0; j < Math.min(split.accBills.length, 3); j++) {
          var ab = split.accBills[j];
          accBox.push({
            type: "box", layout: "horizontal", margin: "xs",
            contents: [
              { type: "text", text: "• " + ab.orderId + " (" + (ab.shortDateStr || ab.dateStr) + ")", size: "xs", color: "#333333", flex: 4, maxLines: 1 },
              { type: "text", text: ab.amount.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1 }
            ]
          });
        }
        accBox.push({
          type: "text",
          text: "ℹ️ รายการสะสมรอบปัจจุบัน (ยังไม่ถึงกำหนดชำระ • " + split.nextDueHint + ")",
          size: "xxs", color: "#555555", wrap: true, margin: "xs"
        });
        accBox.push({
          type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
          contents: [
            UI_MakeFlexBoxBtn("📄 ดูใบสรุปยอดสะสม", "ขอดูใบแจ้งหนี้_" + stCode, "#FFFFFF", "#0277BD", "xs", "#90CAF9"),
            UI_MakeFlexBoxBtn("📸 รูปสินค้าที่ส่งแล้ว", "ดูรูปสินค้า_" + latestUnpaidRowKey, "#FFFFFF", "#1B5E20", "xs", "#81C784")
          ]
        });
        bodyContents.push({
          type: "box", layout: "vertical", backgroundColor: "#F8FBFE", borderColor: "#CBE6F6",
          borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px", margin: split.dueBills.length > 0 ? "sm" : "none", contents: accBox
        });
      }
    } else {
      // 3C. ร้านทั่วไป (บิลโอนรายใบ)
      var debtBoxContents = [
        {
          type: "box", layout: "horizontal",
          contents: [
            { type: "text", text: "💳 ยอดค้างชำระ", size: "xs", weight: "bold", color: "#B71C1C", flex: 3, maxLines: 1 },
            { type: "text", text: pendingDebt.toLocaleString("en") + " บาท", size: "xs", weight: "bold", color: "#B71C1C", align: "end", flex: 2, maxLines: 1 }
          ]
        }
      ];
      for (var k = 0; k < Math.min(unpaidBillsList.length, 3); k++) {
        var ub = unpaidBillsList[k];
        debtBoxContents.push({
          type: "box", layout: "horizontal", margin: "xs",
          contents: [
            { type: "text", text: "• " + ub.orderId + " (" + (ub.shortDateStr || ub.dateStr) + ")", size: "xs", color: "#333333", flex: 4, maxLines: 1 },
            { type: "text", text: ub.amount.toLocaleString("en") + " บ.", size: "xs", weight: "bold", color: "#111111", align: "end", flex: 2, maxLines: 1 }
          ]
        });
      }
      debtBoxContents.push({
        type: "text",
        text: "📸 โอนชำระแล้วส่งรูปสลิปลงในแชทนี้ได้เลยค่ะ ระบบตัดยอดให้อัตโนมัติค่ะ",
        size: "xxs", color: "#0277BD", wrap: true, margin: "xs"
      });
      debtBoxContents.push({
        type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
        contents: [
          UI_MakeFlexBoxBtn("📄 รูปใบแจ้งหนี้", "ขอดูใบแจ้งหนี้_" + stCode, "#111111", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("📸 รูปสินค้าที่ส่งแล้ว", "ดูรูปสินค้า_" + latestUnpaidRowKey, "#FFFFFF", "#1B5E20", "xs", "#81C784")
        ]
      });
      if (isAdminMode && latestUnpaidRowKey) {
        debtBoxContents.push({
          type: "box", layout: "horizontal", margin: "xs",
          contents: [UI_MakeFlexBoxBtn("✅ มาร์คชำระแล้ว (Admin)", "setstatus_" + latestUnpaidRowKey + "_ชำระแล้ว", "#1B873F", "#FFFFFF", "xs")]
        });
      }
      bodyContents.push({
        type: "box", layout: "vertical", backgroundColor: "#FFF8F0", borderColor: "#FFCC80",
        borderWidth: "1px", cornerRadius: "8px", paddingAll: "10px", contents: debtBoxContents
      });
    }
    bodyContents.push({ type: "separator", margin: "md", color: "#E5E5E5" });
  }

  // 🛒 4. ปุ่มเลือกขนาดแก๊สเพื่อสั่งซื้อ
  bodyContents.push(
    { type: "text", text: "🛒 กดเลือกขนาดแก๊สเพื่อสั่งซื้อ", size: "xs", weight: "bold", color: "#111111", margin: "xs", maxLines: 1 },
    UI_MakeAppleRowBtn("🛢️ ถังแก๊ส 15 กก.", p15.toLocaleString("en") + " บ./ถัง", "เลือก_15"),
    UI_MakeAppleRowBtn("🛢️ ถังแก๊ส 48 กก.", p48.toLocaleString("en") + " บ./ถัง", "เลือก_48"),
    UI_MakeAppleRowBtn("🥫 แก๊สกระป๋อง", pCan.toLocaleString("en") + " บ./ลัง", "เลือก_can")
  );

  if (isAdminMode) {
    bodyContents.push({
      type: "box", layout: "horizontal", spacing: "xs", margin: "sm",
      contents: [
        UI_MakeFlexBoxBtn("✏️ แก้ไขหัวบิล", "แก้ไขหัวบิล_" + stCode, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn("⚙️ ตั้งค่าร้าน", "ตั้งค่าร้าน_" + stCode, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
        UI_MakeFlexBoxBtn("🔄 เปลี่ยนร้าน", "admin_order", "#F4F5F7", "#333333", "xxs")
      ]
    });
  }

  var flexMsg = {
    type: "flex",
    altText: "🛒 เมนูสั่งแก๊ส • " + sName,
    fallbackText: "🏪 [" + sName + "]\nเรทราคา: 15กก.=" + p15 + " | 48กก.=" + p48 + " | กระป๋อง=" + pCan,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "14px",
        contents: [
          { type: "text", text: "กอ.แก๊ส เชียงใหม่", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🏪 " + sName, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: "15กก.=" + p15 + " | 48กก.=" + p48 + " | กระป๋อง=" + pCan, size: "xxs", color: "#FFFFFF", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
        contents: bodyContents
      }
    }
  };

  return { flexMsg: flexMsg, qr: isAdminMode ? UI_GetAdminHomeQr() : UI_GetStoreHomeQr() };
}

// ============================================================================
// ⚡ 4. ระบบสั่งแก๊สแบบวิ่งตรงหาฟังก์ชัน + REPLY-FIRST CONFIRM ORDER (0.15 วินาที!)
// ============================================================================

var ORDER_STEP1_DIRECT_SET = {
  "update": 1, "เลือกประเภทแก๊ส": 1, "สั่งแก๊ส": 1, "เมนูสั่งแก๊ส": 1,
  "สั่งรายการอื่นเพิ่ม": 1, "อัปเดต": 1, "เช็คสถานะ": 1, "เมนู": 1, "step1_order": 1
};

var ORDER_STEP2_DIRECT_MAP = {
  "เลือก_15": "15", "สั่งแก๊ส 15 กก.": "15", "แก๊ส 15": "15", "แก๊ส 15 กก.": "15", "ถัง 15 กก.": "15", "15": "15", "15 กก.": "15",
  "เลือก_48": "48", "สั่งแก๊ส 48 กก.": "48", "แก๊ส 48": "48", "แก๊ส 48 กก.": "48", "ถัง 48 กก.": "48", "48": "48", "48 กก.": "48",
  "เลือก_can": "can", "สั่งแก๊สกระป๋อง": "can", "แก๊สกระป๋อง": "can", "แก๊สลัง": "can", "สั่งแก๊สลัง": "can", "กระป๋อง": "can"
};

function RT_HandleThreeStepOrderFlow(platform, sessionKey, tokenOrChat, userText, lowText, targetStore, isAdminMode) {
  if (!targetStore) return false;

  // 1. ตารางกระโดดเข้า Step 1 ทันที (O(1) Direct Lookup)
  if (ORDER_STEP1_DIRECT_SET[lowText]) {
    ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }

  // 2. ตารางกระโดดเข้า Step 2 เลือกจำนวนถังทันที (O(1) Direct Lookup)
  if (ORDER_STEP2_DIRECT_MAP[lowText]) {
    ORD_ShowStep2QtySelection(platform, sessionKey, tokenOrChat, targetStore, ORDER_STEP2_DIRECT_MAP[lowText], isAdminMode);
    return true;
  }

  // 3. กดปุ่มเลือกจำนวนถังจากการ์ด (เช่น เลือกจำนวน_15_2)
  var mSelectQty = lowText.match(/^เลือกจำนวน_(15|48|can)_(\d+)$/i);
  if (mSelectQty) {
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, mSelectQty[1].toLowerCase(), Math.max(1, parseInt(mSelectQty[2], 10)), targetStore, isAdminMode);
    return true;
  }

  // 4. กดยืนยันสั่งซื้อ / ดูตะกร้า / ล้างตะกร้า (วิ่งตรงทันที)
  if (lowText === "ยืนยันสั่งซื้อ" || lowText === "cart confirm") {
    ORD_ConfirmOrder(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }
  if (lowText === "ดูตะกร้า" || lowText === "ทวนรายการ" || lowText === "cart review") {
    ORD_ShowCart(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }
  if (lowText === "ล้างตะกร้า" || lowText === "ยกเลิกการสั่ง" || lowText === "cart clear" || lowText === "cart_clear") {
    ORD_ClearCart(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }

  // 5. พิมพ์ตัวเลขลัด เช่น "กระป๋อง 5 ลัง", "15=2", "48=1"
  var mCanDirect = lowText.match(/(?:แก๊สกระป๋อง|กระป๋อง|แก๊สลัง|ลัง)?\s*(\d+)\s*ลัง/i) ||
                   lowText.match(/^(?:สั่ง)?(?:แก๊ส)?(?:กระป๋อง|ลัง)\s*[=*x×\s]\s*(\d+)$/i);
  if (mCanDirect) {
    var qtyCan = Math.max(1, parseInt(mCanDirect[1], 10));
    if (qtyCan <= 200) {
      ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "can", qtyCan, targetStore, isAdminMode);
      return true;
    }
  }

  var m15 = lowText.match(/(?:ถัง\s*)?15(?:\s*กก\.?|\s*กิโล)?\s*(?:จำนวน|[=*x×\s])\s*(\d+)(?:\s*ถัง)?/i);
  if (m15) {
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "15", Math.max(1, parseInt(m15[1], 10)), targetStore, isAdminMode);
    return true;
  }
  var m48 = lowText.match(/(?:ถัง\s*)?48(?:\s*กก\.?|\s*กิโล)?\s*(?:จำนวน|[=*x×\s])\s*(\d+)(?:\s*ถัง)?/i);
  if (m48) {
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "48", Math.max(1, parseInt(m48[1], 10)), targetStore, isAdminMode);
    return true;
  }

  var focusedType = CacheService.getScriptCache().get("focus_type_" + sessionKey);
  if (focusedType) {
    var mUnitQty = lowText.match(/^(?:เอา\s*)?(\d+)\s*(?:ถัง|ลัง)?$/i);
    if (mUnitQty) {
      var qty = Math.max(1, parseInt(mUnitQty[1], 10));
      if (qty <= 200) {
        ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, focusedType, qty, targetStore, isAdminMode);
        return true;
      }
    }
  }

  return false;
}

/**
 * ⚡ REPLY-FIRST ORD_ConfirmOrder:
 * 1. คำนวณยอด + ออกเลขคิวใน RAM + ยิง MSG_SendReply ตอบหน้าจอลูกค้า/แอดมินเป็นบรรทัดแรกสุดทันที (0.15 วินาที!)
 * 2. หลังจากหน้าจอได้รับคำตอบแล้ว จึงค่อยเขียนชีทคิว + สร้างใบเสร็จ 4 สี + สั่งพิมพ์ Epson แผ่นเดียว + แจ้งห้องลูกน้อง
 */
function ORD_ConfirmOrder(platform, sessionKey, tokenOrChatId, explicitStoreName, isAdminMode) {
  var cache = CacheService.getScriptCache();
  var cartKey = "cart_" + sessionKey;
  var cartStr = cache.get(cartKey);
  var targetStore = explicitStoreName || DB_GetSession(sessionKey, "locked_store");

  if (!cartStr) {
    if (targetStore) ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChatId, targetStore, isAdminMode);
    return;
  }

  var cart = JSON.parse(cartStr);
  if ((cart.g15 || 0) === 0 && (cart.g48 || 0) === 0 && (cart.can || 0) === 0) return;

  // ล้างตะกร้าใน RAM ทันทีเพื่อป้องกันการกดปุ่มยืนยันซ้ำ (Double-Click Guard)
  cache.removeAll([cartKey, "focus_type_" + sessionKey]);

  var storeInfo = DB_GetStoreById(cart.store) || {
    storeId: cart.store, storeName: cart.store, billingName: cart.store,
    price15: 490, price48: 1530, priceCan: 790, phone: "-", mapLink: "-"
  };
  var cleanStoreName = DB_CleanStorePrefix(storeInfo.storeName, storeInfo.storeId);
  var totalAmt = ((cart.g15 || 0) * storeInfo.price15) + ((cart.g48 || 0) * storeInfo.price48) + ((cart.can || 0) * storeInfo.priceCan);
  var orderId = DB_GenerateNextQueueId();

  var now = new Date();
  var currentHour = parseInt(Utilities.formatDate(now, "Asia/Bangkok", "HH"), 10);
  var isAfter2PM = (currentHour >= 14);
  var isAfter8PM = (currentHour >= 20 || currentHour < 9);

  var qRule = (typeof P16_GetQueueAndDeliveryRule_ === "function")
    ? P16_GetQueueAndDeliveryRule_(true, orderId)
    : { docDeliveryText: (isAfter2PM ? "จัดส่งวันพรุ่งนี้ (คิวที่ 4)" : "จัดส่งวันนี้ (คิวที่ 4)") };

  var scheduleNote = isAfter8PM ? "[ส่งพรุ่งนี้เช้า 09:00 น.]" : "";
  var scheduleLabel = qRule.docDeliveryText;

  var prepaidPeek = (typeof DB_PeekPrepaidStoreSlip === "function") ? DB_PeekPrepaidStoreSlip(storeInfo.storeId || cleanStoreName) : null;
  var isPrepaidMatched = false;
  if (prepaidPeek && prepaidPeek.slipUrl) {
    var pAmounts = prepaidPeek.amounts || [];
    if (pAmounts.length === 0 || pAmounts.indexOf(Math.round(totalAmt)) !== -1) {
      isPrepaidMatched = true;
      scheduleNote = (scheduleNote ? scheduleNote + " " : "") + "[🟢 โอนชำระแล้วแนบสลิปแล้ว]";
    }
  }

  var timeStr = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm น.");
  var itemSummary = [];
  if (cart.g15 > 0) itemSummary.push("15กก.(" + cart.g15 + " ถัง)");
  if (cart.g48 > 0) itemSummary.push("48กก.(" + cart.g48 + " ถัง)");
  if (cart.can > 0) itemSummary.push("กระป๋อง(" + cart.can + " ลัง)");

  var tgMsg = "🚚 [คิวส่งแก๊สใหม่: " + orderId + "] " + scheduleNote + "\n" +
              "🏪 ร้าน: " + cleanStoreName + "\n" +
              "📦 รายการ: " + itemSummary.join(", ") + "\n" +
              "💰 ยอดรวม: " + totalAmt.toLocaleString("en") + " บาท\n" +
              "🕒 รอบจัดส่ง: " + scheduleLabel;

  // ⚡ ขั้นตอนที่ 1 (REPLY-FIRST): ยิงการ์ดตอบกลับหน้าจอคนกดทันทีใน 0.15 วินาที! (ไม่ต้องรอสร้าง PDF ก่อน)
  if (isAdminMode) {
    DB_ClearAdminSession(sessionKey);
    var confirmAdminFlex = {
      type: "flex",
      altText: "✅ เปิดคิวส่งแก๊ส " + orderId + " สำเร็จ (" + totalAmt.toLocaleString("en") + " บ.)",
      fallbackText: tgMsg,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box", layout: "vertical",
          backgroundColor: isPrepaidMatched ? "#1B873F" : "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ เปิดคิว " + orderId + " & สั่งพิมพ์แล้ว!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + cleanStoreName, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "xs", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "📦 รายการ: " + itemSummary.join(", "), size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
            { type: "text", text: "💰 ยอดรวม: " + totalAmt.toLocaleString("en") + " บาท", size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
            { type: "text", text: "🚚 รอบจัดส่ง: " + scheduleLabel, size: "xs", weight: "bold", color: "#2E7D32", maxLines: 1 },
            { type: "text", text: "🖨️ ส่งพิมพ์ใบเสร็จ 4 สีออกเครื่อง Epson อัตโนมัติ", size: "xxs", color: "#555555", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            {
              type: "box", layout: "horizontal", spacing: "sm", margin: "sm",
              contents: [
                UI_MakeFlexBoxBtn("🖨️ ใบเสร็จ JPEG", "ขอดูใบเสร็จ " + orderId, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
                UI_MakeFlexBoxBtn("🛒 สั่งร้านอื่นต่อ", "admin_order", "#1DA1DB", "#FFFFFF", "xs")
              ]
            },
            UI_MakeFlexBoxBtn("❌ ยกเลิกคิว " + orderId, "cancel_q_" + orderId, "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChatId, [confirmAdminFlex], UI_GetAdminHomeQr());
  } else {
    var confirmStoreFlex = {
      type: "flex",
      altText: "✅ รับออร์เดอร์ " + orderId + " เรียบร้อยค่ะ",
      fallbackText: tgMsg,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box", layout: "vertical",
          backgroundColor: isPrepaidMatched ? "#1B873F" : "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: isPrepaidMatched ? "✅ รับออร์เดอร์ & ชำระแล้วค่ะ" : "✅ รับออร์เดอร์ " + orderId + " เรียบร้อยค่ะ", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + cleanStoreName, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "xs", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "📦 รายการ: " + itemSummary.join(", "), size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
            { type: "text", text: "💰 ยอดรวม: " + totalAmt.toLocaleString("en") + " บาท", size: "sm", weight: "bold", color: "#1DA1DB", maxLines: 1 },
            { type: "text", text: "🚚 รอบจัดส่ง: " + scheduleLabel, size: "xs", weight: "bold", color: isAfter2PM ? "#E65100" : "#2E7D32", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("🔄 เช็คสถานะจัดส่ง / สั่งแก๊สเพิ่ม", "update", "#F0F8FC", "#111111", "xs", "#CBE6F6")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChatId, [confirmStoreFlex], UI_GetStoreHomeQr());
  }

  // ⚙️ ขั้นตอนที่ 2 (BACKGROUND WORK): ทำงานเบื้องหลังหลังจากที่หน้าจอลูกค้าได้รับคำตอบแล้ว
  try {
    var taxDoc = ORD_CreateOrderTaxInvoiceA4(orderId, storeInfo, cart, totalAmt, scheduleLabel);
    if (taxDoc && taxDoc.imgUrl) {
      cache.put("QUEUE_JPEG_" + orderId + "_" + String(storeInfo.billingName || "").length, taxDoc.imgUrl, 21600);
    }
    DB_CreateQueueOrder(cleanStoreName, cart.g15, cart.g48, cart.can, totalAmt, orderId, (taxDoc && taxDoc.pdfUrl) ? taxDoc.pdfUrl : "", scheduleNote);

    var queueFlex = Staff_BuildSingleQueueFlexCard({
      orderId: orderId, store: cleanStoreName, billingName: storeInfo.billingName,
      time: timeStr, g15: cart.g15, g48: cart.g48, cans: cart.can, total: totalAmt,
      phone: storeInfo.phone, mapLink: storeInfo.mapLink,
      pdfUrl: (taxDoc && taxDoc.pdfUrl) ? taxDoc.pdfUrl : "",
      note: scheduleNote
    }, 1, 1, false);

    MSG_PushLine(DB_GetStaffGroupId(), [queueFlex], UI_GetStaffHomeQr());
    TG_SendNotification(tgMsg);
  } catch (bgErr) {
    Logger.log("ORD_ConfirmOrder Background Error: " + bgErr.message);
  }
}

// ============================================================================
// 🏪 5. ระบบสมัครร้านค้าใหม่แบบถามทีละข้อครบวงจร (ชื่อร้าน -> หัวบิล -> เบอร์ -> พิกัด -> ราคา -> เครดิต)
// ============================================================================

function RT_StartStoreRegistrationWizard(platform, userId, tokenOrChat) {
  RT_ClearAdminStoreLock(userId);
  var wiz = {
    step: 1, name: "", companyName: "", address: "", taxId: "",
    phone: "-", mapLink: "-", p15: 490, p48: 1530, pCan: 790, creditTerm: ""
  };
  DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

  var step1Flex = {
    type: "flex",
    altText: "➕ สมัครร้านค้าใหม่ (1/7): ชื่อร้านค้า",
    fallbackText: "➕ [สมัครร้านค้าใหม่ 1/7] พิมพ์ 'ชื่อร้านค้า' ได้เลยครับ:",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "14px",
        contents: [
          { type: "text", text: "➕ สมัครร้านค้าใหม่ (1/7 : ชื่อร้าน)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "ระบบบันทึกฐานข้อมูลร้านค้าอัตโนมัติ", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "1️⃣ กรุณาพิมพ์ 'ชื่อร้านค้า' ที่ต้องการเพิ่ม:", size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "ตัวอย่าง: ชาญก๋วยเตี๋ยวไก่ตุ๋น", size: "xxs", color: "#666666", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [step1Flex], UI_GetAdminHomeQr());
}

function RT_TryHandleStoreRegistrationWizard(platform, userId, tokenOrChat, userText, lowText) {
  var rawWiz = DB_GetSession(userId, "reg_wiz");
  if (!rawWiz) return false;

  if (lowText === "ยกเลิก" || lowText === "ปิด" || lowText === "cancel" || lowText === "1003") {
    DB_RemoveSession(userId, "reg_wiz");
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ยกเลิกการสมัครร้านค้า]\nออกจากโหมดเพิ่มร้านค้าใหม่เรียบร้อยครับ" }], UI_GetAdminHomeQr());
    return true;
  }

  var wiz = JSON.parse(rawWiz);

  if (wiz.step === 1) {
    wiz.name = userText.replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
    wiz.step = 2;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

    var step2Flex = {
      type: "flex",
      altText: "➕ สมัครร้านค้าใหม่ (2/7): ชื่อหัวบิล (" + wiz.name + ")",
      fallbackText: "➕ [2/7: ชื่อบริษัท/หัวบิล] พิมพ์ชื่อหัวบิล หรือกดข้าม:",
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#111111", paddingAll: "14px",
          contents: [
            { type: "text", text: "🧾 ขั้นที่ 2/7 : ชื่อบริษัท / นามออกบิล", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + wiz.name, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "2️⃣ พิมพ์ 'ชื่อบริษัท / นามออกบิล' (หรือกดปุ่มใช้ชื่อร้าน):", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("⚡ ใช้ชื่อร้านเป็นหัวบิล (ข้ามไปเบอร์โทร)", "ใช้ชื่อร้าน", "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step2Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 2) {
    if (userText === "ใช้ชื่อร้าน" || userText === "-") {
      wiz.companyName = wiz.name;
      wiz.step = 5;
      DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);
      return RT_SendRegStep5PhoneCard(platform, tokenOrChat, wiz);
    }
    wiz.companyName = userText.trim();
    wiz.step = 3;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

    var step3Flex = {
      type: "flex",
      altText: "➕ สมัครร้านค้าใหม่ (3/7): ที่อยู่ออกบิล",
      fallbackText: "➕ [3/7: ที่อยู่ออกบิล] พิมพ์ที่อยู่บริษัท:",
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#111111", paddingAll: "14px",
          contents: [
            { type: "text", text: "📍 ขั้นที่ 3/7 : ที่อยู่ออกบิล", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏢 " + wiz.companyName, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "3️⃣ พิมพ์ 'ที่อยู่สำหรับออกบิล' ได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("⏭️ ข้าม (ไม่ระบุที่อยู่)", "ข้าม", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step3Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 3) {
    wiz.address = (userText === "ข้าม" || userText === "-") ? "" : userText.trim();
    wiz.step = 4;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

    var step4Flex = {
      type: "flex",
      altText: "➕ สมัครร้านค้าใหม่ (4/7): เลขผู้เสียภาษี",
      fallbackText: "➕ [4/7: เลขผู้เสียภาษี] พิมพ์เลขผู้เสียภาษี 13 หลัก:",
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#111111", paddingAll: "14px",
          contents: [
            { type: "text", text: "🔢 ขั้นที่ 4/7 : เลขประจำตัวผู้เสียภาษี", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏢 " + wiz.companyName, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "4️⃣ พิมพ์ 'เลขประจำตัวผู้เสียภาษี 13 หลัก' ได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("⏭️ ข้าม (ไม่มีเลขผู้เสียภาษี)", "ข้าม", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step4Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 4) {
    wiz.taxId = (userText === "ข้าม" || userText === "-") ? "" : userText.trim();
    wiz.step = 5;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);
    return RT_SendRegStep5PhoneCard(platform, tokenOrChat, wiz);
  }

  if (wiz.step === 5) {
    wiz.phone = (userText === "ข้าม" || userText === "-") ? "-" : FMT_FormatThaiPhone(userText);
    wiz.step = 6;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

    var qrLoc = [
      { type: "action", action: { type: "location", label: "📍 แชร์โลเคชั่นร้าน" } },
      { type: "action", action: { type: "message", label: "🎛️ เมนูหลัก", text: "1003" } }
    ];
    var step6Flex = {
      type: "flex",
      altText: "➕ สมัครร้านค้าใหม่ (6/7): พิกัด Location",
      fallbackText: "➕ [6/7: พิกัดร้าน] แชร์โลเคชั่นจาก LINE หรือวางลิงก์ Google Maps:",
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#1B873F", paddingAll: "14px",
          contents: [
            { type: "text", text: "📍 ขั้นที่ 6/7 : พิกัดร้านค้า (Location)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + wiz.name + " • โทร: " + wiz.phone, size: "xs", color: "#E8F5E9", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "6️⃣ แตะปุ่ม '📍 แชร์โลเคชั่นร้าน' ด้านล่างจอ หรือวางลิงก์ Google Maps ได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("⏭️ ข้ามพิกัด", "ข้าม", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step6Flex], qrLoc);
    return true;
  }

  if (wiz.step === 6) {
    wiz.mapLink = (userText === "ข้าม" || userText === "-") ? "-" : userText.trim();
    wiz.step = 7;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);
    return RT_SendRegStep7PriceCard(platform, tokenOrChat, wiz);
  }

  if (wiz.step === 7) {
    var nums = userText.match(/\d+/g) || [];
    wiz.p15 = nums.length >= 1 ? parseInt(nums[0], 10) : 490;
    wiz.p48 = nums.length >= 2 ? parseInt(nums[1], 10) : 1530;
    wiz.pCan = nums.length >= 3 ? parseInt(nums[2], 10) : 790;
    wiz.step = 8;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 1200);

    var step8Flex = {
      type: "flex",
      altText: "➕ สมัครร้านค้าใหม่: เลือกเงื่อนไขชำระเงิน (" + wiz.name + ")",
      fallbackText: "➕ [เลือกเงื่อนไขชำระเงิน: " + wiz.name + "]",
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "14px",
          contents: [
            { type: "text", text: "💳 ขั้นสุดท้าย : เงื่อนไขการชำระเงิน", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + wiz.name + " (" + wiz.p15 + "/" + wiz.p48 + "/" + wiz.pCan + ")", size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            UI_MakeFlexBoxBtn("💵 ร้านทั่วไป (เงินสด / โอนรายบิล)", "reg_term_0", "#1DA1DB", "#FFFFFF", "sm"),
            UI_MakeFlexBoxBtn("🧾 เครดิต 15 วัน", "reg_term_15", "#111111", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("🧾 เครดิต 30 วัน", "reg_term_30", "#0288D1", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step8Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 8) {
    var term = "";
    if (lowText.indexOf("15") !== -1) term = "15";
    else if (lowText.indexOf("30") !== -1) term = "30";

    DB_RemoveSession(userId, "reg_wiz");

    var headerLines = [wiz.companyName || wiz.name];
    if (wiz.taxId) headerLines.push("เลขประจำตัวผู้เสียภาษี: " + wiz.taxId);
    if (wiz.address) headerLines.push("ที่อยู่: " + wiz.address);
    var fullBillingStr = headerLines.join("\n");

    var rawPipeStr = wiz.name + " | " + wiz.p15 + " | " + wiz.p48 + " | " + wiz.pCan + " | " + wiz.name + " | " + term + " | " + fullBillingStr + " | " + (wiz.mapLink || "-") + " | " + (wiz.phone || "-");
    var regResult = DB_RegisterNewStore(rawPipeStr);

    if (regResult.success && wiz.phone && wiz.phone !== "-") {
      DB_UpdateStoreField(regResult.storeId, "phone", wiz.phone);
    }

    if (!regResult.success) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "⚠️ [บันทึกไม่สำเร็จ]\n" + regResult.msg }], UI_GetAdminHomeQr());
      return true;
    }

    var termLabel = term ? ("เครดิต " + term + " วัน") : "เงินสด / โอนรายบิล";
    var doneRegFlex = {
      type: "flex",
      altText: "✅ เพิ่มร้านค้า " + regResult.storeName + " สำเร็จ!",
      fallbackText: "✅ [เพิ่มร้านค้าสำเร็จ]\nรหัส: " + regResult.storeId + "\nชื่อร้าน: " + regResult.storeName + "\nโค้ดผูกห้อง: #" + regResult.pairingCode,
      contents: {
        type: "bubble", size: "mega",
        header: {
          type: "box", layout: "vertical", backgroundColor: "#1B873F", paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ บันทึกร้านค้าใหม่สำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: "🏪 " + regResult.storeName, size: "xs", color: "#E8F5E9", margin: "xs", maxLines: 1 }
          ]
        },
        body: {
          type: "box", layout: "vertical", spacing: "xs", paddingAll: "14px", backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "🧾 หัวบิล: " + fullBillingStr, size: "xs", weight: "bold", color: "#111111", wrap: true },
            { type: "text", text: "📞 โทร: " + wiz.phone + " | 💳 เงื่อนไข: " + termLabel, size: "xs", color: "#333333", maxLines: 1 },
            { type: "text", text: "💰 ราคา: 15กก.=" + regResult.price15 + " | 48กก.=" + regResult.price48 + " | กระป๋อง=" + regResult.priceCan, size: "xs", weight: "bold", color: "#1DA1DB", maxLines: 1 },
            { type: "text", text: "🔗 โค้ดผูกห้อง LINE: #" + regResult.pairingCode, size: "xs", color: "#2E7D32", weight: "bold", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("⚙️ ตั้งค่าร้าน " + regResult.storeId, "ตั้งค่าร้าน_" + regResult.storeId, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("🛒 สั่งแก๊สร้านนี้เลย", "#เลือกร้าน-" + regResult.storeId, "#1DA1DB", "#FFFFFF", "xs")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [
      doneRegFlex,
      { type: "text", text: "#" + regResult.pairingCode }
    ], UI_GetAdminHomeQr());
    return true;
  }

  return false;
}

function RT_SendRegStep5PhoneCard(platform, tokenOrChat, wiz) {
  var step5Flex = {
    type: "flex",
    altText: "➕ สมัครร้านค้าใหม่ (5/7): เบอร์โทรศัพท์",
    fallbackText: "➕ [5/7: เบอร์โทรศัพท์] พิมพ์เบอร์โทรร้านค้า:",
    contents: {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "14px",
        contents: [
          { type: "text", text: "📞 ขั้นที่ 5/7 : เบอร์โทรศัพท์ร้านค้า", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🏪 " + wiz.name, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "5️⃣ พิมพ์ 'เบอร์โทรศัพท์' (เช่น 064-994-9565 หรือ 0649949565):", size: "xs", weight: "bold", color: "#111111", wrap: true },
          UI_MakeFlexBoxBtn("⏭️ ข้ามเบอร์โทร", "ข้าม", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [step5Flex], UI_GetAdminHomeQr());
  return true;
}

function RT_SendRegStep7PriceCard(platform, tokenOrChat, wiz) {
  var step7Flex = {
    type: "flex",
    altText: "➕ สมัครร้านค้าใหม่ (7/7): เรทราคา (" + wiz.name + ")",
    fallbackText: "➕ [7/7: กำหนดเรทราคา]",
    contents: {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1DA1DB", paddingAll: "14px",
        contents: [
          { type: "text", text: "💰 ขั้นที่ 7/7 : กำหนดเรทราคาร้านค้า", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "🏪 " + wiz.name, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "7️⃣ แตะเลือกเรทราคา หรือพิมพ์ตัวเลข 3 ค่า (15กก. 48กก. กระป๋อง):", size: "xs", weight: "bold", color: "#111111", wrap: true },
          UI_MakeFlexBoxBtn("⚡ ราคามาตรฐาน (490 / 1530 / 790)", "490 1530 790", "#1DA1DB", "#FFFFFF", "xs"),
          UI_MakeFlexBoxBtn("⚡ ราคาส่ง 480 / 1500 / 790", "480 1500 790", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิก", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [step7Flex], UI_GetAdminHomeQr());
  return true;
}

function RT_HandleLineLocationMessage(locMsg, userId, roomId, replyToken) {
  var lat = locMsg.latitude;
  var lng = locMsg.longitude;
  if (!lat || !lng) return;

  var coordStr = lat + "," + lng;
  var googleMapsNavUrl = "https://www.google.com/maps/dir/?api=1&destination=" + coordStr;

  var rawRegWiz = DB_GetSession(userId, "reg_wiz");
  if (rawRegWiz) {
    try {
      var regWiz = JSON.parse(rawRegWiz);
      if (regWiz.step === 6) {
        regWiz.mapLink = googleMapsNavUrl;
        regWiz.step = 7;
        DB_SetSession(userId, "reg_wiz", JSON.stringify(regWiz), 1200);
        RT_SendRegStep7PriceCard("LINE", replyToken, regWiz);
        return;
      }
    } catch (e) {}
  }

  var targetStoreId = null;
  var rawWiz = DB_GetSession(userId, "edit_store_wiz");
  if (rawWiz) {
    try { targetStoreId = JSON.parse(rawWiz).storeId; } catch (e) {}
    DB_RemoveSession(userId, "edit_store_wiz");
  }
  if (!targetStoreId) {
    var lockedStore = DB_GetSession(userId, "locked_store");
    if (lockedStore) {
      var stLock = DB_GetStoreById(lockedStore);
      if (stLock) targetStoreId = stLock.storeId;
    }
  }
  var roomInfo = DB_GetRoomRole(roomId);
  if (!targetStoreId && roomInfo.role === "STORE" && roomInfo.storeData) {
    targetStoreId = roomInfo.storeData.storeId;
  }

  if (targetStoreId) {
    var upd = DB_UpdateStoreField(targetStoreId, "googlemap", googleMapsNavUrl);
    if (upd.success) {
      var isStoreRoom = (roomInfo.role === "STORE");
      var locSavedFlex = {
        type: "flex",
        altText: "✅ บันทึกพิกัดร้าน " + upd.store.storeName + " สำเร็จ!",
        fallbackText: "✅ บันทึกพิกัดร้าน " + upd.store.storeName + " เรียบร้อย (" + coordStr + ")",
        contents: {
          type: "bubble", size: "mega",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#1B873F", paddingAll: "14px",
            contents: [
              { type: "text", text: "✅ บันทึกพิกัดร้านค้าสำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
              { type: "text", text: "🏪 " + upd.store.storeName, size: "xs", color: "#E8F5E9", margin: "xs", maxLines: 1 }
            ]
          },
          body: {
            type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", backgroundColor: "#FFFFFF",
            contents: [
              { type: "text", text: "📍 พิกัด GPS: " + coordStr, size: "xs", weight: "bold", color: "#111111", maxLines: 1 },
              UI_MakeFlexUriBtn("🗺️ ทดสอบนำทาง Google Maps", googleMapsNavUrl, "#E8F5E9", "#1B5E20", "xs", "#A5D6A7"),
              (!isStoreRoom
                ? UI_MakeFlexBoxBtn("⚙️ กลับหน้าตั้งค่าร้าน " + upd.store.storeId, "ตั้งค่าร้าน_" + upd.store.storeId, "#F4F5F7", "#111111", "xs")
                : UI_MakeFlexBoxBtn("🛒 กลับหน้าสั่งแก๊ส", "update", "#1DA1DB", "#FFFFFF", "xs"))
            ]
          }
        }
      };
      MSG_SendReply("LINE", replyToken, [locSavedFlex], isStoreRoom ? UI_GetStoreHomeQr() : UI_GetAdminHomeQr());
    }
  }
}
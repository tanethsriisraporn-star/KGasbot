// ==========================================
// ⚡ File: 08_ADM_Triggers_Edit.gs
// Version: 47.0 (Smart Bill Inspector Hiding Paid Actions, Row Tracking & Auto-Advance)
// Prefix: ADM_ / CRON_
// หมวด 6: TRIGGERS, AUTO-REMINDERS & ADMIN TOOLS
// ==========================================

function unlockDriveFileOnce(url) {
  if (!url || typeof url !== "string") return "";
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://lh3.googleusercontent.com/d/" + match[1] + "=w1200";
  }
  return "";
}

function onFormSubmit(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (lockErr) { return; }

  try {
    var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss);
    var lastRow = (e && e.range) ? e.range.getRow() : sheet.getLastRow();
    if (lastRow < 2) return;

    var idxMap = getColumnIndexes();
    var maxCols = Math.max(sheet.getLastColumn(), 26);
    var rowData = sheet.getRange(lastRow, 1, 1, maxCols).getValues()[0];

    var rawTs = rowData[idxMap.timestamp];
    var validDate = parseSheetDate(rawTs) || new Date();
    sheet.getRange(lastRow, idxMap.timestamp + 1).setValue(validDate).setNumberFormat("dd/MM/yyyy HH:mm:ss");

    var rawStore = rowData[idxMap.store] ? String(rowData[idxMap.store]).trim() : "-";
    var store = normalizeStoreName(rawStore);
    if (store !== rawStore && store !== "-") {
      sheet.getRange(lastRow, idxMap.store + 1).setValue(store);
    }

    var sender = rowData[idxMap.sender] ? String(rowData[idxMap.sender]).trim() : "ไม่ระบุ";
    if (sender === "ป่าน") {
      sender = "ปาน";
      sheet.getRange(lastRow, idxMap.sender + 1).setValue("ปาน");
    }

    var g15 = parseNum(rowData[idxMap.g15]);
    var g48 = parseNum(rowData[idxMap.g48]);
    var cans = parseNum(rowData[idxMap.cans]);
    var rawPayMethod = rowData[idxMap.payMethod] ? String(rowData[idxMap.payMethod]).trim() : "-";
    var equipCost = parseNum(rowData[idxMap.equip]);

    var storeInfo = DB_GetStoreById(store) || { price15: 490, price48: 1530, priceCan: 790, creditTerm: "" };
    var totalSales = (g15 * storeInfo.price15) + (g48 * storeInfo.price48) + (cans * storeInfo.priceCan) + equipCost;
    sheet.getRange(lastRow, idxMap.total + 1).setValue(totalSales);

    var payMethod = rawPayMethod;
    var newStatus = "ชำระแล้ว";

    if (rawPayMethod.indexOf("สด") !== -1 && rawPayMethod.indexOf("ผสม") === -1) {
      payMethod = "เงินสด";
      newStatus = "ชำระแล้ว";
    } else if (storeInfo.creditTerm === "15" || storeInfo.creditTerm === "30") {
      payMethod = "เครดิต";
      newStatus = "ค้างชำระ";
      if (payMethod !== rawPayMethod) sheet.getRange(lastRow, idxMap.payMethod + 1).setValue(payMethod);
    } else {
      if (rawPayMethod.indexOf("เครดิต") !== -1) {
        payMethod = "เงินโอน";
        sheet.getRange(lastRow, idxMap.payMethod + 1).setValue(payMethod);
      }
      newStatus = "รอตรวจสอบ";
    }

    var prepaidObj = (payMethod !== "เงินสด" && typeof DB_PopPrepaidStoreSlip === "function") ? DB_PopPrepaidStoreSlip(store) : null;
    if (prepaidObj && prepaidObj.slipUrl) {
      newStatus = "ชำระแล้ว";
      var nowStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
      sheet.getRange(lastRow, idxMap.transferSlip + 1, 1, 2).setValues([[prepaidObj.slipUrl, nowStr]]);
    }

    DB_MarkQueueDeliveredByStore(store);

    var currentOrderIdCell = String(sheet.getRange(lastRow, idxMap.orderId + 1).getValue() || "").trim();
    var newOrderId = "";
    if (currentOrderIdCell && currentOrderIdCell.startsWith("#") && !currentOrderIdCell.toUpperCase().startsWith("#Q")) {
      newOrderId = currentOrderIdCell.replace("#", "");
    } else {
      newOrderId = generateNextOrderId(sheet, idxMap.orderId);
    }

    sheet.getRange(lastRow, idxMap.orderId + 1, 1, 2).setValues([["#" + newOrderId, newStatus]]);

    var props = PropertiesService.getScriptProperties();
    props.setProperty("pending_15", String(parseNum(props.getProperty("pending_15")) + g15));
    props.setProperty("pending_48", String(parseNum(props.getProperty("pending_48")) + g48));
    props.setProperty("pending_can", String(parseNum(props.getProperty("pending_can")) + cans));

    DB_ClearTxCache();

    var items = [];
    if (g15 > 0) items.push("15กก.(" + g15 + ")");
    if (g48 > 0) items.push("48กก.(" + g48 + ")");
    if (cans > 0) items.push("กระป๋อง(" + cans + ")");

    var msg = `🔔 [บันทึกส่งแก๊สใหม่ #${newOrderId} • 📍 แถวที่ ${lastRow}]\n` +
              `🏪 ร้าน: ${store}\n📦 รายการ: ${items.join(", ") || "-"}\n` +
              `💰 ยอดรวม: ${totalSales.toLocaleString("en")} บ. (${payMethod})\n` +
              `👤 ผู้ส่ง: ${sender} | 📌 สถานะ: ${newStatus}`;

    sendTelegramMessage(msg);
  } catch (err) {
    Logger.log("onFormSubmit Error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

function ADM_PushMorningScheduledQueues() {
  try {
    let qSheet = DB_GetQueueSheetSafe();
    let pendingList = DB_GetPendingOrders(true);
    let morningQueues = [];

    for (let i = 0; i < pendingList.length; i++) {
      let q = pendingList[i];
      if (q.note && q.note.indexOf("[คิวส่งพรุ่งนี้ 09:00 น.]") !== -1 && q.note.indexOf("[แจ้งคิวเช้าแล้ว]") === -1) {
        morningQueues.push(q);
        let updatedNote = q.note + " [แจ้งคิวเช้าแล้ว]";
        qSheet.getRange(q.rowIdx, COL_QUEUE.note + 1).setValue(updatedNote);
      }
    }

    if (morningQueues.length > 0) {
      for (let m = 0; m < morningQueues.length; m++) {
        let item = morningQueues[m];
        let qFlex = Staff_BuildSingleQueueFlexCard(item, m + 1, morningQueues.length, false);
        MSG_PushLine(DB_GetStaffGroupId(), [qFlex], UI_GetStaffHomeQr());
      }
      TG_SendNotification(`🌅 แจ้งเตือนคิวส่งแก๊สภาคเช้า (09:00 น.) ที่สั่งไว้เมื่อคืน จำนวน ${morningQueues.length} คิว เข้าห้องพนักงานเรียบร้อยครับ`);
      DB_ClearTxCache();
    }
  } catch (e) {
    Logger.log("ADM_PushMorningScheduledQueues Error: " + e.message);
  }
}

function ADM_AutoSend2DayStoreReminders() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    let ss = DB_GetSpreadsheet();
    let sheet = getTargetSheet(ss);
    let idxMap = getColumnIndexes();
    let now = new Date();

    if (now.getHours() >= 8 && now.getHours() <= 11) {
      ADM_PushMorningScheduledQueues();
    }

    if (now.getDate() === 1) {
      let archRes = DB_ArchiveCompletedMonthlySales();
      if (archRes.archivedCount > 0) {
        TG_SendNotification(`🗄️ [สำรองบิลรายเดือนอัตโนมัติ] สำรองบิลเดือนก่อนที่ชำระแล้วจำนวน ${archRes.archivedCount} รายการ เข้าแฟ้มรายเดือนเรียบร้อยครับ`);
      }
    }

    let allTx = DB_GetTransactions();
    let allStores = DB_GetAllActiveStores();

    let storeMap = {};
    for (let s = 0; s < allStores.length; s++) {
      storeMap[allStores[s].storeName] = allStores[s];
    }

    let bName = getConfigValue("BANK_NAME", "ธนาคารกรุงเทพ");
    let bAcc = getConfigValue("BANK_ACCOUNT", "252-451-1777");
    let bOwner = getConfigValue("BANK_OWNER", "นายภานุพงศ์ ดุมคำ");

    for (let i = 0; i < allTx.length; i++) {
      let tx = allTx[i];
      if (tx.status === "ยกเลิก" || tx.status === "รอดำเนินการ" || tx.status === "จัดส่งแล้ว" || tx.status.indexOf("ชำระแล้ว") !== -1) continue;
      if (tx.payMethod.indexOf("โอน") === -1) continue;
      if (tx.note && tx.note.indexOf("[แจ้งเตือน2วันแล้ว]") !== -1) continue;

      let rDate = parseSheetDate(tx.date);
      if (!rDate || rDate < CONFIG.CUTOFF_PENDING || rDate.getTime() > now.getTime()) continue;

      let stObj = storeMap[tx.store];
      if (stObj && (stObj.creditTerm === "15" || stObj.creditTerm === "30")) continue;

      let hoursDiff = Math.floor((now - rDate) / 3600000);
      if (hoursDiff >= 48) {
        let newNote = (tx.note ? tx.note + " " : "") + "[แจ้งเตือน2วันแล้ว]";
        sheet.getRange(tx.rowIdx, idxMap.note + 1).setValue(newNote);

        if (stObj && stObj.groupId) {
          let groupList = stObj.groupId.split(",").map(g => g.trim()).filter(Boolean);
          if (groupList.length > 0) {
            let debtDetails = DB_GetStoreDebtDetails(stObj.storeName);
            let oId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;

            let remindFlex = {
              type: "flex",
              altText: `🧾 แจ้งเตือนยอดค้างชำระ (${stObj.storeName})`,
              fallbackText: `🧾 [แจ้งเตือนยอดค้างชำระค่าแก๊ส]\n🏪 ร้าน: ${stObj.storeName}\n🔖 บิล: ${oId} | ยอดรวมร้าน: ${debtDetails.pendingDebt.toLocaleString("en")} บาท\n🏦 โอนเข้า: ${bName} ${bAcc} (${bOwner})`,
              contents: {
                type: "bubble",
                size: "mega",
                header: {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#1DA1DB",
                  paddingAll: "14px",
                  contents: [
                    { type: "text", text: "🧾 แจ้งเตือนยอดค้างชำระค่าแก๊ส", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
                    { type: "text", text: `🏪 ${stObj.storeName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
                  ]
                },
                body: {
                  type: "box",
                  layout: "vertical",
                  spacing: "xs",
                  paddingAll: "14px",
                  backgroundColor: "#FFFFFF",
                  contents: [
                    { type: "text", text: `🔖 บิลครบกำหนด: ${oId} (${tx.total.toLocaleString("en")} บ.)`, size: "xs", color: "#333333", maxLines: 1 },
                    { type: "text", text: `💰 ยอดค้างรวมสุทธิ: ${debtDetails.pendingDebt.toLocaleString("en")} บาท`, size: "sm", weight: "bold", color: "#B71C1C", maxLines: 1 },
                    { type: "separator", margin: "sm", color: "#E0E0E0" },
                    { type: "text", text: `🏦 ${bName} : ${bAcc} (${bOwner})`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
                    { type: "text", text: "📸 โอนแล้วส่งรูปสลิปโอนเงินลงในห้องแชทนี้ได้ทันทีค่ะ", size: "xxs", color: "#1DA1DB", maxLines: 1, adjustMode: "shrink-to-fit" },
                    UI_MakeFlexBoxBtn("📄 ดูใบแจ้งหนี้ (รูปภาพ)", `ขอดูใบแจ้งหนี้ ${stObj.storeId}`, "#F0F8FC", "#111111", "xs", "#CBE6F6")
                  ]
                }
              }
            };

            MSG_PushLine(groupList[0], [remindFlex], UI_GetStoreHomeQr());
            TG_SendNotification(`📢 ส่งการ์ดแจ้งเตือนยอดค้าง (ครบ 2 วัน) ให้ร้าน ${stObj.storeName} บิล ${oId} เรียบร้อยครับ`);
          }
        }
      }
    }
    DB_ClearTxCache();
  } catch (e) {
    Logger.log("ADM_AutoSend2DayStoreReminders Error: " + e.message);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function ADM_InspectBill(platform, tokenOrChat, billNo) {
  var allTx = DB_GetTransactions();
  var tx = DB_FindTxByBillNo(billNo, allTx);
  if (tx) {
    var dispId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
    var rowKey = "ROW-" + tx.rowIdx;
    var dObj = parseSheetDate(tx.date);
    var dStr = dObj ? Utilities.formatDate(dObj, "GMT+7", "dd/MM/yy HH:mm") : "-";
    var isPaid = (tx.status && tx.status.indexOf("ชำระแล้ว") !== -1);
    var items = [];
    if (tx.g15 > 0) items.push("15กก.(" + tx.g15 + ")");
    if (tx.g48 > 0) items.push("48กก.(" + tx.g48 + ")");
    if (tx.cans > 0) items.push("กระป๋อง(" + tx.cans + ")");

    var bodyContents = [
      { type: "text", text: `🏪 ${tx.store}`, size: "sm", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
      { type: "text", text: `📦 รายการ: ${items.join(", ") || "-"} | 👤 ผู้ส่ง: ${tx.sender}`, size: "xs", color: "#333333", maxLines: 1, adjustMode: "shrink-to-fit" },
      { type: "text", text: `💰 ยอดค่าแก๊ส: ${tx.total.toLocaleString("en")} บ. (${tx.payMethod})`, size: "xs", weight: "bold", color: "#1DA1DB", maxLines: 1 },
      (tx.fuelCost > 0
        ? { type: "text", text: `⛽ เบิกน้ำมัน: -${tx.fuelCost.toLocaleString("en")} บ.`, size: "xxs", weight: "bold", color: "#B71C1C", maxLines: 1 }
        : { type: "text", text: "⛽ เบิกน้ำมัน: 0 บ.", size: "xxs", color: "#888888", maxLines: 1 }),
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: `📌 สถานะ: ${tx.status}`, size: "xs", weight: "bold", color: isPaid ? "#2E7D32" : "#E65100", flex: 3, maxLines: 1 },
          { type: "text", text: `📍 แถว ${tx.rowIdx} ในชีท`, size: "xxs", weight: "bold", color: "#555555", align: "end", flex: 2, maxLines: 1 }
        ]
      },
      { type: "separator", margin: "sm", color: "#E0E0E0" }
    ];

    if (!isPaid) {
      bodyContents.push({
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

    bodyContents.push(UI_MakeFlexBoxBtn("📝 แก้ไขวิธีชำระ / สถานะบิลนี้", `edit ${rowKey}`, "#F4F5F7", "#111111", "xs"));

    var inspectFlex = {
      type: "flex",
      altText: `🔍 บิล ${dispId} (📍 แถวที่ ${tx.rowIdx})`,
      fallbackText: `🔍 [รายละเอียดบิล ${dispId} • 📍 แถวที่ ${tx.rowIdx}]\n🏪 ร้าน: ${tx.store}\n📅 วันที่: ${dStr}\n💰 ยอด: ${tx.total.toLocaleString("en")} บ. (${tx.payMethod}) | สถานะ: ${tx.status}`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#1DA1DB",
          paddingAll: "12px",
          contents: [
            { type: "text", text: `🔍 บิล ${dispId}`, weight: "bold", size: "sm", color: "#FFFFFF", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `📍 แถวที่ ${tx.rowIdx} (${dStr})`, size: "xxs", color: "#E8F6FC", align: "end", flex: 3, maxLines: 1, adjustMode: "shrink-to-fit" }
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

    var bubbles = [inspectFlex];
    var mUrl = getPublicDirectImageUrl(tx.matchSlipUrl);
    if (mUrl) bubbles.push({ type: "image", originalContentUrl: mUrl, previewImageUrl: mUrl });

    MSG_SendReply(platform, tokenOrChat, bubbles, UI_GetAdminHomeQr());
    return;
  }

  MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบบิล]\nไม่พบบิลหมายเลข #${billNo} ในระบบครับ` }], UI_GetAdminHomeQr());
}

function ADM_HandleEditCommand(platform, userId, tokenOrChat, userText) {
  var m = userText.match(/^edit\s+#?([A-Za-z0-9_-]+)(?:\s+(.*))?$/i);
  if (!m) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "🛠️ [แก้ไขบิล]\nรูปแบบคำสั่ง: edit #เลขบิล (หรือ edit #เลขบิล total=980 fuel=500)" }], UI_GetAdminHomeQr());
    return;
  }
  var billNo = m[1];
  var extraParams = m[2] ? m[2].trim() : "";

  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var allTx = DB_GetTransactions();
  var tx = DB_FindTxByBillNo(billNo, allTx);

  if (!tx) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบบิล]\nไม่พบบิลหมายเลข #${billNo} ในระบบครับ` }], UI_GetAdminHomeQr());
    return;
  }

  var dispId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
  var rowKey = "ROW-" + tx.rowIdx;

  if (extraParams) {
    var changes = [];
    var storeInfo = DB_GetStoreById(tx.store) || { price15: 490, price48: 1530, priceCan: 790 };
    var g15 = tx.g15, g48 = tx.g48, cans = tx.cans;
    var qtyChanged = false;

    var m15 = extraParams.match(/(?:15|g15)\s*=\s*(\d+)/i);
    if (m15) {
      g15 = parseInt(m15[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.g15 + 1).setValue(g15);
      changes.push(`ถัง 15กก. = ${g15}`);
      qtyChanged = true;
    }
    var m48 = extraParams.match(/(?:48|g48)\s*=\s*(\d+)/i);
    if (m48) {
      g48 = parseInt(m48[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.g48 + 1).setValue(g48);
      changes.push(`ถัง 48กก. = ${g48}`);
      qtyChanged = true;
    }
    var mCan = extraParams.match(/(?:can|กระป๋อง)\s*=\s*(\d+)/i);
    if (mCan) {
      cans = parseInt(mCan[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.cans + 1).setValue(cans);
      changes.push(`กระป๋อง = ${cans}`);
      qtyChanged = true;
    }

    if (qtyChanged) {
      var newTotal = (g15 * storeInfo.price15) + (g48 * storeInfo.price48) + (cans * storeInfo.priceCan);
      sheet.getRange(tx.rowIdx, idxMap.total + 1).setValue(newTotal);
      changes.push(`คำนวณยอดรวมใหม่ = ${newTotal.toLocaleString("en")} บ.`);
    }

    var mTot = extraParams.match(/(?:total|ยอด)\s*=\s*(\d+)/i);
    if (mTot) {
      var tVal = parseInt(mTot[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.total + 1).setValue(tVal);
      changes.push(`ยอดรวม = ${tVal.toLocaleString("en")} บ.`);
    }

    var mFuel = extraParams.match(/(?:fuel|น้ำมัน)\s*=\s*(\d+)/i);
    if (mFuel) {
      var fVal = parseInt(mFuel[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.fuel + 1).setValue(fVal);
      changes.push(`ค่าน้ำมัน = ${fVal.toLocaleString("en")} บ.`);
    }

    var mCash = extraParams.match(/(?:cash|สด)\s*=\s*(\d+)/i);
    if (mCash) {
      var cVal = parseInt(mCash[1], 10);
      sheet.getRange(tx.rowIdx, idxMap.cashReceived + 1).setValue(cVal);
      changes.push(`รับเงินสด = ${cVal.toLocaleString("en")} บ.`);
    }

    if (changes.length > 0) {
      sheet.getRange(tx.rowIdx, idxMap.orderId + 1).setValue(dispId);
      DB_ClearTxCache();
      MSG_SendReply(platform, tokenOrChat, [{
        type: "text",
        text: `✅ [แก้ไขบิล ${dispId} • แถวที่ ${tx.rowIdx} สำเร็จ]\nร้าน: ${tx.store}\n• ${changes.join("\n• ")}`
      }], UI_GetAdminHomeQr());
      return;
    }
  }

  var editFlex = {
    type: "flex",
    altText: `🛠️ แก้ไขบิล ${dispId} (📍 แถวที่ ${tx.rowIdx})`,
    fallbackText: `🛠️ [แก้ไขบิล ${dispId} • 📍 แถวที่ ${tx.rowIdx}] เลือกการตั้งค่าที่ต้องการเปลี่ยนได้เลยครับ:`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `🛠️ แก้ไขบิล ${dispId} (📍 แถวที่ ${tx.rowIdx})`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `🏪 ${tx.store} (${tx.total.toLocaleString("en")} บ.)`, size: "xs", color: "#CCCCCC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "เปลี่ยนวิธีชำระเงิน", size: "xs", weight: "bold", color: "#555555", maxLines: 1 },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            contents: [
              UI_MakeFlexBoxBtn("💵 เงินสด", `setpay_${rowKey}_เงินสด`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("📲 เงินโอน", `setpay_${rowKey}_เงินโอน`, "#F0F8FC", "#111111", "xxs", "#CBE6F6"),
              UI_MakeFlexBoxBtn("🧾 เครดิต", `setpay_${rowKey}_เครดิต`, "#F0F8FC", "#111111", "xxs", "#CBE6F6")
            ]
          },
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          { type: "text", text: "เปลี่ยนสถานะบิล", size: "xs", weight: "bold", color: "#555555", maxLines: 1 },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              UI_MakeFlexBoxBtn("✅ ชำระแล้ว", `setstatus_${rowKey}_ชำระแล้ว`, "#1DA1DB", "#FFFFFF", "xs"),
              UI_MakeFlexBoxBtn("⏳ ค้างชำระ", `setstatus_${rowKey}_ค้างชำระ`, "#F4F5F7", "#111111", "xs")
            ]
          },
          UI_MakeFlexBoxBtn("❌ ยกเลิกบิลนี้", `setstatus_${rowKey}_ยกเลิก`, "#FFF3E0", "#B71C1C", "xs", "#FFCC80"),
          { type: "separator", margin: "sm", color: "#E0E0E0" },
          {
            type: "text",
            text: `💡 พิมพ์แก้ตัวเลข: edit ${dispId} total=980 หรือ fuel=500`,
            size: "xxs",
            color: "#666666",
            maxLines: 1,
            adjustMode: "shrink-to-fit"
          }
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [editFlex], UI_GetAdminHomeQr());
}

function ADM_HandleQuickEditButton(platform, userId, tokenOrChat, userText) {
  var mPay = userText.match(/^setpay_([A-Za-z0-9_-]+)_(.+)$/i);
  var mSt = userText.match(/^setstatus_([A-Za-z0-9_-]+)_(.+)$/i);
  if (!mPay && !mSt) return;

  var billNo = mPay ? mPay[1] : mSt[1];
  var newVal = mPay ? mPay[2] : mSt[2];
  var isPayEdit = Boolean(mPay);

  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var allTx = DB_GetTransactions();
  var tx = DB_FindTxByBillNo(billNo, allTx);

  if (!tx) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ไม่พบบิล]\nไม่พบบิล #${billNo} ในระบบครับ` }], UI_GetAdminHomeQr());
    return;
  }

  var safeOrderId = tx.orderId.indexOf("#") === 0 ? tx.orderId : "#" + tx.orderId;
  sheet.getRange(tx.rowIdx, idxMap.orderId + 1).setValue(safeOrderId);

  if (isPayEdit) {
    sheet.getRange(tx.rowIdx, idxMap.payMethod + 1).setValue(newVal);
    if (newVal === "เงินสด") sheet.getRange(tx.rowIdx, idxMap.status + 1).setValue("ชำระแล้ว");
    else if (newVal === "เงินโอน") sheet.getRange(tx.rowIdx, idxMap.status + 1).setValue("รอตรวจสอบ");
    else if (newVal === "เครดิต") sheet.getRange(tx.rowIdx, idxMap.status + 1).setValue("ค้างชำระ");
  } else {
    sheet.getRange(tx.rowIdx, idxMap.status + 1).setValue(newVal);
    if (newVal === "ชำระแล้ว") {
      var cleanKey = safeOrderId.replace("#", "");
      var cachedSlipUrl = CacheService.getScriptCache().get("slip_url_" + cleanKey) ||
                          CacheService.getScriptCache().get("UNMATCHED_SLIP_" + userId) ||
                          CacheService.getScriptCache().get("UNMATCHED_SLIP_GLOBAL");
      if (cachedSlipUrl && !tx.matchSlipUrl) {
        var nowTimeStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
        sheet.getRange(tx.rowIdx, idxMap.transferSlip + 1, 1, 2).setValues([[cachedSlipUrl, nowTimeStr]]);
      }
    }
  }

  DB_ClearTxCache();

  var remainingPending = (typeof FIN_GetFilteredPendingRows === "function") ? FIN_GetFilteredPendingRows(null) : [];

  var doneEditFlex = {
    type: "flex",
    altText: `✅ อัปเดตบิล ${safeOrderId} (แถว ${tx.rowIdx}) เป็น "${newVal}" สำเร็จ`,
    fallbackText: `✅ อัปเดตบิล ${safeOrderId} (📍 แถวที่ ${tx.rowIdx} • ${tx.store}) เป็น "${newVal}" เรียบร้อยแล้วครับ`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "12px",
        contents: [
          { type: "text", text: `✅ อัปเดตบิล ${safeOrderId} • 📍 แถวที่ ${tx.rowIdx}`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `🏪 ${tx.store}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
          { type: "text", text: `📌 สถานะใหม่: ${newVal} (${tx.total.toLocaleString("en")} บ.)`, size: "xs", weight: "bold", color: "#2E7D32", maxLines: 1 },
          { type: "text", text: `📋 บิลรอโอนคงเหลือ (ตั้งแต่ 1 พ.ย. 69): ${remainingPending.length} บิล`, size: "xs", color: "#555555", maxLines: 1, adjustMode: "shrink-to-fit" },
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

  var replyBubbles = [doneEditFlex];

  if (remainingPending.length > 0 && (newVal === "ชำระแล้ว" || newVal === "ยกเลิก" || newVal === "เงินสด")) {
    var nextItem = remainingPending[0].tx;
    var nextDate = remainingPending[0].dateObj;
    var nextPages = Math.ceil(remainingPending.length / 2);
    if (typeof FIN_BuildPendingBillFlexBubble === "function") {
      replyBubbles.push(FIN_BuildPendingBillFlexBubble(nextItem, nextDate, 1, nextPages, remainingPending.length, null, true));
    }
  }

  MSG_SendReply(platform, tokenOrChat, replyBubbles, UI_GetAdminHomeQr());
}

function updateFormDropdown() {
  try {
    if (!CONFIG.FORM_ID) return;
    var form = FormApp.openById(CONFIG.FORM_ID);
    var items = form.getItems();
    var storeNames = getStoreDatabaseMap();
    if (storeNames.length === 0) return;
    for (var i = 0; i < items.length; i++) {
      var title = items[i].getTitle();
      if (title.indexOf("ร้าน") !== -1 || title.indexOf("ลูกค้า") !== -1) {
        if (items[i].getType() === FormApp.ItemType.LIST) items[i].asListItem().setChoiceValues(storeNames);
        else if (items[i].getType() === FormApp.ItemType.MULTIPLE_CHOICE) items[i].asMultipleChoiceItem().setChoiceValues(storeNames);
        break;
      }
    }
  } catch (e) {}
}

function checkAndRunEveningClose() {
  var now = new Date();
  if (now.getHours() === 20) {
    var props = PropertiesService.getScriptProperties();
    var todayStr = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
    if (props.getProperty("last_evening_close") === todayStr) return;
    props.setProperty("last_evening_close", todayStr);
    DB_MigrateAndCleanBotRowsFromMainSheet(true);
    sendDailyReport();
    ADM_AutoSend2DayStoreReminders();
  }
}

function sendDailyReport() {
  var ss = DB_GetSpreadsheet(), sheet = getTargetSheet(ss), idxMap = getColumnIndexes();
  var todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  var s = calculateDailySummary(sheet, idxMap, todayStr);
  var msg = `🌙 [สรุปปิดยอดประจำวัน: ${todayStr}]\n--------------------------------------\n` +
            `• ยอดขายรวม: ${s.totalSales.toLocaleString("en")} บาท (${s.orderCount} บิล)\n` +
            `• เงินสดสุทธิวันนี้: ${s.netCashReturn.toLocaleString("en")} บาท\n` +
            `• โอนรอสลิป: ${s.transferPendingSales.toLocaleString("en")} บาท\n` +
            `• เครดิต: ${s.creditSales.toLocaleString("en")} บาท`;
  sendDualPush(msg);
}

function sendBilling15Days() {
  ADM_AutoSend2DayStoreReminders();
}

function sendBilling30Days() {
  ADM_AutoSend2DayStoreReminders();
}

function setupSystemTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);

  var ss = DB_GetSpreadsheet();
  ScriptApp.newTrigger("onFormSubmit").forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger("checkAndRunEveningClose").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("ADM_AutoSend2DayStoreReminders").timeBased().everyDays(1).atHour(9).create();
}
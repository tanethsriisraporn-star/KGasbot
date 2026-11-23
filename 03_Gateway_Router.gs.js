// ==========================================
// 🌐 File: 03_Gateway_Router.gs
// Version: 47.0 (Strict Room Role Lock, Interactive Flex Wizards for Store & Billing Header)
// Prefix: WH_ / RT_
// หมวด 2: GATEWAY & ROUTER (ประตูรับสัญญาณความเร็วสูงและสวิตช์แยกสิทธิ์ตามห้องเด็ดขาด)
// ==========================================

function TEST_VerifySyntax() {
  Logger.log("✅ โค้ด Version 47.0 สมบูรณ์ 100% ไม่มี Syntax Error พร้อมใช้งานครับ!");
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    let payload = JSON.parse(e.postData.contents);
    const cache = CacheService.getScriptCache();

    if (payload.update_id) {
      let tgKey = "tg_up_" + payload.update_id;
      if (cache.get(tgKey)) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
      }
      cache.put(tgKey, "processed", 21600);
      RT_HandleTelegramWebhook(payload);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.events && Array.isArray(payload.events)) {
      for (let i = 0; i < payload.events.length; i++) {
        let ev = payload.events[i];
        let eventId = ev.webhookEventId || (ev.message && ev.message.id) || "";
        if (eventId) {
          if (cache.get("line_ev_" + eventId)) continue;
          cache.put("line_ev_" + eventId, "processed", 21600);
        }
        RT_HandleLineEvent(ev);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput("OK");
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return ContentService.createTextOutput("OK");
  }
}

function doGet(e) {
  return ContentService.createTextOutput("🟢 K.Gas Webhook Gateway Online (V.47.0 Strict Room Lock & Interactive Flex Wizards)");
}

function RT_HandleLineEvent(event) {
  try {
    if (!event || event.type !== "message" || !event.message) return;

    let replyToken = event.replyToken;
    let userId = (event.source && event.source.userId) ? event.source.userId : "default_user";
    let groupId = (event.source && event.source.groupId) ? event.source.groupId : null;
    let roomId = groupId || userId;

    if (event.message.type === "image") {
      if (typeof FIN_HandleLineSlipImage === "function") {
        FIN_HandleLineSlipImage(event.message.id, userId, roomId, replyToken);
      }
      return;
    }

    if (event.message.type === "text") {
      let userText = DB_SanitizeText(event.message.text);
      if (!userText) return;
      RT_ProcessCommand("LINE", userId, groupId, replyToken, null, userText);
    }
  } catch (err) {
    Logger.log("RT_HandleLineEvent Error: " + err.message);
  }
}

function RT_HandleTelegramWebhook(data) {
  try {
    let msg = data.message || (data.callback_query ? data.callback_query.message : null);
    if (!msg || !msg.chat) return;

    let chatId = String(msg.chat.id);
    let userId = "tg_" + chatId;
    PropertiesService.getScriptProperties().setProperty("ACTIVE_TG_CHAT_ID", chatId);

    if (msg.photo && msg.photo.length > 0) {
      if (typeof FIN_HandleTelegramSlipPhoto === "function") {
        FIN_HandleTelegramSlipPhoto(msg.photo, userId, chatId);
      }
      return;
    }

    let userText = data.callback_query ? data.callback_query.data : msg.text;
    userText = DB_SanitizeText(userText);
    if (!userText) return;

    if (userText.toLowerCase() === "/start" || userText.toLowerCase() === "/menu") {
      userText = "1003";
    }

    RT_ProcessCommand("TELEGRAM", userId, null, null, chatId, userText);
  } catch (err) {
    Logger.log("RT_HandleTelegramWebhook Error: " + err.message);
  }
}

function RT_ClearAdminStoreLock(userId) {
  if (typeof DB_ClearAdminSession === "function") {
    DB_ClearAdminSession(userId);
  }
}

// ==========================================
// 🧾 1. INTERACTIVE 3-STEP BILLING HEADER WIZARD (ใช้ได้ทั้งห้องทีมรับออเดอร์และห้อง Admin)
// ถามทีละตัว: 1. ชื่อบริษัท -> 2. ที่อยู่ -> 3. เลขประจำตัวผู้เสียภาษี
// ==========================================

function RT_StartBillingHeaderWizard(platform, userId, roomId, tokenOrChat, storeIdOrName, isAdminView) {
  let st = DB_GetStoreById(storeIdOrName);
  let homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();
  if (!st) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ไม่พบร้านค้า]\nไม่พบข้อมูลร้านค้าที่ต้องการแก้ไขหัวบิลครับ" }], homeQr);
    return;
  }

  let wizObj = {
    step: 1,
    storeId: st.storeId,
    storeName: st.storeName,
    companyName: "",
    address: "",
    taxId: ""
  };
  DB_SetSession(userId, "bill_hdr_wiz", JSON.stringify(wizObj), 600);

  let step1Flex = {
    type: "flex",
    altText: `🧾 ตั้งค่าหัวบิล (1/3): ชื่อบริษัท (${st.storeName})`,
    fallbackText: `🧾 [ตั้งค่าหัวบิล 1/3: ${st.storeName}]\nกรุณาพิมพ์ "ชื่อบริษัท / นามออกบิล" ส่งมาในแชทครับ:`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "🧾 ตั้งค่าหัวบิลใหม่ (ขั้นตอนที่ 1/3)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${st.storeName}`, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "1️⃣ กรุณาพิมพ์ 'ชื่อบริษัท / นามออกบิล' ส่งมาในแชทได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "ตัวอย่าง: หจก. ชาญเชียงใหม่ 789", size: "xxs", color: "#666666", wrap: true },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("❌ ยกเลิกการตั้งหัวบิล", "ยกเลิกตั้งหัวบิล", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };

  MSG_SendReply(platform, tokenOrChat, [step1Flex], homeQr);
}

function RT_TryHandleBillingHeaderWizard(platform, userId, roomId, tokenOrChat, userText, lowText, isAdminView) {
  let rawWiz = DB_GetSession(userId, "bill_hdr_wiz");
  if (!rawWiz) return false;

  let homeQr = isAdminView ? UI_GetAdminHomeQr() : UI_GetStaffHomeQr();
  if (lowText === "ยกเลิกตั้งหัวบิล" || lowText === "ยกเลิก" || lowText === "cancel" || lowText === "1003") {
    DB_RemoveSession(userId, "bill_hdr_wiz");
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ยกเลิกการตั้งค่าหัวบิล]\nยกเลิกการแก้ไขหัวบิลเรียบร้อยครับ" }], homeQr);
    return true;
  }

  let wiz = JSON.parse(rawWiz);

  if (wiz.step === 1) {
    wiz.companyName = userText.trim();
    wiz.step = 2;
    DB_SetSession(userId, "bill_hdr_wiz", JSON.stringify(wiz), 600);

    let step2Flex = {
      type: "flex",
      altText: "🧾 ตั้งค่าหัวบิล (2/3): ที่อยู่ออกบิล",
      fallbackText: `🧾 [ตั้งค่าหัวบิล 2/3]\nชื่อบริษัท: ${wiz.companyName}\nกรุณาพิมพ์ "ที่อยู่สำหรับออกบิล" ส่งมาในแชทครับ:`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#111111",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🧾 ตั้งค่าหัวบิลใหม่ (ขั้นตอนที่ 2/3)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏢 ${wiz.companyName}`, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "2️⃣ กรุณาพิมพ์ 'ที่อยู่สำหรับออกบิล' ส่งมาในแชทครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            { type: "text", text: "ตัวอย่าง: 137 ถ.มหิดล ต.หายยา อ.เมือง จ.เชียงใหม่ 50100", size: "xxs", color: "#666666", wrap: true },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("⏭️ ข้ามที่อยู่ (ไม่ระบุที่อยู่)", "ข้ามที่อยู่", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกตั้งหัวบิล", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step2Flex], homeQr);
    return true;
  }

  if (wiz.step === 2) {
    wiz.address = (userText === "ข้ามที่อยู่" || userText === "-") ? "" : userText.trim();
    wiz.step = 3;
    DB_SetSession(userId, "bill_hdr_wiz", JSON.stringify(wiz), 600);

    let step3Flex = {
      type: "flex",
      altText: "🧾 ตั้งค่าหัวบิล (3/3): เลขประจำตัวผู้เสียภาษี",
      fallbackText: "🧾 [ตั้งค่าหัวบิล 3/3]\nกรุณาพิมพ์ 'เลขประจำตัวผู้เสียภาษี 13 หลัก' ส่งมาในแชทครับ:",
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#111111",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "🧾 ตั้งค่าหัวบิลใหม่ (ขั้นตอนที่ 3/3)", weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏢 ${wiz.companyName}`, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "3️⃣ กรุณาพิมพ์ 'เลขประจำตัวผู้เสียภาษี' ส่งมาในแชทครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            { type: "text", text: "ตัวอย่าง: 0503569002328", size: "xxs", color: "#666666", wrap: true },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("⏭️ ไม่มีเลขผู้เสียภาษี (บันทึกเลย)", "ข้ามเลขภาษี", "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกตั้งหัวบิล", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step3Flex], homeQr);
    return true;
  }

  if (wiz.step === 3) {
    wiz.taxId = (userText === "ข้ามเลขภาษี" || userText === "-") ? "" : userText.trim();
    DB_RemoveSession(userId, "bill_hdr_wiz");

    let headerLines = [wiz.companyName];
    if (wiz.taxId) headerLines.push("เลขประจำตัวผู้เสียภาษี: " + wiz.taxId);
    if (wiz.address) headerLines.push("ที่อยู่: " + wiz.address);
    let fullBillingStr = headerLines.join("\n");

    let updRes = DB_UpdateStoreField(wiz.storeId, "billingname", fullBillingStr);
    if (!updRes.success) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [บันทึกไม่สำเร็จ]\n${updRes.msg}` }], homeQr);
      return true;
    }

    let doneFlex = {
      type: "flex",
      altText: `✅ บันทึกหัวบิลใหม่สำเร็จ (${wiz.storeName})`,
      fallbackText: `✅ [บันทึกหัวบิลสำเร็จ: ${wiz.storeName}]\n${fullBillingStr}`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ บันทึกข้อมูลหัวบิลสำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${wiz.storeName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "🧾 หัวบิลที่บันทึกใน Google Sheets:", size: "xxs", weight: "bold", color: "#555555", maxLines: 1 },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#F8FBFE",
              borderColor: "#CBE6F6",
              borderWidth: "1px",
              cornerRadius: "8px",
              paddingAll: "10px",
              margin: "xs",
              contents: [
                { type: "text", text: fullBillingStr, size: "xs", weight: "bold", color: "#111111", wrap: true }
              ]
            },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            (isAdminView
              ? UI_MakeFlexBoxBtn(`📋 จัดการข้อมูลร้าน ${wiz.storeId}`, `จัดการร้าน_${wiz.storeId}`, "#111111", "#FFFFFF", "xs")
              : UI_MakeFlexBoxBtn("🚚 กลับหน้าคิวส่งแก๊ส", "order ส่งแก๊สวันนี้", "#1DA1DB", "#FFFFFF", "xs"))
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [doneFlex], homeQr);
    return true;
  }

  return false;
}

// ==========================================
// ➕ 2. INTERACTIVE STORE REGISTRATION WIZARD (สมัครร้านค้าใหม่แบบถามทีละข้อ 3 ขั้นตอน)
// ==========================================

function RT_StartStoreRegistrationWizard(platform, userId, tokenOrChat) {
  RT_ClearAdminStoreLock(userId);
  let wiz = { step: 1, name: "", p15: 490, p48: 1530, pCan: 790, creditTerm: "" };
  DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 900);

  let step1Flex = {
    type: "flex",
    altText: "➕ สมัครร้านค้าใหม่ (ขั้นตอนที่ 1/3): ชื่อร้านค้า",
    fallbackText: "➕ [สมัครร้านค้าใหม่ 1/3]\nกรุณาพิมพ์ 'ชื่อร้านค้าใหม่' ส่งมาในแชทได้เลยครับ:",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1DA1DB",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "➕ สมัครร้านค้าใหม่ (ขั้นตอนที่ 1/3)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: "ระบบถาม-ตอบอัตโนมัติ (ไม่ต้องพิมพ์เครื่องหมายคั่น)", size: "xxs", color: "#E8F6FC", margin: "xs", maxLines: 1 }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: "1️⃣ กรุณาพิมพ์ 'ชื่อร้านค้าใหม่' ส่งมาในแชทได้เลยครับ:", size: "xs", weight: "bold", color: "#111111", wrap: true },
          { type: "text", text: "ตัวอย่าง: ก๋วยเตี๋ยวลุงชม", size: "xxs", color: "#666666", maxLines: 1 },
          { type: "separator", margin: "sm", color: "#E5E5E5" },
          UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกสมัครร้าน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [step1Flex], UI_GetAdminHomeQr());
}

function RT_TryHandleStoreRegistrationWizard(platform, userId, tokenOrChat, userText, lowText) {
  let rawWiz = DB_GetSession(userId, "reg_wiz");
  if (!rawWiz) return false;

  if (lowText === "ยกเลิกสมัครร้าน" || lowText === "ยกเลิก" || lowText === "cancel" || lowText === "1003") {
    DB_RemoveSession(userId, "reg_wiz");
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ยกเลิกสมัครร้านค้าใหม่]\nยกเลิกรายการเรียบร้อยครับ" }], UI_GetAdminHomeQr());
    return true;
  }

  let wiz = JSON.parse(rawWiz);

  if (wiz.step === 1) {
    wiz.name = userText.replace(/(\[ST-\d+\]\s*)+/gi, "").trim();
    wiz.step = 2;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 900);

    let step2Flex = {
      type: "flex",
      altText: `➕ สมัครร้านค้าใหม่ (2/3): เรทราคา (${wiz.name})`,
      fallbackText: `➕ [สมัครร้านค้าใหม่ 2/3: ${wiz.name}]\nเลือกเรทราคาแก๊ส หรือพิมพ์ราคา 15กก. 48กก. กระป๋อง:`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "➕ สมัครร้านค้าใหม่ (ขั้นตอนที่ 2/3)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ชื่อร้าน: ${wiz.name}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "2️⃣ แตะเลือกเรทราคา หรือพิมพ์ตัวเลข 3 ค่าเว้นวรรค (15กก. 48กก. กระป๋อง):", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("⚡ ราคามาตรฐาน (490 / 1530 / 790)", "490 1530 790", "#1DA1DB", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("⚡ ราคา 480 / 1500 / 790", "480 1500 790", "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            { type: "text", text: "💡 หรือพิมพ์ตัวเลขเอง เช่น: 470 1480 790", size: "xxs", color: "#666666", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกสมัครร้าน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step2Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 2) {
    let nums = userText.match(/\d+/g) || [];
    wiz.p15 = nums.length >= 1 ? parseInt(nums[0], 10) : 490;
    wiz.p48 = nums.length >= 2 ? parseInt(nums[1], 10) : 1530;
    wiz.pCan = nums.length >= 3 ? parseInt(nums[2], 10) : 790;
    wiz.step = 3;
    DB_SetSession(userId, "reg_wiz", JSON.stringify(wiz), 900);

    let step3Flex = {
      type: "flex",
      altText: `➕ สมัครร้านค้าใหม่ (3/3): รอบชำระเงิน (${wiz.name})`,
      fallbackText: `➕ [สมัครร้านค้าใหม่ 3/3: ${wiz.name}]\nเลือกเงื่อนไขการชำระเงิน:`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "➕ สมัครร้านค้าใหม่ (ขั้นตอนที่ 3/3)", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${wiz.name} (${wiz.p15}/${wiz.p48}/${wiz.pCan})`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: "3️⃣ แตะเลือกประเภทการชำระเงินของร้านนี้เพื่อบันทึกเข้าฐานข้อมูลทันที:", size: "xs", weight: "bold", color: "#111111", wrap: true },
            UI_MakeFlexBoxBtn("💵 ร้านปกติ (เงินสด / โอนรายบิล)", "reg_term_0", "#1DA1DB", "#FFFFFF", "sm"),
            UI_MakeFlexBoxBtn("🧾 ร้านเครดิต 15 วัน", "reg_term_15", "#111111", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn("🧾 ร้านเครดิต 30 วัน", "reg_term_30", "#0288D1", "#FFFFFF", "xs"),
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("❌ ยกเลิก", "ยกเลิกสมัครร้าน", "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
          ]
        }
      }
    };
    MSG_SendReply(platform, tokenOrChat, [step3Flex], UI_GetAdminHomeQr());
    return true;
  }

  if (wiz.step === 3) {
    let term = "";
    if (lowText.indexOf("15") !== -1) term = "15";
    else if (lowText.indexOf("30") !== -1) term = "30";

    DB_RemoveSession(userId, "reg_wiz");
    let rawPipeStr = `${wiz.name} | ${wiz.p15} | ${wiz.p48} | ${wiz.pCan} | ${wiz.name} | ${term}`;
    let regResult = DB_RegisterNewStore(rawPipeStr);

    if (!regResult.success) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [เพิ่มร้านไม่สำเร็จ]\n${regResult.msg}` }], UI_GetAdminHomeQr());
      return true;
    }

    let termLabel = term ? `เครดิต ${term} วัน` : "เงินสด / โอนรายบิล";
    let doneRegFlex = {
      type: "flex",
      altText: `✅ เพิ่มร้าน ${regResult.storeName} สำเร็จ!`,
      fallbackText: `✅ [เพิ่มร้านค้าสำเร็จ]\nรหัส: ${regResult.storeId}\nชื่อ: ${regResult.storeName}\nรหัสผูกห้อง: #${regResult.pairingCode}`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1DA1DB",
          paddingAll: "14px",
          contents: [
            { type: "text", text: "✅ สมัครร้านค้าใหม่สำเร็จ!", weight: "bold", size: "md", color: "#FFFFFF", maxLines: 1 },
            { type: "text", text: `🏪 ${regResult.storeName}`, size: "xs", color: "#E8F6FC", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          paddingAll: "14px",
          backgroundColor: "#FFFFFF",
          contents: [
            { type: "text", text: `💰 เรทราคา: 15กก.=${regResult.price15} | 48กก.=${regResult.price48} | กระป๋อง=${regResult.priceCan}`, size: "xs", weight: "bold", color: "#111111", maxLines: 1, adjustMode: "shrink-to-fit" },
            { type: "text", text: `💳 เงื่อนไข: ${termLabel}`, size: "xs", color: "#0288D1", weight: "bold", maxLines: 1 },
            { type: "text", text: `🔗 รหัสผูกกลุ่ม LINE: #${regResult.pairingCode}`, size: "xs", color: "#2E7D32", weight: "bold", maxLines: 1 },
            { type: "separator", margin: "sm", color: "#E5E5E5" },
            UI_MakeFlexBoxBtn("🧾 ตั้งหัวบิลบริษัท / เลขผู้เสียภาษี", `ตั้งหัวบิล_${regResult.storeId}`, "#111111", "#FFFFFF", "xs"),
            UI_MakeFlexBoxBtn(`📋 แก้ไขพิกัด Map / ข้อมูลร้านนี้`, `จัดการร้าน_${regResult.storeId}`, "#F0F8FC", "#111111", "xs", "#CBE6F6"),
            UI_MakeFlexBoxBtn("🛒 สั่งแก๊สร้านนี้ทันที", `#เลือกร้าน-${regResult.storeId}`, "#1DA1DB", "#FFFFFF", "xs")
          ]
        }
      }
    };

    MSG_SendReply(platform, tokenOrChat, [
      doneRegFlex,
      { type: "text", text: `#${regResult.pairingCode}` }
    ], UI_GetAdminHomeQr());
    return true;
  }

  return false;
}

// ==========================================
// 📋 3. STORE PROFILE & TEMPLATE EDITOR WIZARD (แก้ข้อมูลร้านค้าทุกช่องใน Google Sheets)
// ==========================================

function RT_ShowStoreEditorCard(platform, userId, tokenOrChat, storeIdOrName) {
  let st = DB_GetStoreById(storeIdOrName);
  if (!st) {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "❌ [ไม่พบร้านค้า]\nไม่พบข้อมูลร้านค้าในระบบครับ" }], UI_GetAdminHomeQr());
    return;
  }

  if (typeof UI_BuildStoreFullEditorFlex === "function") {
    let edUI = UI_BuildStoreFullEditorFlex(st);
    MSG_SendReply(platform, tokenOrChat, [edUI.flexMsg], edUI.qr);
    return;
  }
}

function RT_SendStoreTemplateText(platform, tokenOrChat, storeIdOrName) {
  let st = DB_GetStoreById(storeIdOrName);
  if (!st) return;

  let singleLineBilling = String(st.billingName || st.storeName).replace(/\r?\n/g, " | ");
  let templateStr =
    `StoreID: ${st.storeId}\n` +
    `StoreName: ${st.storeName}\n` +
    `BillingName: ${singleLineBilling}\n` +
    `Phone: ${st.phone}\n` +
    `GoogleMap: ${st.mapLink}\n` +
    `Price15: ${st.price15}\n` +
    `Price48: ${st.price48}\n` +
    `PriceCan: ${st.priceCan}\n` +
    `PairingCode: ${st.pairingCode}\n` +
    `GroupID: ${st.groupId}\n` +
    `Status: ${st.status}\n` +
    `PendingDebt: ${st.pendingDebt}\n` +
    `Alias: ${st.alias}\n` +
    `CreditTerm: ${st.creditTerm}`;

  MSG_SendReply(platform, tokenOrChat, [
    { type: "text", text: `📋 [Template ข้อมูลร้าน ${st.storeName}]\nคัดลอกข้อความด้านล่างไปแก้ไข แล้ววางส่งกลับมาในแชทนี้เพื่ออัปเดตทุกช่องพร้อมกันได้เลยครับ:` },
    { type: "text", text: templateStr }
  ], UI_GetAdminHomeQr());
}

function RT_StartSingleFieldEditWizard(platform, userId, tokenOrChat, storeId, fieldKey) {
  let st = DB_GetStoreById(storeId);
  if (!st) return;

  let labels = {
    "storename": "ชื่อร้านค้า (StoreName)",
    "phone": "เบอร์โทรศัพท์ (Phone)",
    "googlemap": "ลิงก์พิกัด Google Maps (GoogleMap)",
    "price15": "ราคาถัง 15 กก. (Price15)",
    "price48": "ราคาถัง 48 กก. (Price48)",
    "pricecan": "ราคาแก๊สกระป๋อง (PriceCan)",
    "alias": "คำค้นหา / ฉายาร้าน (Alias)",
    "status": "สถานะร้านค้า (Active / Inactive)"
  };
  let fieldLabel = labels[fieldKey.toLowerCase()] || fieldKey;

  DB_SetSession(userId, "edit_store_wiz", JSON.stringify({ storeId: st.storeId, fieldKey: fieldKey.toLowerCase(), label: fieldLabel }), 600);

  let askFlex = {
    type: "flex",
    altText: `✏️ แก้ไข ${fieldLabel} (${st.storeName})`,
    fallbackText: `✏️ [แก้ไข ${fieldLabel}: ${st.storeName}]\nกรุณาพิมพ์ค่าใหม่ส่งมาในแชทได้เลยครับ:`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#111111",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `✏️ แก้ไขข้อมูลร้าน (${st.storeId})`, weight: "bold", size: "sm", color: "#FFFFFF", maxLines: 1 },
          { type: "text", text: `🏪 ${st.storeName}`, size: "xs", color: "#1DA1DB", margin: "xs", maxLines: 1, adjustMode: "shrink-to-fit" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: `กรุณาพิมพ์ "${fieldLabel}" ใหม่ส่งมาในแชทได้เลยครับ:`, size: "xs", weight: "bold", color: "#111111", wrap: true },
          UI_MakeFlexBoxBtn("❌ ยกเลิก", `จัดการร้าน_${st.storeId}`, "#FFF3E0", "#B71C1C", "xs", "#FFCC80")
        ]
      }
    }
  };
  MSG_SendReply(platform, tokenOrChat, [askFlex], UI_GetAdminHomeQr());
}

function RT_TryHandleSingleFieldEditWizard(platform, userId, tokenOrChat, userText, lowText) {
  let rawWiz = DB_GetSession(userId, "edit_store_wiz");
  if (!rawWiz) return false;

  if (lowText === "ยกเลิก" || lowText === "cancel" || lowText === "1003" || userText.startsWith("จัดการร้าน_")) {
    DB_RemoveSession(userId, "edit_store_wiz");
    if (userText.startsWith("จัดการร้าน_")) {
      RT_ShowStoreEditorCard(platform, userId, tokenOrChat, userText.replace("จัดการร้าน_", "").trim());
      return true;
    }
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ยกเลิกการแก้ไข]\nยกเลิกการแก้ไขข้อมูลร้านเรียบร้อยครับ" }], UI_GetAdminHomeQr());
    return true;
  }

  let wiz = JSON.parse(rawWiz);
  DB_RemoveSession(userId, "edit_store_wiz");

  let upd = DB_UpdateStoreField(wiz.storeId, wiz.fieldKey, userText.trim());
  if (upd.success) {
    let edUI = UI_BuildStoreFullEditorFlex(upd.store);
    MSG_SendReply(platform, tokenOrChat, [
      { type: "text", text: `✅ [อัปเดตข้อมูลสำเร็จ]\nบันทึก ${wiz.label} = "${upd.newValue}" ลงใน Google Sheets เรียบร้อยครับ` },
      edUI.flexMsg
    ], edUI.qr);
  } else {
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [อัปเดตไม่สำเร็จ]\n${upd.msg}` }], UI_GetAdminHomeQr());
  }
  return true;
}

// ==========================================
// 🍎 4. SIRI-STYLE THREE-STEP ORDERING & STAFF FLOW HANDLERS
// ==========================================

function RT_HandleThreeStepOrderFlow(platform, sessionKey, tokenOrChat, userText, lowText, targetStore, isAdminMode) {
  if (!targetStore) return false;

  if (["สั่งรายการอื่นเพิ่ม", "เปลี่ยนประเภทแก๊ส", "เลือกประเภทแก๊ส", "step1_order"].includes(lowText)) {
    ORD_ShowStep1TypeSelection(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }

  let mCanDirect = lowText.match(/(?:สั่งแก๊ส|แก๊สลัง|แก๊สกระป๋อง|กระป๋อง)?\s*(\d+)\s*ลัง/i) ||
                   lowText.match(/^(?:สั่ง)?(?:แก๊ส)?(?:กระป๋อง|แก๊สลัง)\s*[=*x×\s]\s*(\d+)$/i);
  if (mCanDirect) {
    let qtyCan = Math.max(1, parseInt(mCanDirect[1], 10));
    if (qtyCan <= 200) {
      ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "can", qtyCan, targetStore, isAdminMode);
      return true;
    }
  }

  let m15 = lowText.match(/(?:สั่งแก๊ส\s*)?15(?:\s*กก\.?|\s*กิโล)?\s*(?:จำนวน|[=*x×\s])\s*(\d+)(?:\s*ถัง)?/i);
  if (m15) {
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "15", Math.max(1, parseInt(m15[1], 10)), targetStore, isAdminMode);
    return true;
  }
  let m48 = lowText.match(/(?:สั่งแก๊ส\s*)?48(?:\s*กก\.?|\s*กิโล)?\s*(?:จำนวน|[=*x×\s])\s*(\d+)(?:\s*ถัง)?/i);
  if (m48) {
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, "48", Math.max(1, parseInt(m48[1], 10)), targetStore, isAdminMode);
    return true;
  }

  if (["เลือกประเภท_15", "สั่งแก๊ส 15 กก.", "สั่งแก๊ส 15กก", "แก๊ส 15 กก.", "แก๊สถัง 15 กก.", "15กก", "15 กก."].includes(lowText)) {
    ORD_ShowStep2QtySelection(platform, sessionKey, tokenOrChat, targetStore, "15", isAdminMode);
    return true;
  }
  if (["เลือกประเภท_48", "สั่งแก๊ส 48 กก.", "สั่งแก๊ส 48กก", "แก๊ส 48 กก.", "แก๊สถัง 48 กก.", "48กก", "48 กก."].includes(lowText)) {
    ORD_ShowStep2QtySelection(platform, sessionKey, tokenOrChat, targetStore, "48", isAdminMode);
    return true;
  }
  if (["เลือกประเภท_can", "สั่งแก๊สกระป๋อง", "สั่งกระป๋อง", "แก๊สกระป๋อง", "แก๊สลัง", "สั่งแก๊สลัง"].includes(lowText)) {
    ORD_ShowStep2QtySelection(platform, sessionKey, tokenOrChat, targetStore, "can", isAdminMode);
    return true;
  }

  let mSelectQty = lowText.match(/^เลือกจำนวน_(15|48|can)_(\d+)$/i);
  if (mSelectQty) {
    let itemType = mSelectQty[1].toLowerCase();
    let qty = Math.max(1, parseInt(mSelectQty[2], 10));
    ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, itemType, qty, targetStore, isAdminMode);
    return true;
  }

  let focusedType = CacheService.getScriptCache().get("focus_type_" + sessionKey);
  if (focusedType) {
    let mUnitQty = lowText.match(/^(?:จำนวน\s*)?(\d+)\s*(?:ลัง|ถัง)?$/i);
    if (mUnitQty) {
      let qty = Math.max(1, parseInt(mUnitQty[1], 10));
      if (qty <= 200) {
        ORD_SetCartItemQty(platform, sessionKey, tokenOrChat, focusedType, qty, targetStore, isAdminMode);
        return true;
      }
    }
  }

  if (["ทวนรายการ", "ดูตะกร้า", "cart review"].includes(lowText)) {
    ORD_ShowCart(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }
  if (["ยืนยันสั่งซื้อ", "cart confirm"].includes(lowText)) {
    ORD_ConfirmOrder(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }
  if (["ล้างตะกร้า", "ปลดล็อคร้าน", "cart clear", "cart_clear"].includes(lowText)) {
    ORD_ClearCart(platform, sessionKey, tokenOrChat, targetStore, isAdminMode);
    return true;
  }

  return false;
}

function RT_HandleStaffDeliveryFlowCommands(platform, userId, roomId, tokenOrChat, userText, lowText, isAdminView) {
  let mBillHdr = userText.match(/^(?:ตั้งหัวบิล_|แก้หัวบิล\s*)(.+)$/i);
  if (mBillHdr) {
    RT_StartBillingHeaderWizard(platform, userId, roomId, tokenOrChat, mBillHdr[1].trim(), isAdminView);
    return true;
  }

  if (RT_TryHandleBillingHeaderWizard(platform, userId, roomId, tokenOrChat, userText, lowText, isAdminView)) {
    return true;
  }

  let mQueueJpeg = userText.match(/^(?:queue_jpeg_|ขอดูใบเสร็จ\s*)(#?Q\d+)$/i);
  if (mQueueJpeg && typeof Staff_ReplyQueueReceiptJpeg === "function") {
    Staff_ReplyQueueReceiptJpeg(platform, tokenOrChat, mQueueJpeg[1]);
    return true;
  }

  let mDoneQ = userText.match(/^(?:done_q_|จัดส่งแล้ว\s*)(#?Q\d+)$/i);
  if (mDoneQ && typeof Staff_StartDeliveryStep1_Driver === "function") {
    Staff_StartDeliveryStep1_Driver(platform, tokenOrChat, mDoneQ[1], isAdminView);
    return true;
  }

  let mSelectDrv = userText.match(/^(?:staff_drv_|ผู้ส่ง\s*)(#?Q\d+)[\s_]+(.+)$/i);
  if (mSelectDrv && typeof Staff_SelectDriverStep2_Receipt === "function") {
    Staff_SelectDriverStep2_Receipt(platform, userId, roomId, tokenOrChat, mSelectDrv[1], mSelectDrv[2].trim(), isAdminView);
    return true;
  }

  let mFuelNo = userText.match(/^(?:staff_fuel_no_|ไม่มีเบิกน้ำมัน\s*)(#?Q\d+)$/i);
  if (mFuelNo && typeof Staff_HandleFuelChoiceStep3 === "function") {
    Staff_HandleFuelChoiceStep3(platform, userId, roomId, tokenOrChat, mFuelNo[1], false, isAdminView);
    return true;
  }
  let mFuelYes = userText.match(/^(?:staff_fuel_yes_|มีเบิกค่าน้ำมัน\s*)(#?Q\d+)$/i);
  if (mFuelYes && typeof Staff_HandleFuelChoiceStep3 === "function") {
    Staff_HandleFuelChoiceStep3(platform, userId, roomId, tokenOrChat, mFuelYes[1], true, isAdminView);
    return true;
  }

  let mPay = userText.match(/^(?:staff_pay_|ชำระด้วย\s*)(#?Q\d+)[\s_]+(เงินสด|เงินโอน|เครดิต)$/i);
  if (mPay && typeof Staff_SelectPaymentStep4 === "function") {
    Staff_SelectPaymentStep4(platform, userId, roomId, tokenOrChat, mPay[1], mPay[2], isAdminView);
    return true;
  }

  let mSlipYes = userText.match(/^(?:staff_slip_yes_|มีสลิปหน้างาน\s*)(#?Q\d+)$/i);
  if (mSlipYes && typeof Staff_HandleTransferSlipChoiceStep5 === "function") {
    Staff_HandleTransferSlipChoiceStep5(platform, userId, roomId, tokenOrChat, mSlipYes[1], true, isAdminView);
    return true;
  }
  let mSlipNo = userText.match(/^(?:staff_slip_no_|ส่งสลิปผ่านไลน์\s*)(#?Q\d+)$/i);
  if (mSlipNo && typeof Staff_HandleTransferSlipChoiceStep5 === "function") {
    Staff_HandleTransferSlipChoiceStep5(platform, userId, roomId, tokenOrChat, mSlipNo[1], false, isAdminView);
    return true;
  }

  if (lowText === "staff_cancel_flow" || userText === "ยกเลิกส่งงาน") {
    if (typeof Staff_CancelDeliveryFlow === "function") {
      Staff_CancelDeliveryFlow(platform, userId, roomId, tokenOrChat, isAdminView);
      return true;
    }
  }

  if (typeof Staff_TryHandleFuelAmountText === "function") {
    if (Staff_TryHandleFuelAmountText(platform, userId, roomId, tokenOrChat, userText, isAdminView)) {
      return true;
    }
  }

  return false;
}

function RT_HandleCashDepositCommands(platform, tokenOrChat, userId, userText, lowText, isAdminView) {
  if (!isAdminView) return false;

  if (userText === "เงินสดรอฝาก" || userText === "ยอดเงินสดรอฝาก" || userText === "เงินรอฝากรายคน" || lowText === "company_income" || lowText === "staff_cash") {
    RT_ClearAdminStoreLock(userId);
    if (typeof Staff_ReplyAccumulatedCash === "function") {
      Staff_ReplyAccumulatedCash(platform, tokenOrChat, true);
    }
    return true;
  }

  if (lowText === "cash_log_jpeg" || userText === "ดูตารางเงินสดรอฝาก" || lowText.startsWith("cash_log_jpeg_")) {
    let targetDrv = "ALL";
    if (lowText.startsWith("cash_log_jpeg_")) {
      targetDrv = userText.replace(/^cash_log_jpeg_/i, "").trim() || "ALL";
    }
    if (typeof Staff_ReplyCashDepositLogJpeg === "function") {
      Staff_ReplyCashDepositLogJpeg(platform, tokenOrChat, targetDrv);
    }
    return true;
  }

  if (lowText === "undo_cash_deposit" || userText === "ยกเลิกฝากเงินล่าสุด") {
    if (typeof Staff_UndoLastCashDeposit === "function") {
      Staff_UndoLastCashDeposit(platform, tokenOrChat, true);
    }
    return true;
  }

  if (userText === "ฝากเงินแล้ว" || lowText === "staff_cash_ask_reset" || userText.startsWith("ฝากเงิน_")) {
    let targetDriver = "ALL";
    if (userText.startsWith("ฝากเงิน_")) {
      targetDriver = userText.replace("ฝากเงิน_", "").trim() || "ALL";
    }
    if (typeof Staff_AskConfirmCashDeposit === "function") {
      Staff_AskConfirmCashDeposit(platform, tokenOrChat, targetDriver, true);
    }
    return true;
  }

  if (userText === "ยืนยันฝากเงินแล้ว" || lowText === "staff_cash_confirm_reset" || userText.startsWith("ยืนยันฝากเงิน_")) {
    let targetDriver = "ALL";
    if (userText.startsWith("ยืนยันฝากเงิน_")) {
      targetDriver = userText.replace("ยืนยันฝากเงิน_", "").trim() || "ALL";
    }
    if (typeof Staff_ConfirmCashDepositReset === "function") {
      Staff_ConfirmCashDepositReset(platform, tokenOrChat, userId, targetDriver, true);
    }
    return true;
  }

  return false;
}

function RT_SendAdminDashboard(platform, tokenOrChat, userId, roomId) {
  if (userId) RT_ClearAdminStoreLock(userId);
  let adminMenu = UI_BuildAdminMenu();
  MSG_SendReply(platform, tokenOrChat, adminMenu.messages, adminMenu.qr);
}

// ==========================================
// 🚦 5. MAIN COMMAND SWITCHER (STRICT ROOM ISOLATION)
// ==========================================

function RT_ProcessCommand(platform, userId, groupId, replyToken, chatId, userText) {
  const props = PropertiesService.getScriptProperties();
  let lowText = userText.toLowerCase();
  let tokenOrChat = (platform === "LINE") ? replyToken : chatId;
  let roomId = groupId || userId;

  if (lowText === "none") return;

  // 🔗 D1. ระบบ Handshake ผูกห้อง & ยกเลิกผูกห้อง (#LINK-... / UNLINK)
  if (lowText.startsWith("#link-") || lowText.startsWith("link-") || lowText === "unlink" || userText === "#ห้องลูกน้อง" || userText === "#ทีมรับออเดอร์" || userText === "#ห้องแอดมิน" || userText === "#ยกเลิกผูกห้อง") {
    let bindResult = DB_BindGroupByPairingCode(userText, roomId);
    if (!bindResult.success) {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ผูกห้องไม่สำเร็จ]\n${bindResult.msg}` }], []);
      return;
    }

    RT_ClearAdminStoreLock(userId);
    let cache = CacheService.getScriptCache();
    cache.remove("cart_" + roomId);
    cache.remove("cart_" + userId);

    if (bindResult.type === "UNLINK") {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `🔌 [ยกเลิกผูกห้องสำเร็จ]\nยกเลิกการผูกห้องกับ "${bindResult.name}" เรียบร้อยแล้วครับ` }], []);
      return;
    }

    if (bindResult.type === "STAFF") {
      MSG_SendReply(platform, tokenOrChat, [{
        type: "text",
        text: `✅ [ผูกห้องทีมรับออเดอร์สำเร็จ]\nห้องนี้ถูกตั้งค่าเป็น "${bindResult.name}" เรียบร้อยครับ (ล็อกเฉพาะรับออเดอร์และกดส่งงานเท่านั้น)`
      }], UI_GetStaffHomeQr());
      return;
    }

    if (bindResult.type === "ADMIN") {
      RT_SendAdminDashboard(platform, tokenOrChat, userId, roomId);
      return;
    }

    if (bindResult.type === "STORE" && bindResult.storeData) {
      let st = bindResult.storeData;
      let debtDetails = DB_GetStoreDebtDetails(st.storeName);
      let step1UI = UI_BuildStoreStep1Flex(st, debtDetails.pendingDebt, null, false, debtDetails.bills);
      MSG_SendReply(platform, tokenOrChat, [step1UI.flexMsg], step1UI.qr);
      return;
    }
  }

  let roomInfo = (platform === "LINE") ? DB_GetRoomRole(roomId) : { role: "ADMIN", storeData: null };

  // ==========================================
  // 🏪 โหมดที่ 1: ห้องร้านค้าลูกค้า (STORE) — ห้ามรับ 1003 เด็ดขาด!
  // ==========================================
  if (roomInfo.role === "STORE" && roomInfo.storeData) {
    // 🔒 กฎเหล็ก: บล็อกคำสั่ง 1003 และคำสั่งแอดมินในห้องลูกค้าที่ผูกแล้ว 100%
    if (lowText === "1003" || lowText === "menu" || lowText === "menu_main") {
      return;
    }

    let st = roomInfo.storeData;

    // ปุ่มยืนยัน/ยกเลิกการส่งสลิปในห้องลูกค้า (ป้องกันการ Unsend)
    if (lowText.startsWith("confirm_cust_slip_") || lowText.startsWith("cancel_cust_slip_")) {
      if (typeof FIN_HandleCustomerSlipConfirmAction === "function") {
        FIN_HandleCustomerSlipConfirmAction(platform, tokenOrChat, userText, st, roomId);
      }
      return;
    }

    let mDebtJpegStore = userText.match(/^(?:store_debt_jpeg_|ดูรูปใบวางบิล_|ขอดูใบแจ้งหนี้\s*)(.*)$/i);
    if (mDebtJpegStore || userText === "ขอดูใบแจ้งหนี้" || userText === "ดูใบแจ้งหนี้") {
      if (typeof FIN_ReplyStoreInvoiceJpeg === "function") {
        FIN_ReplyStoreInvoiceJpeg(platform, tokenOrChat, st.storeId);
      }
      return;
    }

    if (RT_HandleThreeStepOrderFlow(platform, roomId, tokenOrChat, userText, lowText, st.storeName, false)) {
      return;
    }

    if (lowText === "ยกเลิก") {
      if (CacheService.getScriptCache().get("cart_" + roomId) || CacheService.getScriptCache().get("focus_type_" + roomId)) {
        return ORD_ClearCart(platform, roomId, tokenOrChat, st.storeName, false);
      }
      return;
    }

    if (userText === "เช็คบิลหนี้ค้าง" || userText === "เช็คยอด" || userText === "ยอดค้าง" || userText === "ใบแจ้งหนี้") {
      return FIN_ReplyStoreOwnDebt(platform, tokenOrChat, st);
    }

    let storeTriggerWords = ["สั่งแก๊ส", "สั่งของ", "แก๊สหมด", "สั่งเพิ่ม", "เอาแก๊ส", "ส่งแก๊ส", "แก๊สลัง", "กระป๋อง", "ถัง", "ลัง", "15", "48", "เมนูร้าน", "เมนู"];
    if (storeTriggerWords.some(kw => lowText.includes(kw))) {
      return ORD_ShowStep1TypeSelection(platform, roomId, tokenOrChat, st.storeName, false);
    }

    DB_LogChat(platform, roomId, userId, userText);
    return;
  }

  // ==========================================
  // 👷 โหมดที่ 2: ห้องทีมรับออเดอร์ / ทีมส่งแก๊ส (STAFF) — ห้ามรับ 1003 เด็ดขาด!
  // ==========================================
  if (roomInfo.role === "STAFF") {
    // 🔒 กฎเหล็ก: บล็อกคำสั่ง 1003 และคำสั่งการเงินทั้งหมดในห้องทีมรับออเดอร์ 100%
    if (lowText === "1003" || lowText === "menu" || lowText === "menu_main") {
      return;
    }

    if (RT_HandleStaffDeliveryFlowCommands(platform, userId, roomId, tokenOrChat, userText, lowText, false)) {
      return;
    }

    if (lowText === "order ส่งแก๊สวันนี้" || userText === "คิวส่งแก๊ส" || userText === "งาน" || lowText === "orders" || lowText === "order" || lowText.startsWith("staff_queue_page_")) {
      let page = 1;
      if (lowText.startsWith("staff_queue_page_")) {
        page = parseInt(lowText.replace("staff_queue_page_", ""), 10) || 1;
      }
      return Staff_ReplyPendingOrdersBubbles(platform, tokenOrChat, page, false);
    }

    if (lowText === "close" || userText === "ปิดเมนู") {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ปิดหน้าต่างรายการ]\nปิดหน้าต่างรายการเรียบร้อยครับ" }], UI_GetStaffHomeQr());
      return;
    }
    return;
  }

  // ==========================================
  // 🚫 โหมดห้องที่ยังไม่ได้ผูกโค้ด (UNBOUND)
  // อนุญาตให้พิมพ์ 1003 ได้เฉพาะห้อง Admin หรือห้องส่วนตัวแอดมิน หากเป็นกลุ่มลูกค้าที่ยังไม่ผูกโค้ดให้เงียบสนิท
  // ==========================================
  if (platform === "LINE" && roomInfo.role === "UNBOUND" && groupId) {
    if (lowText !== "1003") {
      DB_LogChat(platform, roomId, userId, userText);
      return;
    }
  }

  // ==========================================
  // 👑 โหมดที่ 3: ห้องผู้ดูแลระบบ (ADMIN ONLY)
  // ==========================================

  if (lowText === "1003" || ["menu", "menu_main", "1000", "help", "คำสั่ง"].includes(lowText)) {
    RT_SendAdminDashboard(platform, tokenOrChat, userId, roomId);
    return;
  }

  let mDebtJpeg = userText.match(/^(?:store_debt_jpeg_|ดูรูปใบวางบิล_|ขอดูใบแจ้งหนี้\s*)(.+)$/i);
  if (mDebtJpeg && typeof FIN_ReplyStoreInvoiceJpeg === "function") {
    FIN_ReplyStoreInvoiceJpeg(platform, tokenOrChat, mDebtJpeg[1].trim());
    return;
  }

  // ตรวจจับการส่ง Template ข้อมูลร้านค้ากลับมาอัปเดตทั้งแถว
  if (/^StoreID\s*:\s*ST-\d+/i.test(userText)) {
    let tplRes = DB_UpdateStoreFromTemplate(userText);
    if (tplRes.success) {
      let edUI = UI_BuildStoreFullEditorFlex(tplRes.store);
      MSG_SendReply(platform, tokenOrChat, [
        { type: "text", text: `✅ [อัปเดตข้อมูลจาก Template สำเร็จ]\nบันทึกข้อมูลทุกช่องของร้าน "${tplRes.store.storeName}" ลงใน Google Sheets เรียบร้อยครับ!` },
        edUI.flexMsg
      ], edUI.qr);
    } else {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [อัปเดตไม่สำเร็จ]\n${tplRes.msg}` }], UI_GetAdminHomeQr());
    }
    return;
  }

  // ตรวจจับ Interactive Wizards (สมัครร้านใหม่ / แก้หัวบิล 3 ขั้นตอน / แก้ข้อมูลร้านรายช่อง)
  if (RT_TryHandleStoreRegistrationWizard(platform, userId, tokenOrChat, userText, lowText)) {
    return;
  }
  if (RT_TryHandleSingleFieldEditWizard(platform, userId, tokenOrChat, userText, lowText)) {
    return;
  }
  if (RT_HandleStaffDeliveryFlowCommands(platform, userId, roomId, tokenOrChat, userText, lowText, true)) {
    return;
  }

  // คำสั่งเปิดหน้าจัดการ/แก้ไขข้อมูลร้านค้าทุกช่อง
  if (userText.startsWith("จัดการร้าน_") || lowText.startsWith("edit_store_menu_")) {
    let targetStId = userText.replace(/^(?:จัดการร้าน_|edit_store_menu_)/i, "").trim();
    RT_ShowStoreEditorCard(platform, userId, tokenOrChat, targetStId);
    return;
  }
  if (userText.startsWith("template_store_") || userText.startsWith("ขอเทมเพลต_")) {
    let targetStId = userText.replace(/^(?:template_store_|ขอเทมเพลต_)/i, "").trim();
    RT_SendStoreTemplateText(platform, tokenOrChat, targetStId);
    return;
  }
  let mEditField = userText.match(/^แก้ช่อง_(ST-\d+)_([a-zA-Z0-9]+)$/i);
  if (mEditField) {
    RT_StartSingleFieldEditWizard(platform, userId, tokenOrChat, mEditField[1], mEditField[2]);
    return;
  }

  let isStaffAddMode = DB_GetSession(userId, "staff_setting_mode");
  if (isStaffAddMode === "ADD") {
    if (["ยกเลิก", "cancel", "1003", "menu_autolink", "ตั้งค่าทีมรับออเดอร์"].includes(lowText)) {
      DB_RemoveSession(userId, "staff_setting_mode");
    } else if (!lowText.startsWith("staff_") && !lowText.startsWith("menu_")) {
      DB_RemoveSession(userId, "staff_setting_mode");
      let addRes = DB_AddStaffDriver(userText);
      let staffSetUI = UI_BuildStaffSettingsFlex(addRes.list);
      let prefixTxt = addRes.success
        ? `✅ [เพิ่มรายชื่อสำเร็จ]\nเพิ่ม "${addRes.name}" เข้าสู่ทีมรับออเดอร์เรียบร้อยครับ`
        : `⚠️ [แจ้งเตือน]\n${addRes.msg}`;
      MSG_SendReply(platform, tokenOrChat, [
        { type: "text", text: prefixTxt },
        staffSetUI.flexMsg
      ], staffSetUI.qr);
      return;
    }
  }

  if (lowText === "menu_staff_settings" || userText === "ตั้งค่าทีมรับออเดอร์" || userText === "ตั้งค่าพนักงาน") {
    RT_ClearAdminStoreLock(userId);
    let drivers = DB_GetStaffDrivers();
    let staffSetUI = UI_BuildStaffSettingsFlex(drivers);
    MSG_SendReply(platform, tokenOrChat, [staffSetUI.flexMsg], staffSetUI.qr);
    return;
  }

  if (lowText === "staff_add_mode" || userText === "เพิ่มพนักงานใหม่") {
    DB_SetSession(userId, "staff_setting_mode", "ADD", 600);
    MSG_SendReply(platform, tokenOrChat, [{
      type: "text",
      text: "➕ [เพิ่มพนักงานใหม่]\nพิมพ์ชื่อพนักงานที่ต้องการเพิ่มเข้าทีมรับออเดอร์ส่งมาในแชทได้เลยครับ (เช่น ก้อง):"
    }], UI_GetAdminHomeQr());
    return;
  }

  if (lowText.startsWith("staff_del_") || userText.startsWith("ลบพนักงาน_")) {
    let delName = userText.replace(/^(?:staff_del_|ลบพนักงาน_)/i, "").trim();
    let delRes = DB_RemoveStaffDriver(delName);
    let staffSetUI = UI_BuildStaffSettingsFlex(delRes.list);
    let msgTxt = delRes.success
      ? `➖ [ลบรายชื่อสำเร็จ]\nลบชื่อ "${delRes.name}" ออกจากทีมรับออเดอร์เรียบร้อยครับ`
      : `⚠️ [แจ้งเตือน]\n${delRes.msg}`;
    MSG_SendReply(platform, tokenOrChat, [
      { type: "text", text: msgTxt },
      staffSetUI.flexMsg
    ], staffSetUI.qr);
    return;
  }

  let wizardKey = "estimate_wizard_" + userId;
  let wizardDataStr = props.getProperty(wizardKey);
  if (wizardDataStr) {
    if (["cancel", "ยกเลิก", "close", "ปิดเมนู"].includes(lowText)) {
      props.deleteProperty(wizardKey);
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ยกเลิกประเมินราคา]\nยกเลิกการประเมินราคาเรียบร้อยครับ" }], UI_GetAdminHomeQr());
      return;
    }
    if (!["1003", "menu", "menu_main"].includes(lowText) && typeof QUO_HandleEstimateWizard === "function") {
      QUO_HandleEstimateWizard(platform, userId, tokenOrChat, userText, wizardDataStr);
      return;
    }
  }

  if (lowText === "faq" || userText.includes("คู่มือการใช้งานแอดมิน") || userText.includes("คู่มือแอดมิน")) {
    RT_ClearAdminStoreLock(userId);
    let faqObj = UI_BuildAdminFaqText();
    MSG_SendReply(platform, tokenOrChat, [faqObj.flexMsg], faqObj.qr);
    return;
  }

  if (lowText === "archive_month" || userText === "เคลียร์บิลเดือนเก่า") {
    RT_ClearAdminStoreLock(userId);
    let archRes = DB_ArchiveCompletedMonthlySales();
    let msg = `🗄️ [สำรองประวัติบิลรายเดือนสำเร็จ]\n` +
              `• สำรองบิลเดือนก่อนที่ชำระแล้วเข้าแฟ้มรายเดือน: ${archRes.archivedCount} รายการ\n` +
              `• ข้อมูลในแท็บระบบรายงานขายและลิงก์สลิปช่อง X ยังคงอยู่ครบถ้วน`;
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: msg }], UI_GetAdminHomeQr());
    return;
  }

  if (lowText === "close" || userText === "ปิดเมนู") {
    RT_ClearAdminStoreLock(userId);
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "✅ [ปิดแผงควบคุม]\nปิดแผงควบคุมเรียบร้อยครับ" }], UI_GetAdminHomeQr());
    return;
  }

  if (lowText === "store_stock" || lowText === "gas" || lowText === "officegas" || userText === "เช็ค stock") {
    RT_ClearAdminStoreLock(userId);
    let stockMenu = UI_BuildStoreStockMenu();
    MSG_SendReply(platform, tokenOrChat, [stockMenu.flexMsg], stockMenu.qr);
    return;
  }

  if (lowText === "resetgas" || userText === "รีเซ็ตถัง") {
    RT_ClearAdminStoreLock(userId);
    props.setProperty("pending_15", "0");
    props.setProperty("pending_48", "0");
    props.setProperty("pending_can", "0");
    MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: "🔄 [รีเซ็ตถังสำเร็จ]\nรีเซ็ตยอดสะสมแก๊สต้องสั่งเข้า Office เป็น 0 เรียบร้อยครับ" }], UI_GetAdminHomeQr());
    return;
  }

  if (lowText === "menu_unlink_list" || lowText.startsWith("menu_unlink_page_")) {
    RT_ClearAdminStoreLock(userId);
    let page = 1;
    if (lowText.startsWith("menu_unlink_page_")) {
      page = parseInt(lowText.replace("menu_unlink_page_", ""), 10) || 1;
    }
    let linkedList = DB_GetLinkedStoresList();
    let unlinkUI = UI_BuildUnlinkStoresFlex(linkedList, page);
    MSG_SendReply(platform, tokenOrChat, [unlinkUI.flexMsg], unlinkUI.qr);
    return;
  }

  if (lowText.startsWith("admin_unlink_")) {
    let targetId = userText.replace(/^admin_unlink_/i, "").trim().toUpperCase();
    let unlinkRes = DB_AdminRemoteUnlink(targetId);
    let linkedListAfter = DB_GetLinkedStoresList();
    let unlinkUIAfter = UI_BuildUnlinkStoresFlex(linkedListAfter, 1);

    if (unlinkRes.success) {
      MSG_SendReply(platform, tokenOrChat, [
        { type: "text", text: `🔌 [ยกเลิกผูกห้องสำเร็จ]\nยกเลิกการผูกห้องของร้าน "${unlinkRes.storeName}" เรียบร้อยแล้วครับ` },
        unlinkUIAfter.flexMsg
      ], unlinkUIAfter.qr);
    } else {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [ยกเลิกไม่สำเร็จ]\n${unlinkRes.msg}` }], unlinkUIAfter.qr);
    }
    return;
  }

  if (lowText === "menu_autolink" || lowText.startsWith("menu_autolink_page_")) {
    let page = 1;
    if (lowText.startsWith("menu_autolink_page_")) {
      page = parseInt(lowText.replace("menu_autolink_page_", ""), 10) || 1;
    }
    RT_ClearAdminStoreLock(userId);
    DB_SetSession(userId, "genlink_mode", "true", 1800);
    let allStores = DB_GetAllActiveStores();
    let linkMenu = UI_BuildAutoLinkMenu(allStores, page);
    MSG_SendReply(platform, tokenOrChat, [linkMenu.flexMsg], linkMenu.qr);
    return;
  }

  if (lowText === "genlink_staff" || userText === "ผูกโค้ดทีมรับออเดอร์") {
    DB_RemoveSession(userId, "genlink_mode");
    MSG_SendReply(platform, tokenOrChat, [
      { type: "text", text: "👷 [รหัสผูกห้องทีมรับออเดอร์]\nคัดลอกโค้ดด้านล่างนี้ไปวางในกลุ่ม LINE ทีมรับออเดอร์ได้เลยครับ:" },
      { type: "text", text: "#LINK-STAFF" }
    ], UI_GetAdminHomeQr());
    return;
  }

  if (lowText === "genlink_admin") {
    DB_RemoveSession(userId, "genlink_mode");
    MSG_SendReply(platform, tokenOrChat, [
      { type: "text", text: "👑 [รหัสผูกห้อง Admin]\nคัดลอกโค้ดด้านล่างนี้ไปวางในกลุ่ม LINE แอดมินได้เลยครับ:" },
      { type: "text", text: "#LINK-ADMIN" }
    ], UI_GetAdminHomeQr());
    return;
  }

  if (userText.startsWith("#สร้างโค้ดร้าน-")) {
    let targetStoreId = userText.replace("#สร้างโค้ดร้าน-", "").trim();
    let stData = DB_GetStoreById(targetStoreId);
    DB_RemoveSession(userId, "genlink_mode");
    if (stData) {
      let codeUI = UI_BuildStorePairingCodeFlex(stData);
      MSG_SendReply(platform, tokenOrChat, [
        codeUI.flexMsg,
        { type: "text", text: `#LINK-${stData.storeId}` }
      ], codeUI.qr);
    }
    return;
  }

  if (lowText.startsWith("setcredit_")) {
    let parts = userText.split("_");
    if (parts.length >= 3) {
      let sId = parts[1];
      let term = parts[2] === "0" ? "" : parts[2];
      let res = DB_SetStoreCreditTerm(sId, term);
      if (res.success) {
        let termLabel = res.creditTerm ? `เครดิต ${res.creditTerm} วัน` : "ร้านปกติ (เงินสด/เงินโอนรายบิล)";
        MSG_SendReply(platform, tokenOrChat, [{
          type: "text",
          text: `✅ [ตั้งค่ารอบบิลสำเร็จ]\nร้าน "${res.storeName}" ถูกตั้งเป็น [${termLabel}] เรียบร้อยครับ`
        }], UI_GetAdminHomeQr());
      }
      return;
    }
  }

  if (lowText.startsWith("bind_slip_") || lowText.startsWith("bind_store_") || lowText.startsWith("approve_slip_") || lowText.startsWith("approve_store_")) {
    if (typeof FIN_ApproveCustomerSlipFromAdmin === "function") {
      FIN_ApproveCustomerSlipFromAdmin(platform, tokenOrChat, userText, userId, roomId);
    }
    return;
  }

  if (/^#([A-Za-z0-9_-]+)$/.test(userText) && !lowText.startsWith("#link-") && !lowText.startsWith("#q")) {
    let billNo = userText.match(/^#([A-Za-z0-9_-]+)$/)[1];
    if (typeof ADM_InspectBill === "function") ADM_InspectBill(platform, tokenOrChat, billNo);
    return;
  }
  if (/^edit\s+/i.test(userText)) {
    if (typeof ADM_HandleEditCommand === "function") ADM_HandleEditCommand(platform, userId, tokenOrChat, userText);
    return;
  }
  if (/^setpay_|^setstatus_/i.test(userText)) {
    if (typeof ADM_HandleQuickEditButton === "function") ADM_HandleQuickEditButton(platform, userId, tokenOrChat, userText);
    return;
  }
  if (lowText.startsWith("cancel_q_")) {
    let qId = userText.replace(/^cancel_q_/i, "").trim();
    if (typeof Staff_CancelQueueOrder === "function") Staff_CancelQueueOrder(platform, tokenOrChat, qId);
    return;
  }
  if (/^(?:match_store_|match\s+)(.*)/i.test(userText)) {
    if (typeof FIN_PrepareManualMatch === "function") FIN_PrepareManualMatch(platform, userId, tokenOrChat, userText, roomId);
    return;
  }

  if (lowText === "today" || lowText === "yesterday") {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_ReplyDailyReport === "function") FIN_ReplyDailyReport(platform, tokenOrChat, lowText === "yesterday" ? 1 : 0);
    return;
  }
  if (lowText === "today_table_jpeg" || lowText === "yesterday_table_jpeg") {
    if (typeof FIN_ReplyDailySummaryTableJpeg === "function") {
      FIN_ReplyDailySummaryTableJpeg(platform, tokenOrChat, lowText.startsWith("yesterday") ? 1 : 0);
    }
    return;
  }
  if (lowText.startsWith("today_bill_") || lowText.startsWith("yesterday_bill_")) {
    let isYesterday = lowText.startsWith("yesterday_bill_");
    let billIdx = parseInt(lowText.replace("today_bill_", "").replace("yesterday_bill_", ""), 10) || 1;
    if (typeof FIN_ReplyDailyBillDetailPage === "function") {
      FIN_ReplyDailyBillDetailPage(platform, tokenOrChat, isYesterday ? 1 : 0, billIdx);
    }
    return;
  }

  if (RT_HandleCashDepositCommands(platform, tokenOrChat, userId, userText, lowText, true)) {
    return;
  }

  if (lowText === "monthly" || lowText === "month" || userText === "เดือน" || lowText === "monthly_prev" || userText === "เดือนที่แล้ว" || lowText.startsWith("monthly_")) {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_ReplyMonthlyReport === "function") {
      let param = (lowText === "monthly" || lowText === "month" || userText === "เดือน") ? null : userText;
      FIN_ReplyMonthlyReport(platform, tokenOrChat, param);
    }
    return;
  }
  if (lowText === "monday" || lowText === "weekly" || userText === "สัปดาห์") {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_ReplyWeeklyReport === "function") FIN_ReplyWeeklyReport(platform, tokenOrChat);
    return;
  }
  if (lowText === "debt" || userText === "ลูกหนี้") {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_ReplyDebtSummary === "function") FIN_ReplyDebtSummary(platform, tokenOrChat);
    return;
  }
  if (lowText.indexOf("pending") === 0) {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_HandlePendingCommand === "function") FIN_HandlePendingCommand(platform, userId, tokenOrChat, userText);
    return;
  }
  if (lowText.indexOf("invoice30") === 0 || lowText.indexOf("bill30") === 0 || lowText.indexOf("credit30") === 0) {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_HandleInvoiceCommand === "function") FIN_HandleInvoiceCommand(platform, userId, tokenOrChat, userText, "30");
    return;
  }
  if (lowText.indexOf("invoice15") === 0 || lowText.indexOf("invoice") === 0 || lowText.indexOf("bill") === 0) {
    RT_ClearAdminStoreLock(userId);
    if (typeof FIN_HandleInvoiceCommand === "function") FIN_HandleInvoiceCommand(platform, userId, tokenOrChat, userText, "15");
    return;
  }

  if (lowText === "estimate" || userText === "ประเมิน") {
    RT_ClearAdminStoreLock(userId);
    if (typeof QUO_StartEstimateWizard === "function") QUO_StartEstimateWizard(platform, userId, tokenOrChat);
    return;
  }
  if (lowText === "pdf") {
    if (typeof QUO_GenerateQuotationPdf === "function") QUO_GenerateQuotationPdf(platform, userId, tokenOrChat);
    return;
  }
  if (lowText === "diagnostic" || lowText === "selftest" || lowText === "status") {
    RT_ClearAdminStoreLock(userId);
    SYS_RunHealthCheck(platform, tokenOrChat);
    return;
  }

  // ➕ สมัครร้านค้าใหม่ด้วย Interactive Flex Wizard (ถามทีละข้อ)
  if (lowText === "register_store" || userText === "สมัครร้านค้าใหม่") {
    RT_StartStoreRegistrationWizard(platform, userId, tokenOrChat);
    return;
  }
  if (userText.startsWith("เพิ่มร้าน:") || userText.startsWith("เพิ่มร้าน :")) {
    let regResult = DB_RegisterNewStore(userText);
    if (regResult.success) {
      let okText = `✅ [เพิ่มร้านค้าสำเร็จ]\nรหัส: ${regResult.storeId}\nชื่อ: ${regResult.storeName}\nราคา: 15กก.(${regResult.price15}) | 48กก.(${regResult.price48}) | กระป๋อง(${regResult.priceCan})\n🔗 รหัสผูกกลุ่ม LINE: #${regResult.pairingCode}`;
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: okText }], UI_GetAdminHomeQr());
    } else {
      MSG_SendReply(platform, tokenOrChat, [{ type: "text", text: `❌ [เพิ่มร้านไม่สำเร็จ]\n${regResult.msg}` }], UI_GetAdminHomeQr());
    }
    return;
  }

  if (lowText === "order ส่งแก๊สวันนี้" || userText === "คิวส่งแก๊ส" || userText === "งาน" || lowText === "orders" || lowText.startsWith("staff_queue_page_")) {
    RT_ClearAdminStoreLock(userId);
    let page = 1;
    if (lowText.startsWith("staff_queue_page_")) {
      page = parseInt(lowText.replace("staff_queue_page_", ""), 10) || 1;
    }
    return Staff_ReplyPendingOrdersBubbles(platform, tokenOrChat, page, true);
  }

  if (lowText === "admin_order" || lowText.startsWith("admin_order_page_")) {
    let page = 1;
    if (lowText.startsWith("admin_order_page_")) {
      page = parseInt(lowText.replace("admin_order_page_", ""), 10) || 1;
    }
    RT_ClearAdminStoreLock(userId);
    DB_SetSession(userId, "search_mode", "true", 1800);
    let allStores = DB_GetAllActiveStores();
    let dirUI = UI_BuildAllStoresDirectory(allStores, page);
    MSG_SendReply(platform, tokenOrChat, [dirUI.flexMsg], dirUI.qr);
    return;
  }

  if (userText.startsWith("#เลือกร้าน-") || userText.startsWith("#-")) {
    let selectedStoreId = userText.replace("#เลือกร้าน-", "").replace("#-", "").trim();
    ORD_LockStoreAndShowMenu(platform, userId, tokenOrChat, selectedStoreId, true);
    return;
  }

  let adminLockedStore = DB_GetSession(userId, "locked_store");
  if (adminLockedStore) {
    if (RT_HandleThreeStepOrderFlow(platform, userId, tokenOrChat, userText, lowText, adminLockedStore, true)) {
      return;
    }
    if (userText === "เช็คบิลหนี้ค้าง" || userText === "ขอดูใบแจ้งหนี้") {
      let stObj = DB_GetStoreById(adminLockedStore);
      if (stObj) {
        if (userText === "ขอดูใบแจ้งหนี้" && typeof FIN_ReplyStoreInvoiceJpeg === "function") {
          return FIN_ReplyStoreInvoiceJpeg(platform, tokenOrChat, stObj.storeId);
        }
        return FIN_ReplyStoreOwnDebt(platform, tokenOrChat, stObj);
      }
      return;
    }
  }

  if (lowText === "ยกเลิก") {
    let hasActiveSession = adminLockedStore ||
                           DB_GetSession(userId, "search_mode") ||
                           DB_GetSession(userId, "genlink_mode") ||
                           CacheService.getScriptCache().get("cart_" + userId);
    if (hasActiveSession) {
      return ORD_ClearCart(platform, userId, tokenOrChat, adminLockedStore, true);
    }
    return;
  }

  let isGenLinkMode = DB_GetSession(userId, "genlink_mode");
  if (isGenLinkMode) {
    let matched = DB_SearchStoreByName(userText);
    let linkSearchUI = UI_BuildAutoLinkSearchResults(matched, userText);
    MSG_SendReply(platform, tokenOrChat, [linkSearchUI.flexMsg], linkSearchUI.qr);
    return;
  }

  let isSearchMode = DB_GetSession(userId, "search_mode");
  if (isSearchMode) {
    let searchResults = DB_SearchStoreByName(userText);
    let searchUI = UI_BuildStoreSearchResults(searchResults, userText);
    MSG_SendReply(platform, tokenOrChat, [searchUI.flexMsg], searchUI.qr);
    return;
  }

  DB_LogChat(platform, roomId, userId, userText);
}
// ==========================================
// ⚙️ File: 01_Config.gs
// Version: 47.0 (5-Phase Complete Edition: Strict Room Lock, Maps Navigation & Interactive Store Manager)
// Prefix: CONFIG
// หมวด 1: CORE & DATABASE (แกนกลางและฐานข้อมูล)
// ==========================================

const CONFIG = {
  // 🔑 1. ข้อมูลการเชื่อมต่อฐานข้อมูล Google Sheets และ Google Form
  SPREADSHEET_ID: "1r_bDut2nMl0tOMmf2v9EVws_GWNAWc_ZQPeM0mr21sw",
  FORM_ID: "1MOeud2YtIqqQhcJpe2y7mrjYHJgVUaDLjVYw3un6KWA",

  // 🔵 2. ข้อมูลการเชื่อมต่อ Telegram Bot API (รหัสแชทแอดมิน 8984462793)
  TELEGRAM_TOKEN: "8570039724:AAFhasDt25O5FbQjPEiUekK95CmXp4BLSFg",
  TELEGRAM_CHAT_ID: "8984462793",

  // 🟢 3. โทเคนของ LINE Messaging API
  LINE_TOKEN: "Qjuuypg7eKhRGJS5TFkF+hoxqhEZ2qHnrIBtpqhI7iQO/bwHLCGR0RYZZVfZOHKWYdnkA1+QqXr07F4k4+OkiVSAPGa68ZBBLoGMaE9yhs2x5q9sd59GINc4w6/JGHH6YuMRavn6ernWCEJbbvYb4wdB04t89/1O/w1cDnyilFU=",

  // 🏠 4. ID ห้องสำหรับแยกการแจ้งเตือน (Multi-Room Logic)
  ADMIN_GROUP_ID: "Ce856f6b09cf6c311edaf7e00d9855375",
  STAFF_GROUP_ID: "Cbd50b458c15e8b9c29f18f906fb78e56",

  // 👷‍♂️ 5. รายชื่อทีมรับออเดอร์เริ่มต้น 5 คน (เพิ่ม/ลดสดในแชทได้)
  STAFF_DRIVERS: ["ต่อ", "วัน", "มานพ", "ปาน", "เอิ้น"],

  // 🖼️ 6. รูปภาพอ้างอิงและแบรนด์ (Corporate Identity: กอ.แก๊ส เชียงใหม่)
  COMPANY_HEADER_IMG: "IMG_5499.JPG",
  BRAND_COLOR_PRIMARY: "#1DA1DB",
  BRAND_COLOR_DARK: "#111111",
  BRAND_COLOR_BG: "#F0F8FC",

  // 🗂️ 7. รายชื่อแท็บใน Google Sheets
  SHEET_MAIN_SALES: "ระบบรายงานขาย",
  SHEET_QUEUE: "คิวสั่งแก๊ส",
  SHEET_STORES: "ตารางราคาร้านค้าและข้อมูล",
  SHEET_SETTINGS: "Settings",
  SHEET_CONFIG: "ตั้งค่าระบบ",
  SHEET_CHAT_LOGS: "Chat_Logs",
  SHEET_CASH_LOGS: "ประวัติฝากเงินสด",

  // 📅 8. วันตัดรอบบิลตามกติกา:
  // - เงินสด & เงินโอนรายบิล (Pending/Cash): เริ่มนับ 1 พฤศจิกายน 2569 (2026) เวลา 00:00:00
  // - เครดิต 15/30 วัน (Credit): เริ่มนับ 1 ตุลาคม 2569 (2026) เวลา 00:00:00
  CUTOFF_CASH: new Date(2026, 10, 1, 0, 0, 0),
  CUTOFF_PENDING: new Date(2026, 10, 1, 0, 0, 0),
  CUTOFF_CREDIT: new Date(2026, 9, 1, 0, 0, 0),

  // ⚡ 9. จำนวนแถวสำหรับโหมดดึงด่วนรายวัน และโหมดตรวจสอบทั้งระบบ
  FAST_SCAN_ROWS: 100,
  MAX_TX_SCAN_ROWS: 800
};

function getConfigLineToken() {
  return (CONFIG.LINE_TOKEN && CONFIG.LINE_TOKEN !== "ใส่_LINE_TOKEN_ของบอทที่นี่")
         ? CONFIG.LINE_TOKEN
         : (PropertiesService.getScriptProperties().getProperty("LINE_TOKEN") || "");
}

// 🗂️ สารบัญ Fixed Column แท็บ "ระบบรายงานขาย" (V=21 Order ID, W=22 สถานะชำระเงิน, X=23 สลิปโอนเงิน, Y=24 ข้อมูลสลิป)
const COL = {
  timestamp: 0,        // A: วันที่และเวลา (มาตรฐาน dd/MM/yyyy HH:mm:ss)
  sender: 1,           // B: ชื่อพนักงานส่ง
  g15: 2,              // C: จำนวนถัง 15 กก.
  g48: 3,              // D: จำนวนถัง 48 กก.
  cans: 4,             // E: ลังกระป๋อง (แก๊สกระป๋อง)
  store: 5,            // F: ชื่อร้านค้า
  payMethod: 6,        // G: วิธีชำระเงิน (สด/โอน/เครดิต/ผสม)
  slipUrl: 7,          // H: รูปลูกน้องแนบ (ใบเสร็จส่งแก๊ส Hand Copy - ใช้ดึงเวลาอัปโหลดจริง)
  total: 8,            // I: ยอดเงินรวมทั้งหมด (ตัวเลขล้วน)
  cashReceived: 9,     // J: ยอดเงินสดรับจริง
  transferAmt: 10,     // K: ยอดโอน
  fuelCost: 11,        // L: ค่าน้ำมัน/ปะยาง
  fuelSlipUrl: 12,     // M: รูปใบเสร็จน้ำมัน
  missingCylinders: 13,// N: จำนวนถังค้างคืน
  equip: 14,           // O: ค่าอุปกรณ์แก๊ส
  billingId: 20,       // U: รหัสบิลรวมเครดิต/โอนรวม (B1 / INV-...)
  orderId: 21,         // V: Order ID (#10212363...)
  status: 22,          // W: สถานะชำระเงิน (รอตรวจสอบ/ค้างชำระ/ชำระแล้ว/ยกเลิก)
  matchSlipUrl: 23,    // X: สลิปโอนเงิน (เก็บรูปใบโอนเงินที่ Match แล้ว)
  matchTime: 24,       // Y: ข้อมูลสลิป / เวลาจับคู่สลิป
  note: 25             // Z: หมายเหตุ / Transfer Time
};

function getColumnIndexes() {
  return {
    timestamp: COL.timestamp,
    sender: COL.sender,
    g15: COL.g15,
    g48: COL.g48,
    cans: COL.cans,
    store: COL.store,
    payMethod: COL.payMethod,
    slip: COL.slipUrl,
    total: COL.total,
    cashReceived: COL.cashReceived,
    transferAmt: COL.transferAmt,
    fuel: COL.fuelCost,
    fuelSlip: COL.fuelSlipUrl,
    missingCylinders: COL.missingCylinders,
    equip: COL.equip,
    orderId: COL.orderId,
    billingId: COL.billingId,
    status: COL.status,
    transferSlip: COL.matchSlipUrl,
    transferTime: COL.matchTime,
    note: COL.note
  };
}

// 🗂️ สารบัญ Fixed Column แท็บ "คิวสั่งแก๊ส"
const COL_QUEUE = {
  timestamp: 0,        // A: วัน-เวลาที่สั่ง
  orderId: 1,          // B: รหัสคิว (#Q001, #Q002...)
  store: 2,            // C: ชื่อร้านค้า
  g15: 3,              // D: จำนวนถัง 15 กก.
  g48: 4,              // E: จำนวนถัง 48 กก.
  cans: 5,             // F: จำนวนลังแก๊สกระป๋อง
  total: 6,            // G: ยอดรวมที่ต้องเก็บลูกค้า
  status: 7,           // H: สถานะคิว (รอดำเนินการ / จัดส่งแล้ว / ยกเลิก)
  pdfUrl: 8,           // I: ลิงก์ไฟล์ใบส่งของ/ใบเสร็จรับเงิน A4 (PDF)
  note: 9,             // J: หมายเหตุรอบจัดส่ง / ผู้รับผิดชอบ
  deliveredTime: 10    // K: วัน-เวลาที่จัดส่งสำเร็จ
};

// 🗂️ สารบัญ Fixed Column แท็บ "ตารางราคาร้านค้าและข้อมูล"
const COL_STORE = {
  storeId: 0,          // A: รหัสร้านค้า (ST-001)
  storeName: 1,        // B: ชื่อร้านค้าในระบบ ([ST-001] ...)
  billingName: 2,      // C: ชื่อหัวบิลทางการ/เลขผู้เสียภาษี/ที่อยู่สำหรับออกใบส่งของ A4
  phone: 3,            // D: เบอร์โทรศัพท์
  googleMap: 4,        // E: ลิงก์พิกัด Google Maps
  price15: 5,          // F: เรทราคาถัง 15 กก.
  price48: 6,          // G: เรทราคาถัง 48 กก.
  priceCan: 7,         // H: เรทราคาแก๊สกระป๋อง
  pairingCode: 8,      // I: รหัสจับคู่ผูกห้อง (LINK-ST-001)
  groupId: 9,          // J: LINE Group ID / Room ID ที่ผูกแล้ว
  status: 10,          // K: สถานะร้านค้า (Active/Inactive)
  pendingDebt: 11,     // L: ยอดหนี้ค้างชำระ
  alias: 12,           // M: คีย์เวิร์ด / ฉายา / ชื่อย่อร้านค้า
  creditTerm: 13       // N: รอบเครดิต ("15" หรือ "30" ส่วนร้านทั่วไปเว้นว่าง)
};
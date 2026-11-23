// ============================================================================
// 🚀 File: 10_Patch_Overrides.gs (LEAN ARCHITECTURE - MERGED INTO MODULE 11 & 15)
// Version: 66.0 (Zero Legacy Black-and-White PDF Overhead)
// ============================================================================

const EPSON_PRINT_EMAIL = "pgv75281djqp98@print.epsonconnect.com";

function Patch10_AuthorizePrinterEmail() {
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log("✅ อีเมลเชื่อมต่อเครื่องพิมพ์ Epson พร้อมใช้งาน! โควตาคงเหลือ: " + quota + " ฉบับ");
}
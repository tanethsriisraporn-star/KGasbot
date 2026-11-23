// ============================================================================
// 🌐 File: 14_WebApp_AdminCenter.gs
// Version: 53.5 (Exact V.53.0 Historical Totals + Monthly Cumulative + Real-Time kg Burn Rate Forecast)
// ============================================================================

function doGet(e) {
  var preloadedData = WEB_GetAdminDashboardData(false);
  var htmlContent = WEB_BuildAdminControlCenterHtml_(preloadedData);
  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("กอ.แก๊ส เชียงใหม่ • Executive Analytics & Forecast")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}

function WEB_CleanNum_(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  var n = parseFloat(String(val).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

/**
 * แปลงวันที่ให้ตรงกับต้นฉบับ V.53.0 100% (เรียก STD_ParseDateStandard_ เป็นอันดับแรก)
 */
function WEB_ParseHistoricalDate_(rawVal, dispStr, rowIdx) {
  if (typeof STD_ParseDateStandard_ === "function") {
    var dStd = STD_ParseDateStandard_(rawVal, dispStr, rowIdx);
    if (dStd && !isNaN(dStd.getTime())) return dStd;
  }

  var rIdx = Number(rowIdx || 0);
  var d = 0, mo = 0, y = 0, hr = 0, mn = 0, sc = 0;
  var ok = false;

  var s = String(dispStr || (typeof rawVal === "string" ? rawVal : "") || "").trim();
  if (s && s !== "-") {
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (m) {
      d = parseInt(m[1], 10);
      mo = parseInt(m[2], 10);
      y = parseInt(m[3], 10);
      hr = m[4] ? parseInt(m[4], 10) : 0;
      mn = m[5] ? parseInt(m[5], 10) : 0;
      sc = m[6] ? parseInt(m[6], 10) : 0;
      if (y < 100) y += (y >= 60 ? 1957 : 2000);
      if (y > 2400) y -= 543;
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
      ok = true;
    } else {
      var mIso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (mIso) {
        y = parseInt(mIso[1], 10);
        mo = parseInt(mIso[2], 10);
        d = parseInt(mIso[3], 10);
        hr = mIso[4] ? parseInt(mIso[4], 10) : 0;
        mn = mIso[5] ? parseInt(mIso[5], 10) : 0;
        sc = mIso[6] ? parseInt(mIso[6], 10) : 0;
        if (y > 2400) y -= 543;
        ok = true;
      }
    }
  }

  if (!ok && rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    y = rawVal.getFullYear();
    if (y > 2400) y -= 543;
    mo = rawVal.getMonth() + 1;
    d = rawVal.getDate();
    hr = rawVal.getHours();
    mn = rawVal.getMinutes();
    sc = rawVal.getSeconds();
    ok = true;
  }

  if (!ok || y < 2024 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  // เส้นแบ่งแถวที่ 385 ตามโครงสร้างเดิม V.53.0:
  if (rIdx >= 385 && d === 11 && mo >= 1 && mo <= 10) {
    d = mo;
    mo = 11;
  } else if (rIdx > 0 && rIdx < 385 && mo >= 11 && d <= 10) {
    var realMo = d;
    var realDay = mo;
    mo = realMo;
    d = realDay;
  }

  return new Date(y, mo - 1, d, hr, mn, sc);
}

/**
 * ป้ายฤดูกาลขายแก๊สเชียงใหม่ตามเดือน
 */
function WEB_GetChiangMaiSeasonLabel_(monthZeroIdx) {
  if (monthZeroIdx === 10 || monthZeroIdx === 11 || monthZeroIdx === 0 || monthZeroIdx === 1) {
    return "❄️ High Season (หน้าหนาว/ท่องเที่ยว)";
  }
  if (monthZeroIdx === 2 || monthZeroIdx === 3 || monthZeroIdx === 9) {
    return "🌤️ Shoulder Season (สงกรานต์/ปลายฝน)";
  }
  return "🌧️ Low Season (หน้าฝน/ชะลอตัว)";
}

/**
 * ดึงข้อมูล Web Dashboard (Read-Only, ยอดรวมทุกเดือนตรงกับ V.53.0 + ยอดสะสมรายเดือน + Real-Time Burn Rate)
 */
function WEB_GetAdminDashboardData(forceRefresh) {
  try {
    var ss = (typeof DB_GetSpreadsheet === "function") ? DB_GetSpreadsheet() : SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var mainSheet = ss.getSheetByName(CONFIG.SHEET_MAIN_SALES);
    var currentLastRow = (mainSheet && mainSheet.getLastRow() >= 2) ? mainSheet.getLastRow() : 0;

    var tailSignature = "";
    if (currentLastRow >= 2) {
      try {
        var tailVals = mainSheet.getRange(currentLastRow, 1, 1, Math.min(23, mainSheet.getLastColumn())).getDisplayValues()[0];
        tailSignature = String(tailVals[0] || "") + "_" + String(tailVals[5] || "") + "_" + String(tailVals[22] || "");
      } catch (eSig) {}
    }

    var cache = CacheService.getScriptCache();
    var cacheKey = "WEB_EXEC_DASH_V53_5_R" + currentLastRow + "_" + Utilities.base64EncodeWebSafe(tailSignature).substring(0, 16);
    if (!forceRefresh) {
      var cachedJson = cache.get(cacheKey);
      if (cachedJson) {
        try { return JSON.parse(cachedJson); } catch (e) {}
      }
    }

    var allStores = (typeof DB_GetAllActiveStores === "function") ? DB_GetAllActiveStores(false) : [];
    var storeMap = {};
    for (var s = 0; s < allStores.length; s++) {
      var st = allStores[s];
      storeMap[st.storeName] = st;
      var shortKey = String(st.storeName || "").replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();
      if (shortKey) storeMap[shortKey] = st;
    }

    var thMonthsShort = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var now = new Date();
    var todayStr = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");
    var yestStr = Utilities.formatDate(new Date(now.getTime() - 86400000), "GMT+7", "dd/MM/yyyy");
    var curMonthKey = Utilities.formatDate(now, "GMT+7", "yyyy-MM");
    var todayMidnightMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var thirtyDaysAgoMs = todayMidnightMs - (30 * 86400000);

    var combinedRows = [];

    // 1. ดึงข้อมูลจากแท็บหลัก "ระบบรายงานขาย" (ตั้งแต่แถว 2 ถึงแถวล่าสุด)
    if (mainSheet && currentLastRow >= 2) {
      var maxCols = Math.min(24, mainSheet.getLastColumn());
      var rng = mainSheet.getRange(2, 1, currentLastRow - 1, maxCols);
      var rawVals = rng.getValues();
      var dispVals = rng.getDisplayValues();
      for (var r = 0; r < dispVals.length; r++) {
        combinedRows.push({
          row: dispVals[r],
          rawDate: rawVals[r][0],
          rowIdx: r + 2,
          isArchive: false
        });
      }
    }

    // 2. ดึงข้อมูลจากแท็บสรุปขายรายเดือนทั้งหมด (เช่น สรุปขาย_2026_05, สรุปขาย_2026_08, สรุปขาย_2026_09, สรุปขาย_2026_10)
    var allSheets = ss.getSheets();
    for (var shIdx = 0; shIdx < allSheets.length; shIdx++) {
      var shObj = allSheets[shIdx];
      var shName = shObj.getName();
      if (shName === CONFIG.SHEET_MAIN_SALES || shName.toLowerCase().indexOf("backup") !== -1) continue;
      if (shName.indexOf("_202") !== -1 && shObj.getLastRow() >= 2) {
        var aLast = shObj.getLastRow();
        var aCols = Math.min(24, shObj.getLastColumn());
        var aRng = shObj.getRange(2, 1, aLast - 1, aCols);
        var aRaw = aRng.getValues();
        var aDisp = aRng.getDisplayValues();
        for (var ar = 0; ar < aDisp.length; ar++) {
          combinedRows.push({
            row: aDisp[ar],
            rawDate: aRaw[ar][0],
            rowIdx: 100,
            isArchive: true
          });
        }
      }
    }

    var kpi = {
      todaySales: 0, todayCash: 0, todayTransfer: 0, todayCredit: 0, todayFuel: 0, todayNetCash: 0, todayBillsCount: 0,
      yestSales: 0, yestBillsCount: 0,
      monthSales: 0, monthG15: 0, monthG48: 0, monthCans: 0, monthBillsCount: 0,
      monthDailyAvg: 0, monthForecastSales: 0, monthGrowthPct: 0,
      allTimeSales: 0, allTimeBillsCount: 0, allTimeG15: 0, allTimeG48: 0, allTimeCans: 0,
      pendingTotal: 0, pendingCount: 0, creditTotal: 0, creditCount: 0
    };

    var todayBills = [];
    var yestBills = [];
    var pendingBills = [];
    var dailyTrendMap = {};
    var monthlyTrendMap = {};
    var storeHistoryMap = {};
    var seenDedupMap = {};

    for (var dIdx = 13; dIdx >= 0; dIdx--) {
      var dt = new Date(now.getTime() - (dIdx * 86400000));
      var dk = Utilities.formatDate(dt, "GMT+7", "dd/MM");
      var dfull = Utilities.formatDate(dt, "GMT+7", "dd/MM/yyyy");
      dailyTrendMap[dfull] = { label: dk, sales: 0, cash: 0, transfer: 0, credit: 0 };
    }

    for (var idx = 0; idx < combinedRows.length; idx++) {
      var itemObj = combinedRows[idx];
      var row = itemObj.row;
      var rowIdx = itemObj.rowIdx;
      var sender = String(row[1] || "").trim();
      var status = String(row[22] || "").trim();

      if (status === "ยกเลิก" || status === "รอดำเนินการ" || status === "จัดส่งแล้ว" || sender === "สั่งผ่านบอท") continue;

      var dObj = WEB_ParseHistoricalDate_(itemObj.rawDate, row[0], rowIdx);
      if (!dObj) continue;

      var storeRaw = String(row[5] || "").trim();
      if (!storeRaw) continue;

      var g15 = WEB_CleanNum_(row[2]);
      var g48 = WEB_CleanNum_(row[3]);
      var cans = WEB_CleanNum_(row[4]);
      if (g15 === 0 && g48 === 0 && cans === 0) continue;

      var pay = String(row[6] || "").trim();
      var cashRec = WEB_CleanNum_(row[8]);
      var amt = WEB_CleanNum_(row[9]);
      var fuel = WEB_CleanNum_(row[10]);
      var orderIdRaw = String(row[21] || "").trim() || String(rowIdx);
      var orderId = orderIdRaw.indexOf("#") === 0 ? orderIdRaw : "#" + orderIdRaw;

      var shortLookup = storeRaw.replace(/^\[ST-\d+\]\s*/i, "").trim().toLowerCase();
      var stInfo = storeMap[storeRaw] || storeMap[shortLookup] || null;
      var canonicalStore = (stInfo && stInfo.storeName) ? stInfo.storeName : storeRaw;

      if (amt <= 0) {
        var p15 = (stInfo && stInfo.price15) ? Number(stInfo.price15) : 490;
        var p48 = (stInfo && stInfo.price48) ? Number(stInfo.price48) : 1530;
        var pCan = (stInfo && stInfo.priceCan) ? Number(stInfo.priceCan) : 790;
        amt = (g15 * p15) + (g48 * p48) + (cans * pCan);
      }

      var timeStampKey = Utilities.formatDate(dObj, "GMT+7", "yyyyMMdd_HHmm") + "_" + canonicalStore + "_" + amt;
      if (seenDedupMap[timeStampKey]) continue;
      seenDedupMap[timeStampKey] = true;

      var dStr = Utilities.formatDate(dObj, "GMT+7", "dd/MM/yyyy");
      var mKey = Utilities.formatDate(dObj, "GMT+7", "yyyy-MM");
      var mIdx = dObj.getMonth();
      var yNum = dObj.getFullYear();

      var cTerm = (stInfo && stInfo.creditTerm) ? String(stInfo.creditTerm).trim() : "";
      var isCreditStore = (cTerm === "15" || cTerm === "30");
      var isHistoricalCollected = (!isCreditStore && dObj < new Date(2026, 10, 1)) || (isCreditStore && dObj < new Date(2026, 9, 1));
      var isPaid = isHistoricalCollected || (status.indexOf("ชำระแล้ว") !== -1) || (pay.indexOf("สด") !== -1 && pay.indexOf("ผสม") === -1);

      // สะสมยอดรวมทั้งหมด (All-Time)
      kpi.allTimeSales += amt;
      kpi.allTimeBillsCount += 1;
      kpi.allTimeG15 += g15;
      kpi.allTimeG48 += g48;
      kpi.allTimeCans += cans;

      // สะสมรายเดือน (Month-by-Month)
      if (!monthlyTrendMap[mKey]) {
        monthlyTrendMap[mKey] = {
          monthKey: mKey,
          monthLabel: thMonthsShort[mIdx] + " " + String(yNum + 543).slice(-2),
          season: WEB_GetChiangMaiSeasonLabel_(mIdx),
          year: yNum,
          monthZero: mIdx,
          sales: 0,
          cashSales: 0,
          transferSales: 0,
          creditSales: 0,
          g15: 0,
          g48: 0,
          cans: 0,
          billsCount: 0,
          activeDaysMap: {}
        };
      }
      var mEntry = monthlyTrendMap[mKey];
      mEntry.sales += amt;
      mEntry.g15 += g15;
      mEntry.g48 += g48;
      mEntry.cans += cans;
      mEntry.billsCount += 1;
      mEntry.activeDaysMap[dStr] = true;
      if (pay.indexOf("สด") !== -1) mEntry.cashSales += amt;
      else if (pay.indexOf("โอน") !== -1) mEntry.transferSales += amt;
      else mEntry.creditSales += amt;

      if (mKey === curMonthKey) {
        kpi.monthSales += amt;
        kpi.monthG15 += g15;
        kpi.monthG48 += g48;
        kpi.monthCans += cans;
        kpi.monthBillsCount += 1;
      }

      if (dailyTrendMap[dStr]) {
        dailyTrendMap[dStr].sales += amt;
        if (pay.indexOf("สด") !== -1) dailyTrendMap[dStr].cash += amt;
        else if (pay.indexOf("โอน") !== -1) dailyTrendMap[dStr].transfer += amt;
        else dailyTrendMap[dStr].credit += amt;
      }

      if (dStr === todayStr && !itemObj.isArchive) {
        kpi.todaySales += amt;
        kpi.todayFuel += fuel;
        kpi.todayBillsCount += 1;
        if (pay.indexOf("สด") !== -1) kpi.todayCash += amt;
        else if (pay.indexOf("โอน") !== -1) kpi.todayTransfer += amt;
        else kpi.todayCredit += amt;

        todayBills.push({
          orderId: orderId,
          timeStr: Utilities.formatDate(dObj, "GMT+7", "HH:mm"),
          store: canonicalStore,
          g15: g15, g48: g48, cans: cans, total: amt, fuel: fuel,
          payMethod: pay, sender: sender || "-",
          status: isPaid ? "ชำระแล้ว" : "รอตรวจสอบ"
        });
      }

      if (dStr === yestStr && !itemObj.isArchive) {
        kpi.yestSales += amt;
        kpi.yestBillsCount += 1;
        yestBills.push({
          orderId: orderId,
          timeStr: Utilities.formatDate(dObj, "GMT+7", "HH:mm"),
          store: canonicalStore,
          g15: g15, g48: g48, cans: cans, total: amt, fuel: fuel,
          payMethod: pay, sender: sender || "-",
          status: isPaid ? "ชำระแล้ว" : "รอตรวจสอบ"
        });
      }

      if (!isPaid && !itemObj.isArchive && (pay.indexOf("โอน") !== -1 || pay.indexOf("เครดิต") !== -1 || pay.indexOf("ผสม") !== -1)) {
        var billRemain = (pay.indexOf("ผสม") !== -1) ? Math.max(0, amt - cashRec) : amt;
        if (billRemain > 0) {
          if (isCreditStore && rowIdx >= 290 && dObj >= new Date(2026, 9, 1)) {
            kpi.creditTotal += billRemain;
            kpi.creditCount += 1;
          } else if (!isCreditStore && rowIdx >= 385 && dObj >= new Date(2026, 10, 1)) {
            kpi.pendingTotal += billRemain;
            kpi.pendingCount += 1;
            pendingBills.push({
              orderId: orderId,
              dateStr: Utilities.formatDate(dObj, "GMT+7", "dd/MM/yy HH:mm"),
              store: canonicalStore,
              amount: billRemain,
              sender: sender || "-",
              daysAging: Math.max(0, Math.floor((now.getTime() - dObj.getTime()) / 86400000))
            });
          }
        }
      }

      if (!storeHistoryMap[canonicalStore]) {
        storeHistoryMap[canonicalStore] = {
          storeName: canonicalStore,
          totalRevenue: 0,
          recent30dRevenue: 0,
          totalG15: 0,
          totalG48: 0,
          totalCans: 0,
          ordersByDayMap: {}
        };
      }
      var sh = storeHistoryMap[canonicalStore];
      sh.totalRevenue += amt;
      sh.totalG15 += g15;
      sh.totalG48 += g48;
      sh.totalCans += cans;

      var dayMidMs = new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()).getTime();
      if (dayMidMs >= thirtyDaysAgoMs) {
        sh.recent30dRevenue += amt;
      }

      if (!sh.ordersByDayMap[dStr]) {
        sh.ordersByDayMap[dStr] = { dateStr: dStr, dateMs: dayMidMs, g15: 0, g48: 0, cans: 0, amount: 0 };
      }
      sh.ordersByDayMap[dStr].g15 += g15;
      sh.ordersByDayMap[dStr].g48 += g48;
      sh.ordersByDayMap[dStr].cans += cans;
      sh.ordersByDayMap[dStr].amount += amt;
    }

    kpi.todayNetCash = kpi.todayCash - kpi.todayFuel;

    // สรุปแนวโน้มรายเดือน (Month-over-Month) + ยอดสะสมรายเดือน (Cumulative) + Forecast สิ้นเดือน
    var monthlyTrendArr = [];
    var runningCumulativeSales = 0;
    var mKeys = Object.keys(monthlyTrendMap).sort();
    for (var m1 = 0; m1 < mKeys.length; m1++) {
      var mItem = monthlyTrendMap[mKeys[m1]];
      runningCumulativeSales += mItem.sales;

      var daysInMonth = new Date(mItem.year, mItem.monthZero + 1, 0).getDate();
      var elapsedDays = (mItem.monthKey === curMonthKey) ? Math.max(1, now.getDate()) : daysInMonth;
      var dailyAvg = Math.round(mItem.sales / elapsedDays);
      var forecastFullMonth = (mItem.monthKey === curMonthKey) ? Math.round(dailyAvg * daysInMonth) : mItem.sales;

      var prevMonthSales = (m1 > 0) ? monthlyTrendArr[m1 - 1].sales : 0;
      var momPct = (prevMonthSales > 0) ? Math.round(((forecastFullMonth - prevMonthSales) / prevMonthSales) * 100) : 0;

      if (mItem.monthKey === curMonthKey) {
        kpi.monthDailyAvg = dailyAvg;
        kpi.monthForecastSales = forecastFullMonth;
        kpi.monthGrowthPct = momPct;
      }

      monthlyTrendArr.push({
        monthKey: mItem.monthKey,
        monthLabel: mItem.monthLabel,
        season: mItem.season,
        sales: mItem.sales,
        cumulativeSales: runningCumulativeSales,
        forecastSales: forecastFullMonth,
        dailyAvg: dailyAvg,
        momPct: momPct,
        billsCount: mItem.billsCount,
        g15: mItem.g15,
        g48: mItem.g48,
        cans: mItem.cans,
        isCurrent: (mItem.monthKey === curMonthKey)
      });
    }

    // พยากรณ์วันสั่งแก๊สรอบถัดไป (Burn Rate กิโลกรัม 2-3 รอบล่าสุด + Season Factor)
    var curMonthZero = now.getMonth();
    var seasonFactor = (curMonthZero === 10 || curMonthZero === 11 || curMonthZero === 0 || curMonthZero === 1)
      ? 1.15
      : ((curMonthZero === 2 || curMonthZero === 3 || curMonthZero === 9) ? 1.00 : 0.90);

    var predictions = [];
    var storeKeys = Object.keys(storeHistoryMap);
    for (var k = 0; k < storeKeys.length; k++) {
      var item = storeHistoryMap[storeKeys[k]];
      var dayKeys = Object.keys(item.ordersByDayMap);
      var dayEvents = [];
      for (var dkIdx = 0; dkIdx < dayKeys.length; dkIdx++) dayEvents.push(item.ordersByDayMap[dayKeys[dkIdx]]);
      dayEvents.sort(function(a, b) { return a.dateMs - b.dateMs; });
      if (dayEvents.length === 0) continue;

      var cylEvents = [];
      var canEvents = [];
      for (var evIdx = 0; evIdx < dayEvents.length; evIdx++) {
        var ev = dayEvents[evIdx];
        var kgVal = (ev.g15 * 15) + (ev.g48 * 48);
        if (kgVal > 0) {
          cylEvents.push({
            dateStr: ev.dateStr,
            dateMs: ev.dateMs,
            g15: ev.g15,
            g48: ev.g48,
            cans: ev.cans,
            kgGas: kgVal
          });
        }
        if (ev.cans > 0) {
          canEvents.push({
            dateStr: ev.dateStr,
            dateMs: ev.dateMs,
            cans: ev.cans
          });
        }
      }

      var targetLastEv = dayEvents[dayEvents.length - 1];
      var daysSinceLast = Math.max(0, Math.round((todayMidnightMs - targetLastEv.dateMs) / 86400000));
      var allTimeCycleAvg = 7;
      var currentSeasonCycleAvg = 7;
      var predictedCycle = 7;
      var confidenceLabel = "ข้อมูลเริ่มต้น (1 บิล)";

      if (cylEvents.length >= 1) {
        targetLastEv = cylEvents[cylEvents.length - 1];
        daysSinceLast = Math.max(0, Math.round((todayMidnightMs - targetLastEv.dateMs) / 86400000));

        var burnCycles = [];
        for (var cIdx = 1; cIdx < cylEvents.length; cIdx++) {
          var prevCyl = cylEvents[cIdx - 1];
          var currCyl = cylEvents[cIdx];
          var diffDays = Math.round((currCyl.dateMs - prevCyl.dateMs) / 86400000);
          if (diffDays >= 1 && diffDays <= 45 && prevCyl.kgGas > 0) {
            burnCycles.push({
              days: diffDays,
              prevKg: prevCyl.kgGas,
              kgPerDay: prevCyl.kgGas / diffDays
            });
          }
        }

        if (burnCycles.length >= 1) {
          var sumAllDays = 0;
          for (var bAll = 0; bAll < burnCycles.length; bAll++) sumAllDays += burnCycles[bAll].days;
          allTimeCycleAvg = Math.round((sumAllDays / burnCycles.length) * 10) / 10;

          var recentCycles = burnCycles.slice(-3);
          var weightedKgPerDay = 0;
          if (recentCycles.length === 1) {
            weightedKgPerDay = recentCycles[0].kgPerDay;
          } else if (recentCycles.length === 2) {
            weightedKgPerDay = (recentCycles[1].kgPerDay * 0.60) + (recentCycles[0].kgPerDay * 0.40);
          } else {
            weightedKgPerDay = (recentCycles[2].kgPerDay * 0.50) + (recentCycles[1].kgPerDay * 0.30) + (recentCycles[0].kgPerDay * 0.20);
          }

          var effectiveBurnRateKg = Math.max(0.5, weightedKgPerDay * seasonFactor);
          var lastDeliveredKg = targetLastEv.kgGas;
          predictedCycle = Math.max(1, Math.round(lastDeliveredKg / effectiveBurnRateKg));
          currentSeasonCycleAvg = predictedCycle;

          confidenceLabel = "🔥 Burn ~" + effectiveBurnRateKg.toFixed(1) + " กก./วัน (" + recentCycles.length + " รอบล่าสุด)";
        } else {
          predictedCycle = Math.max(3, Math.round(targetLastEv.kgGas / 6));
          allTimeCycleAvg = predictedCycle;
          currentSeasonCycleAvg = predictedCycle;
          confidenceLabel = "ข้อมูลเริ่มต้น (" + targetLastEv.kgGas + " กก.)";
        }
      } else if (canEvents.length >= 1) {
        targetLastEv = canEvents[canEvents.length - 1];
        daysSinceLast = Math.max(0, Math.round((todayMidnightMs - targetLastEv.dateMs) / 86400000));

        var canCycles = [];
        for (var kIdx = 1; kIdx < canEvents.length; kIdx++) {
          var prevCan = canEvents[kIdx - 1];
          var currCan = canEvents[kIdx];
          var cDiff = Math.round((currCan.dateMs - prevCan.dateMs) / 86400000);
          if (cDiff >= 1 && cDiff <= 60 && prevCan.cans > 0) {
            canCycles.push({
              days: cDiff,
              daysPerBox: cDiff / prevCan.cans
            });
          }
        }

        if (canCycles.length >= 1) {
          var sumCanAll = 0;
          for (var ca = 0; ca < canCycles.length; ca++) sumCanAll += canCycles[ca].days;
          allTimeCycleAvg = Math.round((sumCanAll / canCycles.length) * 10) / 10;

          var recentCan = canCycles.slice(-3);
          var sumBoxDays = 0;
          for (var rc = 0; rc < recentCan.length; rc++) sumBoxDays += recentCan[rc].daysPerBox;
          var avgDaysPerBox = sumBoxDays / recentCan.length;

          predictedCycle = Math.max(1, Math.round(targetLastEv.cans * avgDaysPerBox));
          currentSeasonCycleAvg = predictedCycle;
          confidenceLabel = "🥫 เฉลี่ยลังละ ~" + avgDaysPerBox.toFixed(1) + " วัน (" + recentCan.length + " รอบล่าสุด)";
        } else {
          predictedCycle = Math.max(5, targetLastEv.cans * 7);
          allTimeCycleAvg = predictedCycle;
          currentSeasonCycleAvg = predictedCycle;
          confidenceLabel = "ข้อมูลแก๊สลังเริ่มต้น (1 บิล)";
        }
      }

      var daysUntilNext = predictedCycle - daysSinceLast;
      var nextDateObj = new Date(targetLastEv.dateMs + (predictedCycle * 86400000));
      var nextOrderDateStr = Utilities.formatDate(nextDateObj, "GMT+7", "dd/MM/yyyy");

      var lastItemsArr = [];
      if (targetLastEv.g15 > 0) lastItemsArr.push("15กก.(" + targetLastEv.g15 + ")");
      if (targetLastEv.g48 > 0) lastItemsArr.push("48กก.(" + targetLastEv.g48 + ")");
      if (targetLastEv.kgGas > 0) lastItemsArr.push("[" + targetLastEv.kgGas + " กก.]");
      if (targetLastEv.cans > 0) lastItemsArr.push("กระป๋อง(" + targetLastEv.cans + ")");

      var urgency = "SAFE";
      if (daysSinceLast > (predictedCycle * 2.5) && daysSinceLast > 20) urgency = "INACTIVE";
      else if (daysUntilNext <= 0) urgency = "URGENT";
      else if (daysUntilNext <= 2) urgency = "SOON";

      predictions.push({
        storeName: item.storeName,
        totalRevenue: item.totalRevenue,
        totalG15: item.totalG15, totalG48: item.totalG48, totalCans: item.totalCans,
        lastOrderDateStr: targetLastEv.dateStr,
        lastOrderItems: lastItemsArr.join(" ") || "-",
        daysSinceLast: daysSinceLast,
        seasonCycleDays: currentSeasonCycleAvg,
        allTimeCycleDays: allTimeCycleAvg,
        daysUntilNext: daysUntilNext,
        nextOrderDateStr: nextOrderDateStr,
        urgency: urgency,
        confidence: confidenceLabel
      });
    }

    var urgencyRank = { "URGENT": 1, "SOON": 2, "SAFE": 3, "INACTIVE": 4 };
    predictions.sort(function(a, b) {
      if (urgencyRank[a.urgency] !== urgencyRank[b.urgency]) return urgencyRank[a.urgency] - urgencyRank[b.urgency];
      return a.daysUntilNext - b.daysUntilNext;
    });

    var topStores = predictions.slice().sort(function(a, b) { return b.totalRevenue - a.totalRevenue; }).slice(0, 12);

    var dailyTrendArr = [];
    var dKeys = Object.keys(dailyTrendMap);
    for (var d1 = 0; d1 < dKeys.length; d1++) dailyTrendArr.push(dailyTrendMap[dKeys[d1]]);

    var resultPayload = {
      ok: true,
      updatedAt: Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm:ss"),
      todayStr: todayStr,
      yestStr: yestStr,
      kpi: kpi,
      todayBills: todayBills.reverse(),
      yestBills: yestBills.reverse(),
      pendingBills: pendingBills,
      dailyTrend: dailyTrendArr,
      monthlyTrend: monthlyTrendArr,
      predictions: predictions,
      topStores: topStores
    };

    try { cache.put(cacheKey, JSON.stringify(resultPayload), 180); } catch (eC) {}
    return resultPayload;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function WEB_BuildAdminControlCenterHtml_(preloadedData) {
  var safeJson = JSON.stringify(preloadedData || { ok: false }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>กอ.แก๊ส เชียงใหม่ • Executive Analytics & Forecast</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --brand-blue: #1DA1DB;
      --brand-dark: #111111;
      --bg-main: #F4F7FA;
      --card-bg: #FFFFFF;
      --text-main: #111111;
      --text-muted: #64748B;
      --green: #16A34A;
      --orange: #EA580C;
      --red: #DC2626;
      --border: #E2E8F0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Prompt", -apple-system, BlinkMacSystemFont, sans-serif; }
    body { background: var(--bg-main); color: var(--text-main); min-height: 100vh; overflow-x: hidden; }

    .app-layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 260px; background: var(--brand-dark); color: #fff; padding: 24px 16px;
      display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 100;
    }
    .brand-box { padding: 8px 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.12); margin-bottom: 16px; }
    .brand-title { font-size: 19px; font-weight: 700; color: #fff; }
    .brand-tag { font-size: 11px; color: var(--brand-blue); margin-top: 2px; }
    .nav-item {
      display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px;
      color: #CBD5E1; font-size: 14px; font-weight: 500; cursor: pointer; margin-bottom: 6px;
    }
    .nav-item.active { background: var(--brand-blue); color: #fff; font-weight: 600; }

    .main-content { flex: 1; margin-left: 260px; padding: 24px 28px 90px; max-width: 1440px; width: 100%; }
    .top-bar {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
      background: var(--card-bg); padding: 16px 20px; border-radius: 16px; border: 1px solid var(--border); margin-bottom: 20px;
    }
    .top-title { font-size: 20px; font-weight: 700; }
    .top-meta { font-size: 12px; color: var(--text-muted); }
    .btn-refresh {
      background: #111111; color: #fff; border: none; padding: 10px 16px; border-radius: 10px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 22px; }
    .kpi-card { background: var(--card-bg); border-radius: 16px; padding: 18px; border: 1px solid var(--border); }
    .kpi-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
    .kpi-value { font-size: 25px; font-weight: 700; margin: 6px 0 4px; color: var(--brand-dark); }
    .kpi-sub { font-size: 12px; color: var(--text-muted); }

    .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 18px; margin-bottom: 22px; }
    .panel-card { background: var(--card-bg); border-radius: 16px; padding: 20px; border: 1px solid var(--border); margin-bottom: 20px; }
    .panel-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .panel-title { font-size: 16px; font-weight: 700; color: var(--brand-dark); }
    .chart-box { position: relative; height: 290px; width: 100%; }

    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill {
      padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; cursor: pointer;
      border: 1px solid var(--border); background: #F8FAFC; color: var(--text-main);
    }
    .pill.active { background: var(--brand-blue); color: #fff; border-color: var(--brand-blue); }
    .search-box { padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; min-width: 180px; }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #F8FAFC; color: var(--text-muted); text-align: left; padding: 11px 12px; font-weight: 600; border-bottom: 1px solid var(--border); white-space: nowrap; }
    td { padding: 12px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }

    .badge { display: inline-block; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .badge-urgent { background: #FEE2E2; color: #B91C1C; }
    .badge-soon { background: #FFEDD5; color: #C2410C; }
    .badge-safe { background: #DCFCE7; color: #15803D; }
    .badge-inactive { background: #F1F5F9; color: #64748B; }

    .mobile-nav {
      display: none; position: fixed; bottom: 0; left: 0; right: 0; background: #111111;
      border-top: 1px solid rgba(255,255,255,0.15); z-index: 200; justify-content: space-around; padding: 8px 4px 12px;
    }
    .m-nav-btn { color: #94A3B8; font-size: 11px; text-align: center; cursor: pointer; flex: 1; padding: 4px; }
    .m-nav-btn.active { color: var(--brand-blue); font-weight: 700; }

    @media (max-width: 992px) {
      .sidebar { display: none; }
      .main-content { margin-left: 0; padding: 14px 12px 90px; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .charts-grid { grid-template-columns: 1fr; }
      .mobile-nav { display: flex; }
      .kpi-value { font-size: 19px; }
      .top-title { font-size: 16px; }
    }
  </style>
</head>
<body>

  <div class="app-layout" id="appLayout">
    <aside class="sidebar">
      <div class="brand-box">
        <div class="brand-title">🔥 กอ.แก๊ส เชียงใหม่</div>
        <div class="brand-tag">EXECUTIVE ANALYTICS DASHBOARD</div>
      </div>
      <div class="nav-item active" data-tab="secOverview">📊 ภาพรวม & กราฟ</div>
      <div class="nav-item" data-tab="secMonthly">🗓️ เปรียบเทียบรายเดือน (Season)</div>
      <div class="nav-item" data-tab="secPredict">🔮 พยากรณ์ร้านใกล้หมด</div>
      <div class="nav-item" data-tab="secToday">🧾 บิลวันนี้ & รอโอน</div>
    </aside>

    <main class="main-content">
      <div class="top-bar">
        <div>
          <div class="top-title">📊 แดชบอร์ดผู้บริหาร กอ.แก๊ส เชียงใหม่</div>
          <div class="top-meta" id="lastUpdateTxt">โหมดดูข้อมูลอย่างเดียว (Read-Only) • กำลังโหลดข้อมูล...</div>
        </div>
        <button type="button" class="btn-refresh" id="refreshBtn">🔄 อัปเดตข้อมูลสด</button>
      </div>

      <!-- KPI 4 กล่อง -->
      <div class="kpi-grid">
        <div class="kpi-card" style="border-top: 4px solid #1DA1DB;">
          <div class="kpi-label">📅 ยอดขายวันนี้ (Today)</div>
          <div class="kpi-value" id="kpiTodaySales">0 บาท</div>
          <div class="kpi-sub" id="kpiTodaySub">จัดส่ง: 0 บิล</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid #16A34A;">
          <div class="kpi-label">🗓️ ยอดเดือนนี้ + พยากรณ์สิ้นเดือน (High Season)</div>
          <div class="kpi-value" id="kpiMonthSales">0 บาท</div>
          <div class="kpi-sub" id="kpiMonthSub">คาดการณ์จบเดือน: 0 บาท</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid #111111;">
          <div class="kpi-label">🏆 ยอดขายสะสมทุกเดือนรวม</div>
          <div class="kpi-value" id="kpiAllTimeSales">0 บาท</div>
          <div class="kpi-sub" id="kpiAllTimeSub">รวมทุกเดือน</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid #DC2626;">
          <div class="kpi-label">🔮 ร้านแก๊สใกล้หมด / ถึงรอบสั่ง</div>
          <div class="kpi-value" id="kpiUrgentStores" style="color:#DC2626;">0 ร้าน</div>
          <div class="kpi-sub" id="kpiPendingSub">บิลรอโอน: 0 บาท</div>
        </div>
      </div>

      <!-- ส่วนกราฟภาพรวม -->
      <div id="secOverview">
        <div class="charts-grid">
          <div class="panel-card">
            <div class="panel-header"><div class="panel-title">📈 เปรียบเทียบยอดขายรายเดือน & ยอดสะสมรายเดือน (Low Season vs High Season)</div></div>
            <div class="chart-box"><canvas id="monthlyChart"></canvas></div>
          </div>
          <div class="panel-card">
            <div class="panel-header"><div class="panel-title">🛢️ สัดส่วนยอดสั่งถังแก๊สสะสม</div></div>
            <div class="chart-box"><canvas id="cylinderMixChart"></canvas></div>
          </div>
        </div>
        <div class="charts-grid">
          <div class="panel-card">
            <div class="panel-header"><div class="panel-title">📊 แนวโน้มยอดขายรายวัน (14 วันล่าสุด)</div></div>
            <div class="chart-box"><canvas id="dailySalesChart"></canvas></div>
          </div>
          <div class="panel-card">
            <div class="panel-header"><div class="panel-title">🏅 Top 12 ร้านค้ายอดสั่งสูงสุด (สะสม)</div></div>
            <div class="chart-box"><canvas id="topStoresChart"></canvas></div>
          </div>
        </div>
      </div>

      <!-- ตารางเปรียบเทียบรายเดือน (Month-over-Month & ยอดสะสมรายเดือน) -->
      <div class="panel-card" id="secMonthly">
        <div class="panel-header">
          <div>
            <div class="panel-title">🗓️ ตารางวิเคราะห์ยอดขายรายเดือน & ยอดขายสะสม (Month-over-Month Forecast)</div>
            <div style="font-size:12px; color:#64748B; margin-top:2px;">รวมข้อมูลครบทุกเดือนพร้อมคำนวณยอดขายสะสมต่อเนื่องรายเดือน</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th>ฤดูกาล</th>
                <th>จำนวนบิล</th>
                <th>ถัง 15 กก.</th>
                <th>ถัง 48 กก.</th>
                <th>แก๊สกระป๋อง</th>
                <th>ยอดขายประจำเดือน</th>
                <th>ยอดขายสะสมรายเดือน</th>
                <th>เฉลี่ยต่อวัน</th>
                <th>พยากรณ์จบเดือน / เติบโต</th>
              </tr>
            </thead>
            <tbody id="monthlyTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- ตารางพยากรณ์ร้านใกล้หมด (Burn Rate 2-3 รอบล่าสุด) -->
      <div class="panel-card" id="secPredict">
        <div class="panel-header">
          <div>
            <div class="panel-title">🔮 พยากรณ์ร้านค้าที่แก๊สใกล้หมด (คำนวณ Burn Rate กก. จาก 2–3 รอบล่าสุด + ฤดูกาล)</div>
            <div style="font-size:12px; color:#64748B; margin-top:2px;">คิดจากน้ำหนักเนื้อแก๊สจริง (15กก.=15กก., 48กก.=48กก.) และแก๊สกระป๋องอัปเดต Real-Time ทันทีที่ส่งเสร็จ</div>
          </div>
          <div class="filter-bar">
            <input type="text" id="predSearch" class="search-box" placeholder="🔍 ค้นหาชื่อร้านค้า...">
            <span class="pill active" data-filter="ALL">ทั้งหมด</span>
            <span class="pill" data-filter="URGENT">🔴 ถึงกำหนดวันนี้/เลยรอบ</span>
            <span class="pill" data-filter="SOON">🟠 ใกล้หมดใน 1–2 วัน</span>
            <span class="pill" data-filter="SAFE">🟢 ยังมีแก๊ส</span>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>สถานะ</th>
                <th>ชื่อร้านค้า / อัตราการใช้จริง</th>
                <th>คาดว่าจะสั่งในอีก</th>
                <th>วันที่คาดว่าจะสั่ง</th>
                <th>สั่งล่าสุดเมื่อ</th>
                <th>รายการล่าสุด (น้ำหนัก)</th>
                <th>รอบคำนวณล่าสุด vs เฉลี่ยรวม</th>
                <th>ยอดซื้อสะสม</th>
              </tr>
            </thead>
            <tbody id="predictTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- ตารางบิลวันนี้/เมื่อวาน และ บิลรอโอน (Read-Only) -->
      <div class="charts-grid" id="secToday">
        <div class="panel-card">
          <div class="panel-header"><div class="panel-title" id="todaySectionTitle">🧾 รายการบิลวันนี้</div></div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เลขบิล</th>
                  <th>เวลา</th>
                  <th>ร้านค้า</th>
                  <th>รายการ</th>
                  <th>ยอดรวม</th>
                  <th>วิธีชำระ</th>
                  <th>ผู้ส่ง</th>
                </tr>
              </thead>
              <tbody id="todayTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-header"><div class="panel-title">📋 บิลรอโอน (ตั้งแต่ 1 พ.ย. 69)</div></div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เลขบิล</th>
                  <th>วันที่</th>
                  <th>ร้านค้า</th>
                  <th>ยอดค้าง</th>
                  <th>ค้างมาแล้ว</th>
                </tr>
              </thead>
              <tbody id="pendingTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <nav class="mobile-nav">
      <div class="m-nav-btn active" data-tab="secOverview">📊<br>ภาพรวม</div>
      <div class="m-nav-btn" data-tab="secMonthly">🗓️<br>รายเดือน</div>
      <div class="m-nav-btn" data-tab="secPredict">🔮<br>พยากรณ์</div>
      <div class="m-nav-btn" data-tab="secToday">🧾<br>บิลวันนี้</div>
    </nav>
  </div>

  <script>
    var DASH_DATA = ${safeJson};
    var PRED_FILTER = "ALL";
    var chartDaily = null, chartMix = null, chartTop = null, chartMonth = null;

    function renderAllDashboard(d) {
      if (!d || !d.ok) {
        document.getElementById("lastUpdateTxt").textContent = "เกิดข้อผิดพลาด: " + (d && d.error ? d.error : "ไม่สามารถโหลดข้อมูลได้");
        return;
      }
      document.getElementById("lastUpdateTxt").textContent = "อัปเดตล่าสุด: " + d.updatedAt + " • โหมดดูข้อมูลอย่างเดียว (Read-Only)";
      var k = d.kpi;

      document.getElementById("kpiTodaySales").textContent = k.todaySales.toLocaleString() + " บาท";
      document.getElementById("kpiTodaySub").textContent = "วันนี้ " + k.todayBillsCount + " บิล | เมื่อวาน (" + (d.yestStr || "") + "): " + (k.yestSales || 0).toLocaleString() + " บ.";

      document.getElementById("kpiMonthSales").textContent = k.monthSales.toLocaleString() + " บาท";
      var growthSign = k.monthGrowthPct >= 0 ? "+" : "";
      document.getElementById("kpiMonthSub").textContent = "พยากรณ์จบเดือน: ~" + (k.monthForecastSales || 0).toLocaleString() + " บ. (เฉลี่ย " + (k.monthDailyAvg || 0).toLocaleString() + " บ./วัน • " + growthSign + k.monthGrowthPct + "%)";

      document.getElementById("kpiAllTimeSales").textContent = (k.allTimeSales || 0).toLocaleString() + " บาท";
      document.getElementById("kpiAllTimeSub").textContent = "รวม " + (k.allTimeBillsCount || 0).toLocaleString() + " บิล (15กก.:" + k.allTimeG15 + " | 48กก.:" + k.allTimeG48 + " | กระป๋อง:" + k.allTimeCans + ")";

      var urgentCount = 0, soonCount = 0;
      for (var i = 0; i < d.predictions.length; i++) {
        if (d.predictions[i].urgency === "URGENT") urgentCount++;
        else if (d.predictions[i].urgency === "SOON") soonCount++;
      }
      document.getElementById("kpiUrgentStores").textContent = (urgentCount + soonCount) + " ร้าน";
      document.getElementById("kpiPendingSub").textContent = "ถึงรอบวันนี้ " + urgentCount + " ร้าน | บิลรอโอน: " + k.pendingTotal.toLocaleString() + " บ. (" + k.pendingCount + " บิล)";

      renderMonthlyTable(d.monthlyTrend || []);
      renderPredictionTable();

      var billsToShow = (d.todayBills && d.todayBills.length > 0) ? d.todayBills : (d.yestBills || []);
      if ((!d.todayBills || d.todayBills.length === 0) && d.yestBills && d.yestBills.length > 0) {
        document.getElementById("todaySectionTitle").textContent = "🧾 รายการบิลเมื่อวาน (" + d.yestStr + ")";
      } else {
        document.getElementById("todaySectionTitle").textContent = "🧾 รายการบิลวันนี้ (" + d.todayStr + ")";
      }
      renderTodayTable(billsToShow);
      renderPendingTable(d.pendingBills);
      renderCharts(d);
    }

    function renderMonthlyTable(mList) {
      var tbody = document.getElementById("monthlyTableBody");
      tbody.innerHTML = "";
      for (var i = mList.length - 1; i >= 0; i--) {
        var m = mList[i];
        var tr = document.createElement("tr");
        var momColor = m.momPct >= 0 ? "#16A34A" : "#DC2626";
        var momSign = m.momPct >= 0 ? "+" : "";
        var forecastTxt = m.isCurrent
          ? ("<b>คาดจบเดือน ~" + m.forecastSales.toLocaleString() + " บ.</b> <span style='color:" + momColor + "'>(" + momSign + m.momPct + "%)</span>")
          : ("ปิดเดือนแล้ว <span style='color:" + momColor + "'>(" + momSign + m.momPct + "%)</span>");

        tr.innerHTML =
          "<td><b>" + m.monthLabel + "</b></td>" +
          "<td>" + m.season + "</td>" +
          "<td>" + m.billsCount.toLocaleString() + " บิล</td>" +
          "<td>" + m.g15.toLocaleString() + " ถัง</td>" +
          "<td>" + m.g48.toLocaleString() + " ถัง</td>" +
          "<td>" + m.cans.toLocaleString() + " ลัง</td>" +
          "<td><b>" + m.sales.toLocaleString() + " บ.</b></td>" +
          "<td><b style='color:#0284C7'>" + (m.cumulativeSales || 0).toLocaleString() + " บ.</b></td>" +
          "<td>" + m.dailyAvg.toLocaleString() + " บ./วัน</td>" +
          "<td>" + forecastTxt + "</td>";
        tbody.appendChild(tr);
      }
    }

    function renderCharts(d) {
      if (typeof Chart === "undefined") return;

      if (chartMonth) chartMonth.destroy();
      chartMonth = new Chart(document.getElementById("monthlyChart"), {
        type: "bar",
        data: {
          labels: d.monthlyTrend.map(function(m){ return m.monthLabel; }),
          datasets: [
            {
              type: "line",
              label: "ยอดขายสะสมรายเดือน (บาท)",
              data: d.monthlyTrend.map(function(m){ return m.cumulativeSales; }),
              borderColor: "#111111",
              backgroundColor: "#111111",
              borderWidth: 2.5,
              tension: 0.25,
              yAxisID: "y1"
            },
            {
              label: "ยอดขายประจำเดือน (บาท)",
              data: d.monthlyTrend.map(function(m){ return m.sales; }),
              backgroundColor: "#1DA1DB",
              borderRadius: 6,
              yAxisID: "y"
            },
            {
              label: "พยากรณ์จบเดือน (Forecast)",
              data: d.monthlyTrend.map(function(m){ return m.isCurrent ? m.forecastSales : null; }),
              backgroundColor: "rgba(22,163,74,0.35)",
              borderColor: "#16A34A",
              borderWidth: 2,
              borderRadius: 6,
              yAxisID: "y"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { type: "linear", position: "left", beginAtZero: true },
            y1: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false } }
          }
        }
      });

      if (chartMix) chartMix.destroy();
      chartMix = new Chart(document.getElementById("cylinderMixChart"), {
        type: "doughnut",
        data: {
          labels: ["ถัง 15 กก. (" + d.kpi.allTimeG15 + ")", "ถัง 48 กก. (" + d.kpi.allTimeG48 + ")", "แก๊สกระป๋อง (" + d.kpi.allTimeCans + ")"],
          datasets: [{ data: [d.kpi.allTimeG15, d.kpi.allTimeG48, d.kpi.allTimeCans], backgroundColor: ["#1DA1DB", "#111111", "#F59E0B"] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      var labels14 = d.dailyTrend.map(function(x){ return x.label; });
      if (chartDaily) chartDaily.destroy();
      chartDaily = new Chart(document.getElementById("dailySalesChart"), {
        type: "bar",
        data: {
          labels: labels14,
          datasets: [
            { label: "เงินสด", data: d.dailyTrend.map(function(x){ return x.cash; }), backgroundColor: "#16A34A", borderRadius: 4 },
            { label: "เงินโอน", data: d.dailyTrend.map(function(x){ return x.transfer; }), backgroundColor: "#1DA1DB", borderRadius: 4 },
            { label: "เครดิต", data: d.dailyTrend.map(function(x){ return x.credit; }), backgroundColor: "#F59E0B", borderRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
      });

      if (chartTop) chartTop.destroy();
      chartTop = new Chart(document.getElementById("topStoresChart"), {
        type: "bar",
        data: {
          labels: d.topStores.map(function(s){ return s.storeName.substring(0, 20); }),
          datasets: [{ label: "ยอดซื้อสะสม (บาท)", data: d.topStores.map(function(s){ return s.totalRevenue; }), backgroundColor: "#1DA1DB", borderRadius: 6 }]
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false }
      });
    }

    function renderPredictionTable() {
      if (!DASH_DATA || !DASH_DATA.predictions) return;
      var q = (document.getElementById("predSearch").value || "").toLowerCase();
      var rows = DASH_DATA.predictions;
      var tbody = document.getElementById("predictTableBody");
      tbody.innerHTML = "";

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (PRED_FILTER !== "ALL" && r.urgency !== PRED_FILTER) continue;
        if (q && r.storeName.toLowerCase().indexOf(q) === -1) continue;

        var tr = document.createElement("tr");
        var badgeClass = "badge-safe", badgeTxt = "🟢 ยังมีแก๊ส", daysDesc = "อีก " + r.daysUntilNext + " วัน";
        if (r.urgency === "URGENT") {
          badgeClass = "badge-urgent";
          badgeTxt = "🔴 ถึงกำหนด / เลยรอบ";
          daysDesc = r.daysUntilNext === 0 ? "ครบกำหนดวันนี้!" : "เลยกำหนด " + Math.abs(r.daysUntilNext) + " วัน";
        } else if (r.urgency === "SOON") {
          badgeClass = "badge-soon";
          badgeTxt = "🟠 ใกล้หมด (1–2 วัน)";
        } else if (r.urgency === "INACTIVE") {
          badgeClass = "badge-inactive";
          badgeTxt = "⚪ หยุดสั่งนาน";
          daysDesc = "ไม่สั่ง " + r.daysSinceLast + " วัน";
        }

        tr.innerHTML =
          "<td><span class='badge " + badgeClass + "'>" + badgeTxt + "</span></td>" +
          "<td><b>" + r.storeName + "</b><br><span style='font-size:11px;color:#64748B'>" + r.confidence + "</span></td>" +
          "<td><b>" + daysDesc + "</b></td>" +
          "<td>" + r.nextOrderDateStr + "</td>" +
          "<td>" + r.lastOrderDateStr + " (" + r.daysSinceLast + " วันก่อน)</td>" +
          "<td>" + r.lastOrderItems + "</td>" +
          "<td>รอบนี้อยู่ได้ ~<b>" + r.seasonCycleDays + "</b> วัน <span style='color:#64748B;font-size:11px;'>(เฉลี่ยเดิม ~" + r.allTimeCycleDays + " วัน)</span></td>" +
          "<td><b>" + r.totalRevenue.toLocaleString() + " บ.</b><br><span style='font-size:11px;color:#64748B'>15กก.:" + r.totalG15 + " | 48กก.:" + r.totalG48 + " | กระป๋อง:" + r.totalCans + "</span></td>";
        tbody.appendChild(tr);
      }
    }

    function renderTodayTable(list) {
      var tbody = document.getElementById("todayTableBody");
      tbody.innerHTML = "";
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var items = [];
        if (b.g15 > 0) items.push("15กก.(" + b.g15 + ")");
        if (b.g48 > 0) items.push("48กก.(" + b.g48 + ")");
        if (b.cans > 0) items.push("กระป๋อง(" + b.cans + ")");
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><b>" + b.orderId + "</b></td>" +
          "<td>" + b.timeStr + "</td>" +
          "<td><b>" + b.store + "</b></td>" +
          "<td>" + (items.join(", ") || "-") + "</td>" +
          "<td><b>" + b.total.toLocaleString() + " บ.</b></td>" +
          "<td>" + b.payMethod + "</td>" +
          "<td>" + b.sender + "</td>";
        tbody.appendChild(tr);
      }
    }

    function renderPendingTable(list) {
      var tbody = document.getElementById("pendingTableBody");
      tbody.innerHTML = "";
      if (!list || list.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:20px;color:#16A34A;font-weight:600;'>✅ ไม่มีบิลรอโอนค้างชำระ</td></tr>";
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><b>" + p.orderId + "</b></td>" +
          "<td>" + p.dateStr + "</td>" +
          "<td><b>" + p.store + "</b></td>" +
          "<td><b style='color:#EA580C'>" + p.amount.toLocaleString() + " บ.</b></td>" +
          "<td>" + p.daysAging + " วัน</td>";
        tbody.appendChild(tr);
      }
    }

    document.getElementById("refreshBtn").addEventListener("click", function() {
      document.getElementById("lastUpdateTxt").textContent = "⏳ กำลังดึงข้อมูลสดจากชีท...";
      if (typeof google !== "undefined" && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.ok) {
              DASH_DATA = res;
              renderAllDashboard(res);
            }
          })
          .WEB_GetAdminDashboardData(true);
      } else {
        location.reload();
      }
    });

    document.getElementById("predSearch").addEventListener("input", renderPredictionTable);

    document.querySelectorAll(".pill").forEach(function(el) {
      el.addEventListener("click", function() {
        document.querySelectorAll(".pill").forEach(function(p){ p.classList.remove("active"); });
        el.classList.add("active");
        PRED_FILTER = el.getAttribute("data-filter") || "ALL";
        renderPredictionTable();
      });
    });

    document.querySelectorAll(".nav-item, .m-nav-btn").forEach(function(el) {
      el.addEventListener("click", function() {
        document.querySelectorAll(".nav-item, .m-nav-btn").forEach(function(n){ n.classList.remove("active"); });
        el.classList.add("active");
        var targetId = el.getAttribute("data-tab") || "secOverview";
        var sec = document.getElementById(targetId);
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    renderAllDashboard(DASH_DATA);
  </script>
</body>
</html>`;
}
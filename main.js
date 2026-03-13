const fs = require("fs");

// Helper: parse "hh:mm:ss am/pm" -> total seconds
function parseTimeToSeconds(timeStr) {
  timeStr = timeStr.trim().toLowerCase();
  const parts = timeStr.split(" ");
  const period = parts[1]; // am or pm
  const [hStr, mStr, sStr] = parts[0].split(":");
  let hours = parseInt(hStr);
  const minutes = parseInt(mStr);
  const seconds = parseInt(sStr);

  if (period === "am") {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

// Helper: parse "h:mm:ss" or "hhh:mm:ss" -> total seconds
function parseDurationToSeconds(durStr) {
  durStr = durStr.trim();
  const [hStr, mStr, sStr] = durStr.split(":");
  return parseInt(hStr) * 3600 + parseInt(mStr) * 60 + parseInt(sStr);
}

// Helper: total seconds -> "h:mm:ss"
function secondsToDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${h}:${mm}:${ss}`;
}

// ─────────────────────────────────────────────
// Function 1: getShiftDuration
// ─────────────────────────────────────────────
function getShiftDuration(startTime, endTime) {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);
  const diff = endSec - startSec;
  return secondsToDuration(diff);
}

// ─────────────────────────────────────────────
// Function 2: getIdleTime
// ─────────────────────────────────────────────
function getIdleTime(startTime, endTime) {
  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);

  const deliveryStart = 8 * 3600;  // 8:00 AM
  const deliveryEnd = 22 * 3600;   // 10:00 PM

  let idleBefore = 0;
  let idleAfter = 0;

  // idle before 8AM
  if (startSec < deliveryStart) {
    idleBefore = Math.min(deliveryStart, endSec) - startSec;
    if (idleBefore < 0) idleBefore = 0;
  }

  // idle after 10PM
  if (endSec > deliveryEnd) {
    idleAfter = endSec - Math.max(deliveryEnd, startSec);
    if (idleAfter < 0) idleAfter = 0;
  }

  return secondsToDuration(idleBefore + idleAfter);
}

// ─────────────────────────────────────────────
// Function 3: getActiveTime
// ─────────────────────────────────────────────
function getActiveTime(shiftDuration, idleTime) {
  const shiftSec = parseDurationToSeconds(shiftDuration);
  const idleSec = parseDurationToSeconds(idleTime);
  return secondsToDuration(shiftSec - idleSec);
}

// ─────────────────────────────────────────────
// Function 4: metQuota
// ─────────────────────────────────────────────
function metQuota(date, activeTime) {
  const [year, month, day] = date.split("-").map(Number);
  const activeSec = parseDurationToSeconds(activeTime);

  // Eid al-Fitr: April 10–30, 2025
  const isEid =
    year === 2025 &&
    month === 4 &&
    day >= 10 &&
    day <= 30;

  const quotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;
  return activeSec >= quotaSec;
}

// ─────────────────────────────────────────────
// Function 5: addShiftRecord
// ─────────────────────────────────────────────
function addShiftRecord(textFile, shiftObj) {
  const { driverID, driverName, date, startTime, endTime } = shiftObj;

  let content = fs.readFileSync(textFile, "utf8");
  let lines = content.split("\n").filter((l) => l.trim() !== "");

  // Check for duplicate driverID + date
  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID && cols[2].trim() === date) {
      return {};
    }
  }

  // Calculate derived fields
  const shiftDuration = getShiftDuration(startTime, endTime);
  const idleTime = getIdleTime(startTime, endTime);
  const activeTime = getActiveTime(shiftDuration, idleTime);
  const quota = metQuota(date, activeTime);
  const hasBonus = false;

  const newRecord = {
    driverID,
    driverName,
    date,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    shiftDuration,
    idleTime,
    activeTime,
    metQuota: quota,
    hasBonus,
  };

  const newLine = `${driverID},${driverName},${date},${startTime.trim()},${endTime.trim()},${shiftDuration},${idleTime},${activeTime},${quota},${hasBonus}`;

  // Insert after last record of same driverID, or append at end
  let lastIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols[0].trim() === driverID) {
      lastIndex = i;
    }
  }

  if (lastIndex === -1) {
    lines.push(newLine);
  } else {
    lines.splice(lastIndex + 1, 0, newLine);
  }

  fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
  return newRecord;
}

// ─────────────────────────────────────────────
// Function 6: setBonus
// ─────────────────────────────────────────────
function setBonus(textFile, driverID, date, newValue) {
  let content = fs.readFileSync(textFile, "utf8");
  let lines = content.split("\n").filter((l) => l.trim() !== "");

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols[0].trim() === driverID && cols[2].trim() === date) {
      cols[9] = String(newValue);
      lines[i] = cols.join(",");
      break;
    }
  }

  fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
}

// ─────────────────────────────────────────────
// Function 7: countBonusPerMonth
// ─────────────────────────────────────────────
function countBonusPerMonth(textFile, driverID, month) {
  const content = fs.readFileSync(textFile, "utf8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");

  const targetMonth = parseInt(month);
  let found = false;
  let count = 0;

  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      found = true;
      const recordMonth = parseInt(cols[2].trim().split("-")[1]);
      if (recordMonth === targetMonth && cols[9].trim() === "true") {
        count++;
      }
    }
  }

  return found ? count : -1;
}

// ─────────────────────────────────────────────
// Function 8: getTotalActiveHoursPerMonth
// ─────────────────────────────────────────────
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
  const content = fs.readFileSync(textFile, "utf8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");

  const targetMonth = parseInt(month);
  let totalSeconds = 0;

  for (const line of lines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      const recordMonth = parseInt(cols[2].trim().split("-")[1]);
      if (recordMonth === targetMonth) {
        totalSeconds += parseDurationToSeconds(cols[7].trim());
      }
    }
  }

  return secondsToDuration(totalSeconds);
}

// ─────────────────────────────────────────────
// Function 9: getRequiredHoursPerMonth
// ─────────────────────────────────────────────
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
  const shiftContent = fs.readFileSync(textFile, "utf8");
  const shiftLines = shiftContent.split("\n").filter((l) => l.trim() !== "");

  const rateContent = fs.readFileSync(rateFile, "utf8");
  const rateLines = rateContent.split("\n").filter((l) => l.trim() !== "");

  // Get driver's day off
  let dayOff = null;
  for (const line of rateLines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      dayOff = cols[1].trim().toLowerCase();
      break;
    }
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetMonth = parseInt(month);
  let totalSeconds = 0;

  for (const line of shiftLines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      const dateStr = cols[2].trim();
      const recordMonth = parseInt(dateStr.split("-")[1]);
      if (recordMonth !== targetMonth) continue;

      // Skip if this day is the driver's day off
      const dateObj = new Date(dateStr);
      const dayName = dayNames[dateObj.getDay()];
      if (dayOff && dayName === dayOff) continue;

      // Determine quota for this day
      const [year, mon, day] = dateStr.split("-").map(Number);
      const isEid = year === 2025 && mon === 4 && day >= 10 && day <= 30;
      const dailyQuotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;

      totalSeconds += dailyQuotaSec;
    }
  }

  // Reduce by 2 hours per bonus
  totalSeconds -= bonusCount * 2 * 3600;
  if (totalSeconds < 0) totalSeconds = 0;

  return secondsToDuration(totalSeconds);
}

// ─────────────────────────────────────────────
// Function 10: getNetPay
// ─────────────────────────────────────────────
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
  const rateContent = fs.readFileSync(rateFile, "utf8");
  const rateLines = rateContent.split("\n").filter((l) => l.trim() !== "");

  let basePay = 0;
  let tier = 0;

  for (const line of rateLines) {
    const cols = line.split(",");
    if (cols[0].trim() === driverID) {
      basePay = parseInt(cols[2].trim());
      tier = parseInt(cols[3].trim());
      break;
    }
  }

  const tierAllowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
  const allowedMissingHours = tierAllowance[tier] || 0;

  const actualSec = parseDurationToSeconds(actualHours);
  const requiredSec = parseDurationToSeconds(requiredHours);

  if (actualSec >= requiredSec) return basePay;

  const missingSec = requiredSec - actualSec;
  const missingHours = missingSec / 3600;

  const billableMissing = missingHours - allowedMissingHours;
  if (billableMissing <= 0) return basePay;

  const fullBillableHours = Math.floor(billableMissing);
  const deductionRatePerHour = Math.floor(basePay / 185);
  const salaryDeduction = fullBillableHours * deductionRatePerHour;

  return basePay - salaryDeduction;
}

module.exports = {
  getShiftDuration,
  getIdleTime,
  getActiveTime,
  metQuota,
  addShiftRecord,
  setBonus,
  countBonusPerMonth,
  getTotalActiveHoursPerMonth,
  getRequiredHoursPerMonth,
  getNetPay,
};
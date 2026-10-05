/**
 * Time and Date utilities for Traffic Tracker Dashboard.
 * Maps all timestamps strictly to America/New_York (EDT/EST).
 */

const TIMEZONE = 'America/New_York';

const dtfFull = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dtfDate = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dtfMonth = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
});

const dtfDayOfWeek = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  weekday: 'short',
});

const dtfTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => {
  const ampm = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
  return { hour: i, label: ampm, str: String(i).padStart(2, '0') + ':00' };
});

export const TIME_SLOTS_30MIN = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const hourOnlyLabel = hour24 === 0 ? '12 AM' : hour24 === 12 ? '12 PM' : `${hour12} ${ampm}`;
  const fullLabel = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
  const str = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { slotIndex: i, hour: hour24, minute, hourOnlyLabel, fullLabel, str };
});

/**
 * Parses an ISO UTC string or Date object and returns an object of EDT time parts.
 * @param {string|Date} dateInput
 * @returns {{
 *   dateObj: Date,
 *   edtDateStr: string, // YYYY-MM-DD
 *   edtMonthStr: string, // YYYY-MM
 *   edtYear: number,
 *   edtMonth: number, // 1-12
 *   edtDay: number, // 1-31
 *   edtHour: number, // 0-23
 *   edtMinute: number, // 0-59
 *   edtDayOfWeek: number, // 0 (Sun) - 6 (Sat)
 *   edtDayOfWeekName: string, // 'Mon', etc.
 *   edtTimeStr: string, // HH:mm
 *   edtFullStr: string // YYYY-MM-DD HH:mm:ss
 * }}
 */
export function parseToEDT(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date input: ${dateInput}`);
  }

  // Format parts in America/New_York
  const parts = dtfFull.formatToParts(date);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0; // standard 0-23
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  const dayOfWeekName = dtfDayOfWeek.format(date);
  const dayOfWeek = DAYS_OF_WEEK.indexOf(dayOfWeekName);

  const edtDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const edtMonthStr = `${year}-${String(month).padStart(2, '0')}`;
  const edtTimeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const edtFullStr = `${edtDateStr} ${edtTimeStr}:${String(second).padStart(2, '0')}`;

  return {
    dateObj: date,
    edtDateStr,
    edtMonthStr,
    edtYear: year,
    edtMonth: month,
    edtDay: day,
    edtHour: hour,
    edtMinute: minute,
    edtDayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0,
    edtDayOfWeekName: dayOfWeekName,
    edtTimeStr,
    edtFullStr,
  };
}

/**
 * Given a YYYY-MM-DD string in EDT, get the start and end of week (Sun-Sat) in YYYY-MM-DD.
 * @param {string} dateStr
 */
export function getWeekRangeEDT(dateStr) {
  // Create noon UTC date to avoid any DST day-shift during arithmetic
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay(); // 0 is Sun

  const sun = new Date(date);
  sun.setUTCDate(date.getUTCDate() - day);

  const sat = new Date(date);
  sat.setUTCDate(date.getUTCDate() + (6 - day));

  const format = (d) => {
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  return {
    startDate: format(sun),
    endDate: format(sat),
    days: Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(sun);
      cur.setUTCDate(sun.getUTCDate() + i);
      return format(cur);
    }),
  };
}

/**
 * Format minutes into a friendly string (e.g. 12.4 -> "12m 24s" or "12.4 min")
 */
export function formatMinutes(mins, detailed = false) {
  if (mins === null || mins === undefined || isNaN(mins)) return '--';
  if (!detailed) return `${Number(mins).toFixed(1)}m`;
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Format hour number (0-23) to 12-hour display with AM/PM
 */
export function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/**
 * Converts hour (0-23) and minute (0-59) to total minutes from midnight (0-1439).
 */
export function timeToMinutes(hour, minute = 0) {
  return hour * 60 + minute;
}

/**
 * Converts total minutes from midnight (0-1440) to friendly display (e.g. 720 -> "12:00 PM").
 */
export function minutesToTimeLabel(totalMins) {
  let m = totalMins % 1440;
  if (m < 0) m += 1440;
  const hour24 = Math.floor(m / 60);
  const minute = m % 60;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/**
 * Formats a 30-minute slot index (0-47) to a string (e.g. 0 -> "12:00 AM", 15 -> "7:30 AM").
 */
export function formatTimeSlot(slotIndex) {
  const hour24 = Math.floor(slotIndex / 2);
  const minute = (slotIndex % 2) * 30;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}



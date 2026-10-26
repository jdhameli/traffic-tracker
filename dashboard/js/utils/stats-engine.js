/**
 * Statistical calculations and travel time aggregation engine.
 * Focused exclusively on Travel Time (travel_time_min).
 */

import { parseToEDT, DAYS_OF_WEEK, getWeekRangeEDT, HOURS_OF_DAY, TIME_SLOTS_30MIN } from './time-utils.js';
import { getTravelTime } from './metric-utils.js';

/**
 * Calculates the mathematical median of an array of numbers.
 * @param {number[]} numbers
 * @returns {number|null}
 */
export function median(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

/**
 * Calculates the mean of an array of numbers.
 * @param {number[]} numbers
 * @returns {number|null}
 */
export function mean(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return Number((sum / numbers.length).toFixed(2));
}

/**
 * Calculates a percentile (0 to 100) of an array of numbers.
 */
export function percentile(numbers, p) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
}

/**
 * Creates a cell data object that supports both named property access for Observable Plot
 * and array-style numeric indexing / iterable destructuring for backward compatibility.
 */
function createHeatmapCell({
  slot,
  day,
  dayLabel,
  dateStr = '',
  displayVal,
  count,
  medVal,
  avgVal,
  maxVal = null,
  minVal = null,
  isWeekend = false,
}) {
  // Array format: [slot, day, displayVal, count, medVal, avgVal, maxVal, dateStr]
  const cell = [slot, day, displayVal, count, medVal, avgVal, maxVal, dateStr];
  cell.slot = slot;
  cell.day = day;
  cell.dayLabel = dayLabel;
  cell.dateStr = dateStr;
  cell.value = displayVal;
  cell.count = count;
  cell.median = medVal;
  cell.mean = avgVal;
  cell.max = maxVal;
  cell.min = minVal;
  cell.isWeekend = isWeekend;
  return cell;
}

/**
 * Aggregates records into 30-Minute Time Slots x Day of Week for Travel Time.
 * Supports week filtering and all-time median aggregation.
 *
 * @param {Array<Object>} records - Raw parsed CSV records with EDT metadata
 * @param {string|Object} [metricKeyOrOptions] - Options or metricKey compatibility
 * @param {Object} [maybeOptions] - Optional settings { weekDays?: string[], useMedian?: boolean }
 * @returns {Array<Object>}
 */
export function buildHeatmapMatrix(records, metricKeyOrOptions = {}, maybeOptions = {}) {
  const options =
    typeof metricKeyOrOptions === 'object' && metricKeyOrOptions !== null
      ? metricKeyOrOptions
      : maybeOptions || {};

  const { weekDays = null, useMedian = false } = options;

  let targetRecords = records || [];
  const dateToIndexMap = new Map();
  if (weekDays && weekDays.length > 0 && !useMedian) {
    weekDays.forEach((dStr, idx) => dateToIndexMap.set(dStr, idx));
    const weekSet = new Set(weekDays);
    targetRecords = targetRecords.filter((r) => r.edt && weekSet.has(r.edt.edtDateStr));
  }

  // 7 days x 48 30-min slots (0-47)
  const buckets = Array.from({ length: 7 }, () =>
    Array.from({ length: 48 }, () => ({
      values: [],
    }))
  );

  for (const r of targetRecords) {
    if (r.status !== 'OK' || !r.edt) continue;
    let day = -1;
    if (dateToIndexMap.size > 0) {
      day = dateToIndexMap.has(r.edt.edtDateStr) ? dateToIndexMap.get(r.edt.edtDateStr) : -1;
    } else {
      day = r.edt.edtDayOfWeek;
    }
    const slot = r.edt.edtHour * 2 + (r.edt.edtMinute >= 30 ? 1 : 0);
    if (day >= 0 && day < 7 && slot >= 0 && slot < 48) {
      const val = getTravelTime(r);
      buckets[day][slot].values.push(val);
    }
  }

  const result = [];
  for (let d = 0; d < 7; d++) {
    const dayName = DAYS_OF_WEEK[d];
    const dateStr = weekDays && weekDays[d] ? weekDays[d] : '';
    const dayLabel = useMedian
      ? dayName
      : dateStr
      ? `${dayName} ${dateStr.substring(5)}`
      : dayName;

    for (let s = 0; s < 48; s++) {
      const b = buckets[d][s];
      const count = b.values.length;
      const avgVal = count > 0 ? mean(b.values) : null;
      const medVal = count > 0 ? median(b.values) : null;
      const maxVal = count > 0 ? Number(Math.max(...b.values).toFixed(2)) : null;
      const minVal = count > 0 ? Number(Math.min(...b.values).toFixed(2)) : null;
      const displayVal = count > 0 ? (useMedian ? medVal : avgVal) : null;

      result.push(
        createHeatmapCell({
          slot: s,
          day: d,
          dayLabel,
          dateStr,
          displayVal: count > 0 ? displayVal : 0,
          count,
          medVal: medVal || 0,
          avgVal: avgVal || 0,
          maxVal,
          minVal,
          isWeekend: d === 0 || d === 6,
        })
      );
    }
  }

  return result;
}

/**
 * Computes Daily View data for Travel Time:
 * - Actual records on targetDate
 * - Historical median baseline across prior days for each hour
 */
export function computeDailyViewData(records, targetDate) {
  const dayRecords = [];
  const priorRecords = [];

  for (const r of records || []) {
    if (r.status !== 'OK' || !r.edt) continue;
    if (r.edt.edtDateStr === targetDate) {
      dayRecords.push(r);
    } else if (r.edt.edtDateStr < targetDate) {
      priorRecords.push(r);
    }
  }

  // Sort day records chronologically
  dayRecords.sort((a, b) => a.edt.dateObj - b.edt.dateObj);

  // Compute historical median for each hour from prior records
  const hourBuckets = Array.from({ length: 24 }, () => ({
    values: [],
  }));

  for (const r of priorRecords) {
    const h = r.edt.edtHour;
    if (h >= 0 && h < 24) {
      hourBuckets[h].values.push(getTravelTime(r));
    }
  }

  const hourlyMedianBaseline = hourBuckets.map((b, hour) => {
    return {
      hour,
      medianValue: b.values.length > 0 ? median(b.values) : null,
      sampleCount: b.values.length,
    };
  });

  return {
    targetDate,
    dayRecords,
    hourlyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey: 'travel_time_min',
  };
}

/**
 * Computes Weekly View summary data for Travel Time.
 */
export function computeWeeklyViewData(records, targetDateInWeek) {
  const { startDate, endDate, days } = getWeekRangeEDT(targetDateInWeek);
  const weekRecords = [];
  const priorRecords = [];

  for (const r of records || []) {
    if (r.status !== 'OK' || !r.edt) continue;
    const dStr = r.edt.edtDateStr;
    if (dStr >= startDate && dStr <= endDate) {
      weekRecords.push(r);
    } else if (dStr < startDate) {
      priorRecords.push(r);
    }
  }

  const weekDaysData = days.map((dateStr, dayIdx) => {
    const dayRecs = weekRecords.filter((r) => r.edt.edtDateStr === dateStr);
    const vals = dayRecs.map((r) => getTravelTime(r));

    return {
      dateStr,
      dayOfWeekIndex: dayIdx,
      dayName: DAYS_OF_WEEK[dayIdx],
      count: dayRecs.length,
      avgValue: vals.length > 0 ? mean(vals) : null,
      medianValue: vals.length > 0 ? median(vals) : null,
      maxValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
      minValue: vals.length > 0 ? Number(Math.min(...vals).toFixed(2)) : null,
      records: dayRecs,
    };
  });

  const priorDayBuckets = Array.from({ length: 7 }, () => ({ values: [] }));
  for (const r of priorRecords) {
    priorDayBuckets[r.edt.edtDayOfWeek].values.push(getTravelTime(r));
  }

  const weeklyMedianBaseline = priorDayBuckets.map((b, dayIdx) => ({
    dayOfWeekIndex: dayIdx,
    dayName: DAYS_OF_WEEK[dayIdx],
    medianValue: b.values.length > 0 ? median(b.values) : null,
    sampleCount: b.values.length,
  }));

  return {
    startDate,
    endDate,
    days,
    weekDaysData,
    weekRecords,
    weeklyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey: 'travel_time_min',
  };
}

/**
 * Computes Monthly View summary data for Travel Time.
 */
export function computeMonthlyViewData(records, targetMonth) {
  const monthRecords = [];
  const priorRecords = [];

  for (const r of records || []) {
    if (r.status !== 'OK' || !r.edt) continue;
    if (r.edt.edtMonthStr === targetMonth) {
      monthRecords.push(r);
    } else if (r.edt.edtMonthStr < targetMonth) {
      priorRecords.push(r);
    }
  }

  const [y, m] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const daysData = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${targetMonth}-${String(day).padStart(2, '0')}`;
    const dayRecs = monthRecords.filter((r) => r.edt.edtDateStr === dayStr);
    const vals = dayRecs.map((r) => getTravelTime(r));

    daysData.push({
      day,
      dateStr: dayStr,
      count: dayRecs.length,
      avgValue: vals.length > 0 ? mean(vals) : null,
      medianValue: vals.length > 0 ? median(vals) : null,
      maxValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
      minValue: vals.length > 0 ? Number(Math.min(...vals).toFixed(2)) : null,
    });
  }

  const priorVals = priorRecords.map((r) => getTravelTime(r));
  const monthlyMedianBaseline = {
    medianValue: priorVals.length > 0 ? median(priorVals) : null,
    sampleCount: priorRecords.length,
  };

  return {
    targetMonth,
    daysInMonth,
    daysData,
    monthRecords,
    monthlyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey: 'travel_time_min',
  };
}

/**
 * Aggregates records for a month into Day x 30-min Interval Matrix & Calendar format.
 */
export function buildMonthlyHeatmapMatrix(records, targetMonth, metricKeyOrOptions = {}, maybeOptions = {}) {
  const options =
    typeof metricKeyOrOptions === 'object' && metricKeyOrOptions !== null
      ? metricKeyOrOptions
      : maybeOptions || {};

  const { useMedian = false, numDays = 28, allTime = false } = options;

  let daysList = [];
  let isFixedCalendarMonth = false;
  let targetLabel = '';

  if (allTime) {
    for (let d = 1; d <= 31; d++) {
      daysList.push(`Day ${String(d).padStart(2, '0')}`);
    }
    targetLabel = 'All-Time Historical Median (Days 1–31)';
  } else if (Array.isArray(targetMonth)) {
    daysList = targetMonth;
  } else if (typeof targetMonth === 'string') {
    if (targetMonth.length === 7) {
      isFixedCalendarMonth = true;
      const [y, m] = targetMonth.split('-').map(Number);
      const totalDays = new Date(y, m, 0).getDate();
      for (let d = 1; d <= totalDays; d++) {
        daysList.push(`${targetMonth}-${String(d).padStart(2, '0')}`);
      }
      const mObj = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
      targetLabel = mObj.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } else {
      const [y, m, d] = targetMonth.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      for (let i = 0; i < numDays; i++) {
        const cur = new Date(start);
        cur.setUTCDate(start.getUTCDate() + i);
        const yr = cur.getUTCFullYear();
        const mo = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const da = String(cur.getUTCDate()).padStart(2, '0');
        daysList.push(`${yr}-${mo}-${da}`);
      }
      targetLabel = `${daysList[0]} to ${daysList[daysList.length - 1]}`;
    }
  }

  const daysInMonth = daysList.length;
  let monthRecords = [];
  const dateToIndexMap = new Map();

  if (allTime) {
    monthRecords = (records || []).filter((r) => r.status === 'OK' && r.edt);
  } else {
    daysList.forEach((dStr, idx) => dateToIndexMap.set(dStr, idx));
    monthRecords = (records || []).filter(
      (r) => r.status === 'OK' && r.edt && dateToIndexMap.has(r.edt.edtDateStr)
    );
  }

  const buckets = Array.from({ length: daysInMonth }, () =>
    Array.from({ length: 48 }, () => ({
      values: [],
    }))
  );

  for (const r of monthRecords) {
    const dayIdx = allTime ? (r.edt.edtDay - 1) : dateToIndexMap.get(r.edt.edtDateStr);
    const slot = r.edt.edtHour * 2 + (r.edt.edtMinute >= 30 ? 1 : 0);
    if (dayIdx !== undefined && dayIdx >= 0 && dayIdx < daysInMonth && slot >= 0 && slot < 48) {
      buckets[dayIdx][slot].values.push(getTravelTime(r));
    }
  }

  const calendarDays = [];
  const matrixData = [];
  const dayLabels = [];
  const weekendDayIndices = new Set();

  for (let idx = 0; idx < daysInMonth; idx++) {
    let dateStr = '';
    let d = idx + 1;
    let label = '';
    let dayOfWeek = 0;
    let dayOfWeekName = '';
    let isWeekend = false;

    if (allTime) {
      dateStr = `Day ${String(d).padStart(2, '0')}`;
      label = `Day ${String(d).padStart(2, '0')}`;
      dayOfWeek = (idx % 7);
      dayOfWeekName = DAYS_OF_WEEK[dayOfWeek];
    } else {
      dateStr = daysList[idx];
      const [y, m, dayNum] = dateStr.split('-').map(Number);
      d = dayNum;
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      dayOfWeek = dateObj.getUTCDay();
      dayOfWeekName = DAYS_OF_WEEK[dayOfWeek];
      isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        weekendDayIndices.add(idx);
      }

      label = isFixedCalendarMonth
        ? `${d} ${dayOfWeekName}${isWeekend ? ' •' : ''}`
        : `${dayOfWeekName} ${dateStr.substring(5)}${isWeekend ? ' •' : ''}`;
    }
    dayLabels.push(label);

    const allDayValues = [];
    let dayPeakVal = 0;
    let dayPeakSlot = null;

    for (let s = 0; s < 48; s++) {
      const b = buckets[idx][s];
      const count = b.values.length;
      if (count > 0) {
        const avgVal = mean(b.values);
        const medVal = median(b.values);
        const maxVal = Number(Math.max(...b.values).toFixed(2));
        const minVal = Number(Math.min(...b.values).toFixed(2));
        const displayVal = allTime || useMedian ? medVal : avgVal;

        matrixData.push(
          createHeatmapCell({
            slot: s,
            day: idx,
            dayLabel: label,
            dateStr,
            displayVal,
            count,
            medVal,
            avgVal,
            maxVal,
            minVal,
            isWeekend,
          })
        );
        allDayValues.push(...b.values);

        if (maxVal > dayPeakVal) {
          dayPeakVal = maxVal;
          dayPeakSlot = s;
        }
      } else {
        matrixData.push(
          createHeatmapCell({
            slot: s,
            day: idx,
            dayLabel: label,
            dateStr,
            displayVal: null,
            count: 0,
            medVal: null,
            avgVal: null,
            maxVal: null,
            minVal: null,
            isWeekend,
          })
        );
      }
    }

    const dayCount = allDayValues.length;
    const calDateStr = allTime ? `2026-10-${String(d).padStart(2, '0')}` : dateStr;
    calendarDays.push({
      day: d,
      dateStr: calDateStr,
      displayDate: dateStr,
      dayOfWeek,
      dayOfWeekName,
      isWeekend,
      count: dayCount,
      avgValue: dayCount > 0 ? mean(allDayValues) : null,
      medianValue: dayCount > 0 ? median(allDayValues) : null,
      maxValue: dayCount > 0 ? Number(Math.max(...allDayValues).toFixed(2)) : null,
      minValue: dayCount > 0 ? Number(Math.min(...allDayValues).toFixed(2)) : null,
      peakSlot: dayPeakSlot,
      peakHour: dayPeakSlot !== null ? Math.floor(dayPeakSlot / 2) : null,
      weekRow: Math.floor(idx / 7),
    });
  }

  const allMonthValues = monthRecords.map((r) => getTravelTime(r));
  const validDays = calendarDays.filter((d) => d.count > 0);
  let worstDay = null;
  let bestDay = null;
  if (validDays.length > 0) {
    worstDay = [...validDays].sort((a, b) => (b.avgValue || 0) - (a.avgValue || 0))[0];
    bestDay = [...validDays].sort((a, b) => (a.avgValue || 0) - (b.avgValue || 0))[0];
  }

  const monthlyStats = {
    totalObservations: monthRecords.length,
    activeDaysCount: validDays.length,
    daysInMonth,
    avgValue: allMonthValues.length > 0 ? mean(allMonthValues) : null,
    medianValue: allMonthValues.length > 0 ? median(allMonthValues) : null,
    maxValue: allMonthValues.length > 0 ? Number(Math.max(...allMonthValues).toFixed(2)) : null,
    minValue: allMonthValues.length > 0 ? Number(Math.min(...allMonthValues).toFixed(2)) : null,
    worstDay,
    bestDay,
  };

  return {
    targetMonth,
    startDate: allTime ? '2026-10-01' : daysList[0],
    endDate: allTime ? '2026-10-31' : daysList[daysList.length - 1],
    targetLabel,
    daysInMonth,
    dayLabels,
    weekendDayIndices,
    slotLabels: TIME_SLOTS_30MIN.map((s) => s.fullLabel),
    matrixData,
    calendarDays,
    monthlyStats,
    metricKey: 'travel_time_min',
  };
}

/**
 * Aggregates records for a specified year or 12-month period.
 */
export function buildYearlyCalendarData(records, targetYear, metricKeyOrOptions = {}, maybeOptions = {}) {
  const options =
    typeof metricKeyOrOptions === 'object' && metricKeyOrOptions !== null
      ? metricKeyOrOptions
      : maybeOptions || {};

  const { metricAggregation = 'avg', allTime = false } = options;
  const yearStr = String(targetYear || '2026');

  let yearRecords = [];
  const monthsList = [];
  let startDate = '';
  let endDate = '';
  let targetLabel = '';

  if (allTime) {
    yearRecords = (records || []).filter((r) => r.status === 'OK' && r.edt);
    targetLabel = 'All-Time Historical (Jan–Dec)';
    for (let m = 1; m <= 12; m++) {
      const mDate = new Date(Date.UTC(2026, m - 1, 1, 12, 0, 0));
      const mName = mDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      monthsList.push({ monthStr: String(m).padStart(2, '0'), monthName: mName, monthIndex: m - 1 });
    }
    if (yearRecords.length > 0) {
      const sortedYears = [...new Set(yearRecords.map((r) => r.edt.edtYear))].sort((a, b) => a - b);
      startDate = `${sortedYears[0]}-01-01`;
      endDate = `${sortedYears[sortedYears.length - 1]}-12-31`;
    } else {
      startDate = '2026-01-01';
      endDate = '2026-12-31';
    }
  } else if (yearStr.length === 4) {
    const yr = parseInt(yearStr, 10);
    yearRecords = (records || []).filter((r) => r.status === 'OK' && r.edt && r.edt.edtYear === yr);
    for (let m = 1; m <= 12; m++) {
      const mStr = `${yearStr}-${String(m).padStart(2, '0')}`;
      const mDate = new Date(Date.UTC(yr, m - 1, 1, 12, 0, 0));
      const mName = mDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      monthsList.push({ monthStr: mStr, monthName: mName, monthIndex: m - 1 });
    }
    startDate = `${yearStr}-01-01`;
    endDate = `${yearStr}-12-31`;
    targetLabel = yearStr;
  } else {
    const [y, m] = yearStr.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(Date.UTC(y, m - 1 - i, 1, 12, 0, 0));
      const yr = dt.getUTCFullYear();
      const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const mStr = `${yr}-${mo}`;
      const mName = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      monthsList.push({ monthStr: mStr, monthName: `${mName} '${String(yr).slice(-2)}`, monthIndex: 11 - i });
    }
    const monthSet = new Set(monthsList.map((item) => item.monthStr));
    yearRecords = (records || []).filter(
      (r) => r.status === 'OK' && r.edt && monthSet.has(r.edt.edtMonthStr)
    );
    startDate = `${monthsList[0].monthStr}-01`;
    const lastM = monthsList[11].monthStr;
    const [ly, lm] = lastM.split('-').map(Number);
    const lastDays = new Date(ly, lm, 0).getDate();
    endDate = `${lastM}-${String(lastDays).padStart(2, '0')}`;
    targetLabel = `${monthsList[0].monthName} – ${monthsList[11].monthName}`;
  }

  // Group by date (YYYY-MM-DD)
  const dateMap = new Map();
  for (const r of yearRecords) {
    const dStr = r.edt.edtDateStr;
    if (!dateMap.has(dStr)) {
      dateMap.set(dStr, []);
    }
    dateMap.get(dStr).push(r);
  }

  const calendarData = [];
  for (const [dateStr, recs] of dateMap.entries()) {
    const values = recs.map((r) => getTravelTime(r));
    const avgVal = mean(values);
    const medVal = median(values);
    const peakVal = Number(Math.max(...values).toFixed(2));
    const minVal = Number(Math.min(...values).toFixed(2));

    let peakHour = null;
    let maxHourVal = -Infinity;
    for (const r of recs) {
      const v = getTravelTime(r);
      if (v > maxHourVal) {
        maxHourVal = v;
        peakHour = r.edt.edtHour;
      }
    }

    const displayVal = metricAggregation === 'peak' ? peakVal : (allTime ? medVal : avgVal);

    // Array format: [dateStr, displayVal, count, peakVal, peakHour, avgVal, medVal]
    const cell = [dateStr, displayVal, recs.length, peakVal, peakHour, avgVal, medVal];
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    cell.dateStr = dateStr;
    cell.date = dateObj;
    cell.value = displayVal;
    cell.count = recs.length;
    cell.peakValue = peakVal;
    cell.peakHour = peakHour;
    cell.mean = avgVal;
    cell.median = medVal;
    cell.min = minVal;
    cell.max = peakVal;
    cell.dayOfWeek = dateObj.getUTCDay();
    cell.month = dateObj.getUTCMonth();
    calendarData.push(cell);
  }

  // 12 Months x 24 Hours Seasonal Matrix
  const monthHourBuckets = Array.from({ length: 12 }, () =>
    Array.from({ length: 24 }, () => ({
      values: [],
    }))
  );

  const monthStrToRowMap = new Map();
  monthsList.forEach((item, rowIdx) => monthStrToRowMap.set(item.monthStr, rowIdx));

  for (const r of yearRecords) {
    const rowIdx = allTime ? (r.edt.edtMonth - 1) : monthStrToRowMap.get(r.edt.edtMonthStr);
    const hIdx = r.edt.edtHour;
    if (rowIdx !== undefined && rowIdx >= 0 && rowIdx < 12 && hIdx >= 0 && hIdx < 24) {
      monthHourBuckets[rowIdx][hIdx].values.push(getTravelTime(r));
    }
  }

  const monthHourMatrix = [];
  for (let m = 0; m < 12; m++) {
    const monthName = monthsList[m]?.monthName || '';
    const monthStr = monthsList[m]?.monthStr || '';

    for (let h = 0; h < 24; h++) {
      const b = monthHourBuckets[m][h];
      const count = b.values.length;
      if (count > 0) {
        const avgVal = mean(b.values);
        const medVal = median(b.values);
        const maxVal = Number(Math.max(...b.values).toFixed(2));
        const minVal = Number(Math.min(...b.values).toFixed(2));
        const displayVal = metricAggregation === 'peak' ? maxVal : (allTime ? medVal : avgVal);

        const cell = [h, m, displayVal, count, medVal, avgVal, maxVal];
        cell.hour = h;
        cell.monthIdx = m;
        cell.monthName = monthName;
        cell.monthStr = monthStr;
        cell.value = displayVal;
        cell.count = count;
        cell.median = medVal;
        cell.mean = avgVal;
        cell.max = maxVal;
        cell.min = minVal;
        monthHourMatrix.push(cell);
      } else {
        const cell = [h, m, -1, 0, null, null, null];
        cell.hour = h;
        cell.monthIdx = m;
        cell.monthName = monthName;
        cell.monthStr = monthStr;
        cell.value = null;
        cell.count = 0;
        cell.median = null;
        cell.mean = null;
        cell.max = null;
        cell.min = null;
        monthHourMatrix.push(cell);
      }
    }
  }

  const monthSummary = monthsList.map((item, idx) => {
    const mRecs = allTime
      ? yearRecords.filter((r) => r.edt.edtMonth === idx + 1)
      : yearRecords.filter((r) => r.edt.edtMonthStr === item.monthStr);
    const vals = mRecs.map((r) => getTravelTime(r));
    return {
      monthIndex: idx,
      monthStr: item.monthStr,
      monthName: item.monthName,
      count: mRecs.length,
      avgValue: vals.length > 0 ? mean(vals) : null,
      peakValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
      minValue: vals.length > 0 ? Number(Math.min(...vals).toFixed(2)) : null,
    };
  });

  const allYearValues = yearRecords.map((r) => getTravelTime(r));
  let worstDate = null;
  if (calendarData.length > 0) {
    const sorted = [...calendarData].sort((a, b) => b[1] - a[1]);
    worstDate = {
      dateStr: sorted[0][0],
      displayVal: sorted[0][1],
      count: sorted[0][2],
      peakVal: sorted[0][3],
    };
  }

  const yearlyStats = {
    totalObservations: yearRecords.length,
    recordedDaysCount: dateMap.size,
    avgValue: allYearValues.length > 0 ? mean(allYearValues) : null,
    medianValue: allYearValues.length > 0 ? median(allYearValues) : null,
    peakValue: allYearValues.length > 0 ? Number(Math.max(...allYearValues).toFixed(2)) : null,
    worstDate,
  };

  return {
    targetYear: yearStr,
    startDate,
    endDate,
    targetLabel,
    calendarData,
    monthHourMatrix,
    monthSummary,
    yearlyStats,
    metricKey: 'travel_time_min',
    metricAggregation,
  };
}

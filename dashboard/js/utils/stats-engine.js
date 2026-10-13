/**
 * Statistical calculations and median baseline computation engine.
 * Supports configurable metrics (traffic_delay_min, travel_time_min, baseline_time_min, distance_mi).
 */

import { parseToEDT, DAYS_OF_WEEK, getWeekRangeEDT, HOURS_OF_DAY, TIME_SLOTS_30MIN } from './time-utils.js';
import { getMetricValue } from './metric-utils.js';

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
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates the mean of an array of numbers.
 * @param {number[]} numbers
 * @returns {number|null}
 */
export function mean(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return sum / numbers.length;
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
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Aggregates records into a 7x48 Heatmap Matrix (Day of Week vs 30-Minute Time Slot EDT) for any selected metric.
 * Supports week filtering and all-time median aggregation.
 * @param {Array<Object>} records - Raw parsed CSV records with EDT metadata
 * @param {string} metricKey - e.g. 'travel_time_min', 'traffic_delay_min', 'baseline_time_min', 'distance_mi'
 * @param {Object} [options] - Optional settings { weekDays?: string[], useMedian?: boolean }
 * @returns {Array<[number, number, number, number, number, number]>} - [slotIndex, dayOfWeekIndex, displayVal, count, medianVal, avgVal]
 */
export function buildHeatmapMatrix(records, metricKey = 'travel_time_min', options = {}) {
  const { weekDays = null, useMedian = false } = options;

  let targetRecords = records;
  const dateToIndexMap = new Map();
  if (weekDays && weekDays.length > 0 && !useMedian) {
    weekDays.forEach((dStr, idx) => dateToIndexMap.set(dStr, idx));
    const weekSet = new Set(weekDays);
    targetRecords = records.filter((r) => weekSet.has(r.edt.edtDateStr));
  }

  // 7 days x 48 30-min slots (0-47)
  const buckets = Array.from({ length: 7 }, () =>
    Array.from({ length: 48 }, () => ({
      values: [],
    }))
  );

  for (const r of targetRecords) {
    if (r.status !== 'OK') continue;
    let day = -1;
    if (dateToIndexMap.size > 0) {
      day = dateToIndexMap.has(r.edt.edtDateStr) ? dateToIndexMap.get(r.edt.edtDateStr) : -1;
    } else {
      day = r.edt.edtDayOfWeek;
    }
    const slot = r.edt.edtHour * 2 + (r.edt.edtMinute >= 30 ? 1 : 0);
    if (day >= 0 && day < 7 && slot >= 0 && slot < 48) {
      const val = getMetricValue(r, metricKey);
      buckets[day][slot].values.push(val);
    }
  }

  const result = [];
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < 48; s++) {
      const b = buckets[d][s];
      const count = b.values.length;
      const avgVal = count > 0 ? Number(mean(b.values).toFixed(2)) : 0;
      const medVal = count > 0 ? Number(median(b.values).toFixed(2)) : 0;
      const displayVal = useMedian ? medVal : avgVal;
      // [xIndex (slotIndex), yIndex (day), displayVal, count, medVal, avgVal]
      result.push([s, d, displayVal, count, medVal, avgVal]);
    }
  }

  return result;
}

/**
 * Computes the Daily View data for the configured metric:
 * - Actual records on targetDate
 * - Historical median baseline across prior days for each hour
 * @param {Array<Object>} records
 * @param {string} targetDate - 'YYYY-MM-DD' in EDT
 * @param {string} metricKey
 */
export function computeDailyViewData(records, targetDate, metricKey = 'traffic_delay_min') {
  const dayRecords = [];
  const priorRecords = [];

  for (const r of records) {
    if (r.status !== 'OK') continue;
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
    const val = getMetricValue(r, metricKey);
    hourBuckets[h].values.push(val);
  }

  const hourlyMedianBaseline = hourBuckets.map((b, hour) => {
    return {
      hour,
      medianValue: b.values.length > 0 ? Number(median(b.values).toFixed(2)) : null,
      sampleCount: b.values.length,
    };
  });

  return {
    targetDate,
    dayRecords,
    hourlyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey,
  };
}

/**
 * Computes the Weekly View data for the configured metric:
 * - 7 days of the target week (binned by day-of-week)
 * - Historical weekly median profile computed from weeks prior to this week
 * @param {Array<Object>} records
 * @param {string} targetDateInWeek - any date in target week (YYYY-MM-DD)
 * @param {string} metricKey
 */
export function computeWeeklyViewData(records, targetDateInWeek, metricKey = 'traffic_delay_min') {
  const { startDate, endDate, days } = getWeekRangeEDT(targetDateInWeek);

  const weekRecords = [];
  const priorRecords = [];

  for (const r of records) {
    if (r.status !== 'OK') continue;
    const dStr = r.edt.edtDateStr;
    if (dStr >= startDate && dStr <= endDate) {
      weekRecords.push(r);
    } else if (dStr < startDate) {
      priorRecords.push(r);
    }
  }

  // Group week records by day-of-week
  const weekDaysData = days.map((dateStr, dayIdx) => {
    const dayRecs = weekRecords.filter((r) => r.edt.edtDateStr === dateStr);
    const vals = dayRecs.map((r) => getMetricValue(r, metricKey));

    return {
      dateStr,
      dayOfWeekIndex: dayIdx,
      dayName: DAYS_OF_WEEK[dayIdx],
      count: dayRecs.length,
      avgValue: vals.length > 0 ? Number(mean(vals).toFixed(2)) : null,
      medianValue: vals.length > 0 ? Number(median(vals).toFixed(2)) : null,
      maxValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
      records: dayRecs,
    };
  });

  // Historical baseline for each day of week (0 to 6)
  const priorDayBuckets = Array.from({ length: 7 }, () => ({
    values: [],
  }));

  for (const r of priorRecords) {
    const d = r.edt.edtDayOfWeek;
    const val = getMetricValue(r, metricKey);
    priorDayBuckets[d].values.push(val);
  }

  const weeklyMedianBaseline = priorDayBuckets.map((b, dayIdx) => {
    return {
      dayOfWeekIndex: dayIdx,
      dayName: DAYS_OF_WEEK[dayIdx],
      medianValue: b.values.length > 0 ? Number(median(b.values).toFixed(2)) : null,
      sampleCount: b.values.length,
    };
  });

  return {
    startDate,
    endDate,
    days,
    weekDaysData,
    weekRecords,
    weeklyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey,
  };
}

/**
 * Computes Monthly View data for the configured metric:
 * - Daily aggregates across targetMonth (YYYY-MM)
 * - Historical monthly baseline computed from prior months
 * @param {Array<Object>} records
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {string} metricKey
 */
export function computeMonthlyViewData(records, targetMonth, metricKey = 'traffic_delay_min') {
  const monthRecords = [];
  const priorRecords = [];

  for (const r of records) {
    if (r.status !== 'OK') continue;
    if (r.edt.edtMonthStr === targetMonth) {
      monthRecords.push(r);
    } else if (r.edt.edtMonthStr < targetMonth) {
      priorRecords.push(r);
    }
  }

  // Get number of days in target month
  const [y, m] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const daysData = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${targetMonth}-${String(day).padStart(2, '0')}`;
    const dayRecs = monthRecords.filter((r) => r.edt.edtDateStr === dayStr);
    const vals = dayRecs.map((r) => getMetricValue(r, metricKey));

    daysData.push({
      day,
      dateStr: dayStr,
      count: dayRecs.length,
      avgValue: vals.length > 0 ? Number(mean(vals).toFixed(2)) : null,
      medianValue: vals.length > 0 ? Number(median(vals).toFixed(2)) : null,
      maxValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
    });
  }

  // Historical monthly baseline: median of chosen metric computed from prior records
  const priorVals = priorRecords.map((r) => getMetricValue(r, metricKey));

  const monthlyMedianBaseline = {
    medianValue: priorVals.length > 0 ? Number(median(priorVals).toFixed(2)) : null,
    sampleCount: priorRecords.length,
  };

  return {
    targetMonth,
    daysInMonth,
    daysData,
    monthRecords,
    monthlyMedianBaseline,
    hasPriorData: priorRecords.length > 0,
    metricKey,
  };
}

/**
 * Aggregates records for a specified month (YYYY-MM) into a Day of Month (1-31) x 30-min Interval (0-47) Matrix.
 * Also computes daily summaries, peak hours, and monthly stats.
 *
 * @param {Array<Object>} records - Raw parsed CSV records with EDT metadata
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {string} metricKey - e.g. 'travel_time_min', 'traffic_delay_min'
 * @param {Object} [options] - Optional settings { useMedian?: boolean }
 * @returns {Object}
 */
export function buildMonthlyHeatmapMatrix(records, targetMonth, metricKey = 'travel_time_min', options = {}) {
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
      // Calendar month 'YYYY-MM'
      isFixedCalendarMonth = true;
      const [y, m] = targetMonth.split('-').map(Number);
      const totalDays = new Date(y, m, 0).getDate();
      for (let d = 1; d <= totalDays; d++) {
        daysList.push(`${targetMonth}-${String(d).padStart(2, '0')}`);
      }
      const mObj = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
      targetLabel = mObj.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } else {
      // Date string 'YYYY-MM-DD' representing start of 28-day (4-week) window
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

  // Initialize day x 30-min slot buckets: daysInMonth rows x 48 columns
  const buckets = Array.from({ length: daysInMonth }, () =>
    Array.from({ length: 48 }, () => ({
      values: [],
      records: [],
    }))
  );

  for (const r of monthRecords) {
    const dayIdx = allTime ? (r.edt.edtDay - 1) : dateToIndexMap.get(r.edt.edtDateStr);
    const slot = r.edt.edtHour * 2 + (r.edt.edtMinute >= 30 ? 1 : 0);
    if (dayIdx !== undefined && dayIdx >= 0 && dayIdx < daysInMonth && slot >= 0 && slot < 48) {
      const val = getMetricValue(r, metricKey);
      buckets[dayIdx][slot].values.push(val);
      buckets[dayIdx][slot].records.push(r);
    }
  }

  // Days list & metadata
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
        const avgVal = Number(mean(b.values).toFixed(2));
        const medVal = Number(median(b.values).toFixed(2));
        const maxVal = Number(Math.max(...b.values).toFixed(2));
        const displayVal = (allTime || useMedian) ? medVal : avgVal;

        matrixData.push([s, idx, displayVal, count, medVal, avgVal, maxVal, dateStr]);
        allDayValues.push(...b.values);

        if (maxVal > dayPeakVal) {
          dayPeakVal = maxVal;
          dayPeakSlot = s;
        }
      } else {
        // Empty cell
        matrixData.push([s, idx, null, 0, null, null, null, dateStr]);
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
      avgValue: dayCount > 0 ? Number(mean(allDayValues).toFixed(2)) : null,
      medianValue: dayCount > 0 ? Number(median(allDayValues).toFixed(2)) : null,
      maxValue: dayCount > 0 ? Number(Math.max(...allDayValues).toFixed(2)) : null,
      peakSlot: dayPeakSlot,
      peakHour: dayPeakSlot !== null ? Math.floor(dayPeakSlot / 2) : null,
    });
  }

  // Monthly summary stats
  const allMonthValues = monthRecords.map((r) => getMetricValue(r, metricKey));
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
    avgValue: allMonthValues.length > 0 ? Number(mean(allMonthValues).toFixed(2)) : null,
    medianValue: allMonthValues.length > 0 ? Number(median(allMonthValues).toFixed(2)) : null,
    maxValue: allMonthValues.length > 0 ? Number(Math.max(...allMonthValues).toFixed(2)) : null,
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
    metricKey,
  };
}

/**
 * Aggregates records for a specified year (YYYY) or 12-month period (ending on YYYY-MM) into:
 * 1. 365-day calendar series formatted for ECharts calendar heatmap coordinate system.
 * 2. 12 Months x 24 Hours Seasonal Heatmap matrix.
 * 3. Monthly breakdown & annual stats.
 *
 * @param {Array<Object>} records - Raw parsed CSV records with EDT metadata
 * @param {string|number} targetYear - e.g. '2026' or '2026-10'
 * @param {string} metricKey - e.g. 'travel_time_min', 'traffic_delay_min'
 * @param {Object} [options] - Optional settings { metricAggregation?: 'avg' | 'peak', allTime?: boolean }
 * @returns {Object}
 */
export function buildYearlyCalendarData(records, targetYear, metricKey = 'travel_time_min', options = {}) {
  const { metricAggregation = 'avg', allTime = false } = options;
  const yearStr = String(targetYear);

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
    // 4-digit year 'YYYY' (calendar year Jan-Dec)
    const yr = parseInt(yearStr, 10);
    yearRecords = (records || []).filter(
      (r) => r.status === 'OK' && r.edt && r.edt.edtYear === yr
    );
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
    // 12-month rolling window ending on targetMonth 'YYYY-MM'
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

  // Build calendar series data: [ [dateStr, displayVal, count, peakVal, peakHour, avgVal, medVal], ... ]
  const calendarData = [];
  for (const [dateStr, recs] of dateMap.entries()) {
    const values = recs.map((r) => getMetricValue(r, metricKey));
    const avgVal = Number(mean(values).toFixed(2));
    const medVal = Number(median(values).toFixed(2));
    const peakVal = Number(Math.max(...values).toFixed(2));

    let peakHour = null;
    let maxHourVal = -Infinity;
    for (const r of recs) {
      const v = getMetricValue(r, metricKey);
      if (v > maxHourVal) {
        maxHourVal = v;
        peakHour = r.edt.edtHour;
      }
    }

    const displayVal = metricAggregation === 'peak' ? peakVal : (allTime ? medVal : avgVal);
    calendarData.push([dateStr, displayVal, recs.length, peakVal, peakHour, avgVal, medVal]);
  }

  // Build 12 Months x 24 Hours Seasonal Matrix
  // 12 rows (0..11 for each month in monthsList) x 24 columns (0..23)
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
      monthHourBuckets[rowIdx][hIdx].values.push(getMetricValue(r, metricKey));
    }
  }

  const monthHourMatrix = [];
  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 24; h++) {
      const b = monthHourBuckets[m][h];
      const count = b.values.length;
      if (count > 0) {
        const avgVal = Number(mean(b.values).toFixed(2));
        const medVal = Number(median(b.values).toFixed(2));
        const maxVal = Number(Math.max(...b.values).toFixed(2));
        const displayVal = metricAggregation === 'peak' ? maxVal : (allTime ? medVal : avgVal);
        monthHourMatrix.push([h, m, displayVal, count, medVal, avgVal, maxVal]);
      } else {
        monthHourMatrix.push([h, m, -1, 0, null, null, null]);
      }
    }
  }

  // Monthly summary
  const monthSummary = monthsList.map((item, idx) => {
    const mRecs = allTime
      ? yearRecords.filter((r) => r.edt.edtMonth === idx + 1)
      : yearRecords.filter((r) => r.edt.edtMonthStr === item.monthStr);
    const vals = mRecs.map((r) => getMetricValue(r, metricKey));
    return {
      monthIndex: idx,
      monthStr: item.monthStr,
      monthName: item.monthName,
      count: mRecs.length,
      avgValue: vals.length > 0 ? Number(mean(vals).toFixed(2)) : null,
      peakValue: vals.length > 0 ? Number(Math.max(...vals).toFixed(2)) : null,
    };
  });

  // Yearly stats
  const allYearValues = yearRecords.map((r) => getMetricValue(r, metricKey));
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
    avgValue: allYearValues.length > 0 ? Number(mean(allYearValues).toFixed(2)) : null,
    medianValue: allYearValues.length > 0 ? Number(median(allYearValues).toFixed(2)) : null,
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
    metricKey,
    metricAggregation,
  };
}


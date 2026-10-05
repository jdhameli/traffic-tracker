/**
 * Statistical calculations and median baseline computation engine.
 * Supports configurable metrics (traffic_delay_min, travel_time_min, baseline_time_min, distance_mi).
 */

import { parseToEDT, DAYS_OF_WEEK, getWeekRangeEDT } from './time-utils.js';
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
  if (weekDays && weekDays.length > 0 && !useMedian) {
    const weekSet = new Set(weekDays);
    targetRecords = records.filter((r) => weekSet.has(r.edt.edtDateStr));
  }

  // 7 days (0: Sun ... 6: Sat) x 48 30-min slots (0-47)
  const buckets = Array.from({ length: 7 }, () =>
    Array.from({ length: 48 }, () => ({
      values: [],
    }))
  );

  for (const r of targetRecords) {
    if (r.status !== 'OK') continue;
    const day = r.edt.edtDayOfWeek;
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

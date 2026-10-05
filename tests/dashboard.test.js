import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToEDT, getWeekRangeEDT, formatMinutes, formatHour, formatTimeSlot, TIME_SLOTS_30MIN } from '../dashboard/js/utils/time-utils.js';
import { getMetricValue, formatMetricValue, METRIC_CONFIGS } from '../dashboard/js/utils/metric-utils.js';
import {
  median,
  mean,
  percentile,
  buildHeatmapMatrix,
  computeDailyViewData,
  computeWeeklyViewData,
  computeMonthlyViewData,
} from '../dashboard/js/utils/stats-engine.js';

test('time-utils: parseToEDT accurately converts UTC to America/New_York (EDT)', () => {
  // 15:59:40 UTC on Oct 5 is 11:59:40 EDT (UTC-4)
  const edt = parseToEDT('2026-10-05T15:59:40.303Z');
  assert.equal(edt.edtYear, 2026);
  assert.equal(edt.edtMonth, 10);
  assert.equal(edt.edtDay, 5);
  assert.equal(edt.edtHour, 11);
  assert.equal(edt.edtMinute, 59);
  assert.equal(edt.edtDateStr, '2026-10-05');
  assert.equal(edt.edtMonthStr, '2026-10');
  assert.equal(edt.edtDayOfWeekName, 'Mon');
});

test('time-utils: getWeekRangeEDT calculates Sun-Sat dates', () => {
  const week = getWeekRangeEDT('2026-10-05'); // Monday Oct 5, 2026
  assert.equal(week.startDate, '2026-10-04'); // Sunday Oct 4
  assert.equal(week.endDate, '2026-10-10'); // Saturday Oct 10
  assert.equal(week.days.length, 7);
});

test('time-utils: formatHour, formatMinutes, and formatTimeSlot format correctly', () => {
  assert.equal(formatHour(0), '12 AM');
  assert.equal(formatHour(12), '12 PM');
  assert.equal(formatHour(17), '5 PM');
  assert.equal(formatMinutes(12.4), '12.4m');
  assert.equal(TIME_SLOTS_30MIN.length, 48);
  assert.equal(formatTimeSlot(0), '12:00 AM');
  assert.equal(formatTimeSlot(16), '8:00 AM');
  assert.equal(formatTimeSlot(17), '8:30 AM');
});

test('metric-utils: first metric is Travel Time and formats correctly', () => {
  const metricKeys = Object.keys(METRIC_CONFIGS);
  assert.equal(metricKeys[0], 'travel_time_min');

  const record = {
    distance_km: 10,
    travel_time_min: 15.5,
    traffic_delay_min: 3.2,
    baseline_time_min: 12.3,
  };

  assert.equal(getMetricValue(record, 'travel_time_min'), 15.5);
  assert.equal(getMetricValue(record, 'distance_mi'), 6.21);
  assert.equal(formatMetricValue(15.5, 'travel_time_min'), '15.5m');
});

test('stats-engine: median, mean, and percentile calculations', () => {
  assert.equal(median([1, 2, 3, 4, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(mean([10, 20, 30]), 20);
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
});

test('stats-engine: buildHeatmapMatrix aggregates 7x48 grid (30-min intervals) with week filter and median options', () => {
  const sampleRecords = [
    {
      status: 'OK',
      traffic_delay_min: 2.5,
      travel_time_min: 10.5,
      distance_km: 10,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // Mon Oct 5 (Week 1), 8:00 AM EDT (Slot 16)
    },
    {
      status: 'OK',
      traffic_delay_min: 4.5,
      travel_time_min: 12.5,
      distance_km: 10,
      edt: parseToEDT('2026-10-05T12:30:00.000Z'), // Mon Oct 5 (Week 1), 8:30 AM EDT (Slot 17)
    },
    {
      status: 'OK',
      traffic_delay_min: 6.0,
      travel_time_min: 16.0,
      distance_km: 10,
      edt: parseToEDT('2026-10-12T12:00:00.000Z'), // Mon Oct 12 (Week 2), 8:00 AM EDT (Slot 16)
    },
  ];

  // 1. Filtered by week 1
  const week1Days = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const week1Matrix = buildHeatmapMatrix(sampleRecords, 'travel_time_min', { weekDays: week1Days, useMedian: false });
  assert.equal(week1Matrix.length, 7 * 48); // 336 cells

  const mon800W1 = week1Matrix.find(([s, d]) => s === 16 && d === 1);
  assert.ok(mon800W1);
  assert.equal(mon800W1[3], 1); // 1 record at 8:00 AM
  assert.equal(mon800W1[2], 10.5);

  const mon830W1 = week1Matrix.find(([s, d]) => s === 17 && d === 1);
  assert.ok(mon830W1);
  assert.equal(mon830W1[3], 1); // 1 record at 8:30 AM
  assert.equal(mon830W1[2], 12.5);

  // 2. All-time median mode
  const medianMatrix = buildHeatmapMatrix(sampleRecords, 'travel_time_min', { useMedian: true });
  const mon800Med = medianMatrix.find(([s, d]) => s === 16 && d === 1);
  assert.ok(mon800Med);
  assert.equal(mon800Med[3], 2); // 2 records across all weeks at 8:00 AM
  assert.equal(mon800Med[2], 13.25); // median of [10.5, 16.0] = 13.25
});

test('stats-engine: computeDailyViewData computes historical median for configured metric', () => {
  const records = [
    // Prior day (Oct 4)
    {
      status: 'OK',
      travel_time_min: 12.0,
      traffic_delay_min: 2.0,
      distance_km: 10,
      edt: parseToEDT('2026-10-04T12:00:00.000Z'), // 8 AM EDT
    },
    // Target day (Oct 5)
    {
      status: 'OK',
      travel_time_min: 15.0,
      traffic_delay_min: 5.0,
      distance_km: 10,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // 8 AM EDT
    },
  ];

  const daily = computeDailyViewData(records, '2026-10-05', 'travel_time_min');
  assert.equal(daily.dayRecords.length, 1);
  assert.equal(daily.dayRecords[0].travel_time_min, 15.0);
  assert.equal(daily.hasPriorData, true);

  // Check 8 AM baseline computed from Oct 4
  const hour8Baseline = daily.hourlyMedianBaseline[8];
  assert.equal(hour8Baseline.medianValue, 12.0);
});

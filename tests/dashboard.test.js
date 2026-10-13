import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToEDT, getWeekRangeEDT, getRollingWeekRangeEDT, shiftDateStr, shiftMonthStr, formatMinutes, formatHour, formatTimeSlot, TIME_SLOTS_30MIN } from '../dashboard/js/utils/time-utils.js';
import { getMetricValue, formatMetricValue, METRIC_CONFIGS } from '../dashboard/js/utils/metric-utils.js';
import {
  median,
  mean,
  percentile,
  buildHeatmapMatrix,
  computeDailyViewData,
  computeWeeklyViewData,
  computeMonthlyViewData,
  buildMonthlyHeatmapMatrix,
  buildYearlyCalendarData,
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

test('stats-engine: buildMonthlyHeatmapMatrix aggregates 31x24 matrix and calendar summary for target month', () => {
  const sampleRecords = [
    {
      status: 'OK',
      travel_time_min: 10.0,
      traffic_delay_min: 1.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // Oct 5, 8 AM EDT
    },
    {
      status: 'OK',
      travel_time_min: 14.0,
      traffic_delay_min: 5.0,
      edt: parseToEDT('2026-10-05T12:30:00.000Z'), // Oct 5, 8 AM EDT
    },
    {
      status: 'OK',
      travel_time_min: 20.0,
      traffic_delay_min: 10.0,
      edt: parseToEDT('2026-10-06T21:00:00.000Z'), // Oct 6, 5 PM EDT (Hour 17)
    },
    {
      status: 'OK',
      travel_time_min: 12.0,
      traffic_delay_min: 2.0,
      edt: parseToEDT('2026-11-01T12:00:00.000Z'), // November (different month)
    },
  ];

  const monthly = buildMonthlyHeatmapMatrix(sampleRecords, '2026-10', 'travel_time_min');
  assert.equal(monthly.targetMonth, '2026-10');
  assert.equal(monthly.daysInMonth, 31);
  assert.equal(monthly.matrixData.length, 31 * 48); // 1488 30-min cells
  assert.equal(monthly.calendarDays.length, 31);

  // Oct 5 (day index 4), 8:00 AM (slot index 16)
  const oct5Slot16 = monthly.matrixData.find(([s, d]) => s === 16 && d === 4);
  assert.ok(oct5Slot16);
  assert.equal(oct5Slot16[3], 1); // 1 observation at 8:00 AM
  assert.equal(oct5Slot16[2], 10.0);

  // Oct 5 (day index 4), 8:30 AM (slot index 17)
  const oct5Slot17 = monthly.matrixData.find(([s, d]) => s === 17 && d === 4);
  assert.ok(oct5Slot17);
  assert.equal(oct5Slot17[3], 1); // 1 observation at 8:30 AM
  assert.equal(oct5Slot17[2], 14.0);

  // Check calendar day summary for Oct 5
  const day5 = monthly.calendarDays[4];
  assert.equal(day5.dateStr, '2026-10-05');
  assert.equal(day5.count, 2);
  assert.equal(day5.avgValue, 12.0);
  assert.equal(day5.maxValue, 14.0);

  // Check monthly stats
  assert.equal(monthly.monthlyStats.totalObservations, 3);
  assert.equal(monthly.monthlyStats.activeDaysCount, 2);
  assert.equal(monthly.monthlyStats.worstDay.dateStr, '2026-10-06');
});

test('stats-engine: buildYearlyCalendarData builds calendar series and seasonal matrix', () => {
  const sampleRecords = [
    {
      status: 'OK',
      travel_time_min: 10.0,
      traffic_delay_min: 1.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // 8 AM
    },
    {
      status: 'OK',
      travel_time_min: 16.0,
      traffic_delay_min: 6.0,
      edt: parseToEDT('2026-10-05T21:00:00.000Z'), // 5 PM (Peak)
    },
    {
      status: 'OK',
      travel_time_min: 12.0,
      traffic_delay_min: 2.0,
      edt: parseToEDT('2026-10-06T12:00:00.000Z'),
    },
  ];

  const yearly = buildYearlyCalendarData(sampleRecords, '2026', 'travel_time_min', {
    metricAggregation: 'avg',
  });

  assert.equal(yearly.targetYear, '2026');
  assert.equal(yearly.calendarData.length, 2); // 2 active days: Oct 5 and Oct 6
  assert.equal(yearly.monthHourMatrix.length, 12 * 24); // 288 cells
  assert.equal(yearly.yearlyStats.totalObservations, 3);
  assert.equal(yearly.yearlyStats.recordedDaysCount, 2);

  // Oct 5 entry: [dateStr, displayVal, count, peakVal, peakHour, avgVal, medVal]
  const oct5 = yearly.calendarData.find((d) => d[0] === '2026-10-05');
  assert.ok(oct5);
  assert.equal(oct5[1], 13.0); // avg of 10 and 16
  assert.equal(oct5[2], 2); // 2 records
  assert.equal(oct5[3], 16.0); // peakVal
  assert.equal(oct5[4], 17); // peakHour is 17 (5 PM)
});

test('chart-helpers: getClampedTooltipPosition clamps left and right boundaries strictly on screen', async () => {
  const { getClampedTooltipPosition } = await import('../dashboard/js/utils/chart-helpers.js');

  const size = {
    contentSize: [260, 120], // Tooltip: 260px wide, 120px tall
    viewSize: [1000, 600],    // Container: 1000px wide, 600px tall
  };

  // 1. Leftmost column: cell at x=25, center at x=35
  // Without clamp, posX would be 35 - 130 = -95 (off-screen left)
  const leftPos = getClampedTooltipPosition([35, 100], null, null, { x: 25, y: 80, width: 20, height: 20 }, size);
  assert.equal(leftPos[0], 12); // Clamped to 12px min padding
  assert.ok(leftPos[1] >= 0);

  // 2. Rightmost column: cell at x=975, center at x=985
  // Without clamp, posX would be 985 - 130 = 855 -> 855 + 260 = 1115 (115px off-screen right)
  const rightPos = getClampedTooltipPosition([985, 100], null, null, { x: 975, y: 80, width: 20, height: 20 }, size);
  assert.equal(rightPos[0], 1000 - 260 - 12); // Exactly 728px, staying within 1000px bounds
  assert.ok(rightPos[0] + 260 <= 1000);

  // 3. Middle cell: centered above
  const midPos = getClampedTooltipPosition([500, 200], null, null, { x: 490, y: 190, width: 20, height: 20 }, size);
  assert.equal(midPos[0], 500 - 130); // 370px
  assert.equal(midPos[1], 190 - 120 - 8); // 62px

  // 4. Top-row cell: flips below item if too close to top
  const topPos = getClampedTooltipPosition([500, 20], null, null, { x: 490, y: 10, width: 20, height: 20 }, size);
  assert.equal(topPos[1], 10 + 20 + 8); // 38px (flipped cleanly below cell)
});

test('time-utils: shiftDateStr and shiftMonthStr advance dates and months properly', () => {
  // 1. Advance by 1 day (Weekly view)
  assert.equal(shiftDateStr('2026-10-04', 1), '2026-10-05');
  assert.equal(shiftDateStr('2026-10-04', -1), '2026-10-03');

  // 2. Advance by 1 week / 7 days (Weekly fast jump, Monthly view step)
  assert.equal(shiftDateStr('2026-10-04', 7), '2026-10-11');
  assert.equal(shiftDateStr('2026-10-04', -7), '2026-09-27');

  // 3. Advance by 4 weeks / 28 days (Monthly fast jump)
  assert.equal(shiftDateStr('2026-10-04', 28), '2026-11-01');
  assert.equal(shiftDateStr('2026-10-04', -28), '2026-09-06');

  // 4. Advance by 1 month (Yearly view step)
  assert.equal(shiftMonthStr('2026-10', 1), '2026-11');
  assert.equal(shiftMonthStr('2026-10', -1), '2026-09');
  assert.equal(shiftMonthStr('2026-12', 1), '2027-01');
  assert.equal(shiftMonthStr('2026-01', -1), '2025-12');

  // 5. Advance by 1 year / 12 months (Yearly fast jump)
  assert.equal(shiftMonthStr('2026-10', 12), '2027-10');
  assert.equal(shiftMonthStr('2026-10', -12), '2025-10');
});

test('time-utils: getRollingWeekRangeEDT produces exact sliding date windows', () => {
  const week7 = getRollingWeekRangeEDT('2026-10-05', 7);
  assert.equal(week7.startDate, '2026-10-05');
  assert.equal(week7.endDate, '2026-10-11');
  assert.equal(week7.days.length, 7);
  assert.equal(week7.days[0], '2026-10-05');
  assert.equal(week7.days[6], '2026-10-11');

  const month28 = getRollingWeekRangeEDT('2026-10-04', 28);
  assert.equal(month28.startDate, '2026-10-04');
  assert.equal(month28.endDate, '2026-10-31');
  assert.equal(month28.days.length, 28);
  assert.equal(month28.days[0], '2026-10-04');
  assert.equal(month28.days[27], '2026-10-31');
});

test('stats-engine: buildMonthlyHeatmapMatrix supports 28-day rolling window advancing by week', () => {
  const sampleRecords = [
    {
      status: 'OK',
      travel_time_min: 10.0,
      traffic_delay_min: 1.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // Oct 5, 8 AM EDT
    },
  ];

  const rollingMonthly = buildMonthlyHeatmapMatrix(sampleRecords, '2026-10-04', 'travel_time_min', {
    useMedian: false,
    numDays: 28,
  });

  assert.equal(rollingMonthly.daysInMonth, 28);
  assert.equal(rollingMonthly.matrixData.length, 28 * 48);
  assert.equal(rollingMonthly.startDate, '2026-10-04');
  assert.equal(rollingMonthly.endDate, '2026-10-31');
  assert.equal(rollingMonthly.dayLabels.length, 28);
  assert.equal(rollingMonthly.calendarDays.length, 28);
});

test('stats-engine: buildYearlyCalendarData supports 12-month rolling window advancing by month', () => {
  const sampleRecords = [
    {
      status: 'OK',
      travel_time_min: 15.0,
      traffic_delay_min: 2.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'),
    },
  ];

  const rollingYearly = buildYearlyCalendarData(sampleRecords, '2026-10', 'travel_time_min');
  assert.equal(rollingYearly.startDate, '2025-11-01');
  assert.equal(rollingYearly.endDate, '2026-10-31');
  assert.equal(rollingYearly.monthHourMatrix.length, 12 * 24);
  assert.equal(rollingYearly.monthSummary.length, 12);
  assert.equal(rollingYearly.monthSummary[11].monthStr, '2026-10');
  assert.equal(rollingYearly.monthSummary[0].monthStr, '2025-11');
});

test('stats-engine: buildMonthlyHeatmapMatrix supports all-time median mode across all records (Days 1–31)', () => {
  const multiMonthRecords = [
    {
      status: 'OK',
      travel_time_min: 10.0,
      traffic_delay_min: 1.0,
      edt: parseToEDT('2026-09-05T12:00:00.000Z'), // Sep 5 (Day 5), 8 AM EDT (Slot 16)
    },
    {
      status: 'OK',
      travel_time_min: 20.0,
      traffic_delay_min: 5.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // Oct 5 (Day 5), 8 AM EDT (Slot 16)
    },
  ];

  const allTimeMonthly = buildMonthlyHeatmapMatrix(multiMonthRecords, null, 'travel_time_min', {
    allTime: true,
  });

  assert.equal(allTimeMonthly.daysInMonth, 31);
  assert.equal(allTimeMonthly.matrixData.length, 31 * 48);
  assert.equal(allTimeMonthly.startDate, '2026-10-01');
  assert.equal(allTimeMonthly.endDate, '2026-10-31');
  assert.equal(allTimeMonthly.dayLabels[4], 'Day 05');

  // Day 5 (index 4), 8:00 AM (slot 16): median of [10.0, 20.0] = 15.0
  const day5Slot16 = allTimeMonthly.matrixData.find(([s, d]) => s === 16 && d === 4);
  assert.ok(day5Slot16);
  assert.equal(day5Slot16[2], 15.0); // median
  assert.equal(day5Slot16[3], 2); // 2 observations across all months
});

test('stats-engine: buildYearlyCalendarData supports all-time median mode across all records (Jan–Dec)', () => {
  const multiYearRecords = [
    {
      status: 'OK',
      travel_time_min: 12.0,
      traffic_delay_min: 1.0,
      edt: parseToEDT('2025-10-05T12:00:00.000Z'), // Oct 2025, 8 AM EDT (Hour 8)
    },
    {
      status: 'OK',
      travel_time_min: 18.0,
      traffic_delay_min: 3.0,
      edt: parseToEDT('2026-10-05T12:00:00.000Z'), // Oct 2026, 8 AM EDT (Hour 8)
    },
  ];

  const allTimeYearly = buildYearlyCalendarData(multiYearRecords, null, 'travel_time_min', {
    allTime: true,
  });

  assert.equal(allTimeYearly.targetLabel, 'All-Time Historical (Jan–Dec)');
  assert.equal(allTimeYearly.monthHourMatrix.length, 12 * 24);
  assert.equal(allTimeYearly.monthSummary.length, 12);

  // October is index 9 (month 10): 8 AM (hour 8): median of [12.0, 18.0] = 15.0
  const octHour8 = allTimeYearly.monthHourMatrix.find(([h, m]) => h === 8 && m === 9);
  assert.ok(octHour8);
  assert.equal(octHour8[2], 15.0); // median
  assert.equal(octHour8[3], 2); // 2 observations across all years
});

test('view-nav: Daily View is the first tab, but Weekly Heatmap is open by default', async () => {
  const { VIEWS } = await import('../dashboard/js/components/view-nav.js');
  const { stateStore } = await import('../dashboard/js/state.js');

  // 1. Daily View is first tab
  assert.equal(VIEWS[0].id, 'daily');
  assert.equal(VIEWS[0].label, 'Daily View');

  // 2. Weekly Heatmap is second tab
  assert.equal(VIEWS[1].id, 'heatmap');
  assert.equal(VIEWS[1].label, 'Weekly Heatmap');

  // 3. Weekly Heatmap is open by default
  assert.equal(stateStore.getState().selectedView, 'heatmap');
});



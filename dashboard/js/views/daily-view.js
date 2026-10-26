/**
 * View 2: Daily View (24-Hour continuous EDT timeline + Historical Median Trendline).
 * Powered by Observable Plot.
 */

import * as Plot from '@observablehq/plot';
import { computeDailyViewData } from '../utils/stats-engine.js';
import { formatTravelTime } from '../utils/metric-utils.js';
import { minutesToTimeLabel, timeToMinutes, formatHour } from '../utils/time-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';
import { updateChartHeader } from '../utils/chart-header.js';
import { mountPlot, renderEmptyState, TIP_STYLE } from '../utils/plot-theme.js';

let activeMount = null;

export function renderDailyView(containerEl, records, state) {
  disposeDailyChart();

  const selectedDate = state.selectedDate;

  updateChartHeader({
    title: `Daily Travel Time Profile: ${selectedDate} (EDT)`,
    subtitle: 'Observed trips vs. historical median baseline across 24-hour EDT day',
    unit: 'min',
    metricLabel: 'Travel Time',
  });

  const dailyData = computeDailyViewData(records, selectedDate);
  const { dayRecords, hourlyMedianBaseline, hasPriorData } = dailyData;

  if (dayRecords.length === 0 && !hasPriorData) {
    renderEmptyState(containerEl, {
      title: `No Observations for ${selectedDate}`,
      message: 'Use the date navigator above to select a date with recorded traffic data.',
    });
    return;
  }

  // Create lookup map for hourly medians
  const medianMap = new Map();
  for (const b of hourlyMedianBaseline) {
    if (b.medianValue !== null) {
      medianMap.set(b.hour, b.medianValue);
    }
  }

  // Observed points
  const actualPoints = dayRecords.map((r) => {
    const mins = timeToMinutes(r.edt.edtHour, r.edt.edtMinute);
    const med = medianMap.get(r.edt.edtHour) ?? null;
    return {
      minute: mins,
      value: r.travel_time_min,
      timeStr: r.edt.edtTimeStr,
      dateStr: r.edt.edtDateStr,
      hour: r.edt.edtHour,
      medianForHour: med,
      diff: med !== null ? Number((r.travel_time_min - med).toFixed(1)) : null,
      record: r,
    };
  });

  // Historical median baseline curve
  const medianPoints = hourlyMedianBaseline
    .filter((b) => b.medianValue !== null)
    .map((b) => ({
      minute: b.hour * 60 + 30, // center in hour
      value: b.medianValue,
      hour: b.hour,
      sampleCount: b.sampleCount,
    }));

  const actualVals = actualPoints.map((p) => p.value);
  const minVal = actualVals.length > 0 ? Math.min(...actualVals) : null;
  const maxVal = actualVals.length > 0 ? Math.max(...actualVals) : null;

  updateChartHeader({
    title: `Daily Travel Time Profile: ${selectedDate} (EDT)`,
    subtitle: 'Observed trips vs. historical median baseline across 24-hour EDT day',
    unit: 'min',
    metricLabel: 'Travel Time',
    minVal,
    maxVal,
  });

  const allY = [
    ...actualPoints.map((p) => p.value),
    ...medianPoints.map((p) => p.value),
  ];
  const maxY = allY.length > 0 ? Math.max(...allY) : 10;
  const yUpper = Math.ceil(maxY * 1.25);

  activeMount = mountPlot(containerEl, (width) => {
    const isMobile = width < 640;
    const ticksX = isMobile
      ? [0, 360, 720, 1080, 1440]
      : [0, 180, 360, 540, 720, 900, 1080, 1260, 1440];

    return Plot.plot({
      width,
      height: isMobile ? 380 : 440,
      marginTop: 20,
      marginRight: isMobile ? 18 : 32,
      marginBottom: 50,
      marginLeft: isMobile ? 44 : 54,
      x: {
        domain: [0, 1440],
        ticks: ticksX,
        tickFormat: (mins) => {
          if (mins === 0 || mins === 1440) return '12 AM';
          if (mins === 180) return '3 AM';
          if (mins === 360) return '6 AM';
          if (mins === 540) return '9 AM';
          if (mins === 720) return '12 PM';
          if (mins === 900) return '3 PM';
          if (mins === 1080) return '6 PM';
          if (mins === 1260) return '9 PM';
          return '';
        },
        label: null,
      },
      y: {
        domain: [0, yUpper],
        label: 'Travel Time (min)',
        grid: true,
      },
      marks: [
        // Observed trip area fill
        actualPoints.length > 1
          ? Plot.areaY(actualPoints, {
              x: 'minute',
              y: 'value',
              fill: THEME_COLORS.primary,
              fillOpacity: 0.1,
              curve: 'monotone-x',
            })
          : null,
        // Observed trip line
        actualPoints.length > 1
          ? Plot.lineY(actualPoints, {
              x: 'minute',
              y: 'value',
              stroke: THEME_COLORS.primary,
              strokeWidth: 2.5,
              curve: 'monotone-x',
            })
          : null,
        // Historical median dashed curve
        medianPoints.length > 0
          ? Plot.lineY(medianPoints, {
              x: 'minute',
              y: 'value',
              stroke: THEME_COLORS.median,
              strokeWidth: 2,
              strokeDasharray: '4,4',
              curve: 'monotone-x',
            })
          : null,
        // Historical median dots
        medianPoints.length > 0
          ? Plot.dot(medianPoints, {
              x: 'minute',
              y: 'value',
              fill: THEME_COLORS.median,
              r: isMobile ? 2.5 : 3,
            })
          : null,
        // Observed points
        Plot.dot(actualPoints, {
          x: 'minute',
          y: 'value',
          fill: THEME_COLORS.primary,
          stroke: THEME_COLORS.bgSurface,
          strokeWidth: 2,
          r: isMobile ? 4 : 5,
        }),
        // Interactive tooltip on points
        Plot.tip(
          actualPoints,
          Plot.pointerX({
            x: 'minute',
            y: 'value',
            ...TIP_STYLE,
            title: (d) => {
              const lines = [
                `${minutesToTimeLabel(d.minute)} EDT (${d.dateStr})`,
                `Travel Time   ${formatTravelTime(d.value, true)}`,
              ];
              if (d.medianForHour !== null) {
                lines.push(`Hist. Median  ${formatTravelTime(d.medianForHour)}`);
                const sign = d.diff >= 0 ? '+' : '';
                lines.push(`Difference    ${sign}${d.diff}m vs. median`);
              }
              return lines.join('\n');
            },
          })
        ),
      ],
    });
  }, { minVal, maxVal, unit: 'min' });
}

export function disposeDailyChart() {
  if (activeMount) {
    activeMount.dispose();
    activeMount = null;
  }
}

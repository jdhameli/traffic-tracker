/**
 * View 2: Daily View (24-Hour continuous EDT timeline + Historical Median Trendline).
 * Uses standard unified theme palette.
 */

import { computeDailyViewData } from '../utils/stats-engine.js';
import { METRIC_CONFIGS, formatMetricValue, getMetricValue } from '../utils/metric-utils.js';
import { minutesToTimeLabel, timeToMinutes } from '../utils/time-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';

let chartInstance = null;

export function renderDailyView(containerEl, records, state) {
  const containerWidth = containerEl.parentElement?.clientWidth || containerEl.clientWidth || 960;
  const isMobile = containerWidth < 640;
  containerEl.style.height = isMobile ? '430px' : '520px';

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      renderDailyView(containerEl, records, state);
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const selectedDate = state.selectedDate;
  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;

  const dailyData = computeDailyViewData(records, selectedDate, metricKey);
  const { dayRecords, hourlyMedianBaseline, hasPriorData } = dailyData;

  if (dayRecords.length === 0 && !hasPriorData) {
    chartInstance.clear();
    containerEl.innerHTML = `
      <div class="chart-empty-state">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h3>No Observations for ${selectedDate}</h3>
        <p>Use the date navigator above to select a date with recorded traffic data.</p>
      </div>
    `;
    chartInstance = null;
    return;
  }

  // Exact observation points in [minutesFromMidnight, metricValue, record]
  const actualPoints = dayRecords.map((r) => {
    const mins = timeToMinutes(r.edt.edtHour, r.edt.edtMinute);
    const val = getMetricValue(r, metricKey);
    return [mins, val, r];
  });

  // Historical median baseline curve: [hour * 60, medianValue]
  const medianPoints = hourlyMedianBaseline
    .filter((b) => b.medianValue !== null)
    .map((b) => [b.hour * 60, b.medianValue]);

  const allYVals = [
    ...actualPoints.map((p) => p[1]),
    ...medianPoints.map((p) => p[1]),
  ];
  const maxY = allYVals.length > 0 ? Math.max(...allYVals) : 0;
  const yUpper = maxY > 0 ? Math.ceil(maxY * 1.25) : 5;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `Daily ${metricConfig.label} Profile: ${selectedDate} (EDT)`,
      subtext: `Observed points vs. historical median baseline across 24-hour EDT day`,
      left: 'left',
      top: 0,
      textStyle: {
        color: THEME_COLORS.textPrimary,
        fontSize: isMobile ? 12 : 15,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
      },
      subtextStyle: {
        color: THEME_COLORS.textMuted,
        fontSize: isMobile ? 10 : 12,
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: THEME_COLORS.bgSurface,
      borderColor: THEME_COLORS.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: THEME_COLORS.textPrimary, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 8px;',
      formatter: function (params) {
        if (!params || !params.data) return '';
        const [minsFromMidnight, val, record] = params.data;
        const timeStr = minutesToTimeLabel(minsFromMidnight);

        if (record) {
          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:5px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${timeStr} EDT (${selectedDate})
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:4px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(val, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Total Duration:</span>
              <span style="color:${THEME_COLORS.textSecondary};font-weight:500;">${record.travel_time_min.toFixed(1)}m</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Free-flow Baseline:</span>
              <span style="color:${THEME_COLORS.textSecondary};font-weight:500;">${record.baseline_time_min.toFixed(1)}m</span>
            </div>
          `;
        } else {
          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:5px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${timeStr} EDT (Historical Benchmark)
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:4px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Median ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.median};">${formatMetricValue(val, metricKey, true)}</strong>
            </div>
          `;
        }
      },
    },
    legend: {
      bottom: isMobile ? 4 : 8,
      left: 'center',
      orient: 'horizontal',
      itemGap: isMobile ? 12 : 24,
      textStyle: { color: THEME_COLORS.textSecondary, fontSize: isMobile ? 10 : 11 },
      data: [
        `Observed ${metricConfig.label} (${selectedDate})`,
        'Historical Median Trendline',
      ],
    },
    grid: {
      top: isMobile ? 60 : 65,
      bottom: isMobile ? 55 : 50,
      left: isMobile ? 42 : 65,
      right: isMobile ? 16 : 35,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1440,
      interval: isMobile ? 360 : 180,
      axisLabel: {
        color: THEME_COLORS.textMuted,
        fontSize: isMobile ? 10 : 11,
        formatter: (val) => {
          if (val === 0 || val === 1440) return '12 AM';
          if (val === 180) return isMobile ? '' : '3 AM';
          if (val === 360) return '6 AM';
          if (val === 540) return isMobile ? '' : '9 AM';
          if (val === 720) return '12 PM';
          if (val === 900) return isMobile ? '' : '3 PM';
          if (val === 1080) return '6 PM';
          if (val === 1260) return isMobile ? '' : '9 PM';
          return '';
        },
      },
      axisLine: { lineStyle: { color: THEME_COLORS.border } },
      splitLine: { show: true, lineStyle: { color: THEME_COLORS.borderSplit, type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yUpper,
      name: `${metricConfig.label} (${metricConfig.unit})`,
      nameTextStyle: { color: THEME_COLORS.textMuted, fontSize: 11, padding: [0, 0, 0, 20] },
      axisLabel: {
        color: THEME_COLORS.textMuted,
        formatter: (val) => `${val}${metricConfig.shortUnit}`,
      },
      axisLine: { lineStyle: { color: THEME_COLORS.border } },
      splitLine: { lineStyle: { color: THEME_COLORS.borderSplit } },
    },
    series: [
      {
        name: `Observed ${metricConfig.label} (${selectedDate})`,
        type: 'line',
        data: actualPoints,
        smooth: false,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: isMobile ? 7 : 9,
        itemStyle: {
          color: THEME_COLORS.primary,
          borderWidth: 2,
          borderColor: THEME_COLORS.bgSurface,
        },
        lineStyle: { width: 2.5, color: THEME_COLORS.primary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: THEME_COLORS.primaryAreaStart },
            { offset: 1, color: THEME_COLORS.primaryAreaEnd },
          ]),
        },
      },
      {
        name: 'Historical Median Trendline',
        type: 'line',
        data: medianPoints,
        smooth: true,
        showSymbol: true,
        symbol: 'emptyCircle',
        symbolSize: isMobile ? 5 : 6,
        lineStyle: { width: 2, color: THEME_COLORS.median, type: 'dashed' },
        itemStyle: { color: THEME_COLORS.median },
      },
    ],
  };

  chartInstance.setOption(option, true);
  chartInstance.resize();
}

export function disposeDailyChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

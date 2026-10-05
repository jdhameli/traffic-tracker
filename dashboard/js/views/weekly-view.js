/**
 * View 3: Weekly View (7-Day profile + Historical Weekly Median Trendline).
 * Uses standard unified theme palette.
 */

import { computeWeeklyViewData } from '../utils/stats-engine.js';
import { METRIC_CONFIGS, formatMetricValue } from '../utils/metric-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';

let chartInstance = null;

export function renderWeeklyView(containerEl, records, state) {
  const containerWidth = containerEl.parentElement?.clientWidth || containerEl.clientWidth || 960;
  const isMobile = containerWidth < 640;
  containerEl.style.height = isMobile ? '430px' : '520px';

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      renderWeeklyView(containerEl, records, state);
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const selectedDate = state.selectedDate;
  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;

  const weeklyData = computeWeeklyViewData(records, selectedDate, metricKey);
  const { startDate, endDate, weekDaysData, weeklyMedianBaseline } = weeklyData;

  const dayLabels = weekDaysData.map((d) => (isMobile ? d.dayName : `${d.dayName}\n${d.dateStr.substring(5)}`));
  const actualAvgVals = weekDaysData.map((d) => (d.count > 0 ? d.avgValue : null));
  const medianWeeklyBaseline = weeklyMedianBaseline.map((b) => b.medianValue);

  const allVals = [
    ...actualAvgVals.filter((v) => v !== null),
    ...medianWeeklyBaseline.filter((v) => v !== null),
  ];
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 0;
  const yUpper = maxVal > 0 ? Math.ceil(maxVal * 1.25) : 5;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `Weekly ${metricConfig.label} Profile: ${startDate} to ${endDate} (EDT)`,
      subtext: `Daily average ${metricConfig.label} vs. historical weekly median benchmark from prior weeks`,
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
      trigger: 'axis',
      backgroundColor: THEME_COLORS.bgSurface,
      borderColor: THEME_COLORS.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: THEME_COLORS.textPrimary, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 8px;',
      formatter: function (params) {
        if (!params || params.length === 0) return '';
        const dayIdx = params[0].dataIndex;
        const dayInfo = weekDaysData[dayIdx];

        let header = `
          <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:5px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
            ${dayInfo.dayName}, ${dayInfo.dateStr} (EDT)
          </div>
        `;

        let body = '';
        if (dayInfo.count === 0) {
          body += `<div style="color:${THEME_COLORS.textMuted};margin:4px 0;">No observations recorded on this day</div>`;
        } else {
          body += `
            <div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Daily Avg ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(dayInfo.avgValue, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Median ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.textPrimary};">${formatMetricValue(dayInfo.medianValue, metricKey)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Total Trips:</span>
              <span style="color:${THEME_COLORS.textSecondary};font-weight:500;">${dayInfo.count} trips</span>
            </div>
          `;
        }

        const histMedian = weeklyMedianBaseline[dayIdx]?.medianValue;
        if (histMedian !== null && histMedian !== undefined) {
          body += `
            <div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;padding-top:5px;border-top:1px dashed ${THEME_COLORS.border};">
              <span style="color:${THEME_COLORS.median};">Prior Weeks Median:</span>
              <strong style="color:${THEME_COLORS.median};">${formatMetricValue(histMedian, metricKey)}</strong>
            </div>
          `;
        }

        return header + body;
      },
    },
    legend: {
      bottom: isMobile ? 4 : 8,
      left: 'center',
      orient: 'horizontal',
      itemGap: isMobile ? 12 : 24,
      textStyle: { color: THEME_COLORS.textSecondary, fontSize: isMobile ? 10 : 11 },
      data: [
        `Weekly Avg ${metricConfig.label}`,
        'Historical Weekly Median',
      ],
    },
    grid: {
      top: isMobile ? 60 : 65,
      bottom: isMobile ? 55 : 50,
      left: isMobile ? 42 : 65,
      right: isMobile ? 16 : 35,
    },
    xAxis: {
      type: 'category',
      data: dayLabels,
      axisLabel: { color: THEME_COLORS.textSecondary, fontSize: isMobile ? 10 : 11 },
      axisLine: { lineStyle: { color: THEME_COLORS.border } },
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
        name: `Weekly Avg ${metricConfig.label}`,
        type: 'line',
        data: actualAvgVals,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: isMobile ? 7 : 8,
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
        name: 'Historical Weekly Median',
        type: 'line',
        data: medianWeeklyBaseline,
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

export function disposeWeeklyChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

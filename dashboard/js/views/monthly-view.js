/**
 * View 4: Monthly View (Calendar-day progression + Historical Monthly Median Baseline).
 * Uses standard unified theme palette.
 */

import { computeMonthlyViewData } from '../utils/stats-engine.js';
import { METRIC_CONFIGS, formatMetricValue } from '../utils/metric-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';

let chartInstance = null;

export function renderMonthlyView(containerEl, records, state) {
  const containerWidth = containerEl.parentElement?.clientWidth || containerEl.clientWidth || 960;
  const isMobile = containerWidth < 640;
  containerEl.style.height = isMobile ? '430px' : '520px';

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      renderMonthlyView(containerEl, records, state);
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const targetMonth = state.selectedMonth || (state.selectedDate ? state.selectedDate.substring(0, 7) : '2026-10');
  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;

  const monthlyData = computeMonthlyViewData(records, targetMonth, metricKey);
  const { daysData, daysInMonth, monthlyMedianBaseline } = monthlyData;

  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
  const actualAvgVals = daysData.map((d) => (d.count > 0 ? d.avgValue : null));

  const histMedianValue = monthlyMedianBaseline.medianValue;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `Monthly ${metricConfig.label} Overview: ${targetMonth} (EDT)`,
      subtext: `Daily ${metricConfig.label} progression compared to historical monthly median`,
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
        const dayInfo = daysData[dayIdx];

        let header = `
          <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:5px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
            ${dayInfo.dateStr} (EDT)
          </div>
        `;

        let body = '';
        if (dayInfo.count === 0) {
          body += `<div style="color:${THEME_COLORS.textMuted};margin:4px 0;">No observations recorded on this date</div>`;
        } else {
          body += `
            <div style="display:flex;justify-content:space-between;gap:20px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Daily Avg ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.primary};">
                ${formatMetricValue(dayInfo.avgValue, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Observations:</span>
              <span style="color:${THEME_COLORS.textSecondary};font-weight:500;">${dayInfo.count} trips</span>
            </div>
          `;
        }

        if (histMedianValue !== null && histMedianValue !== undefined) {
          body += `
            <div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;padding-top:5px;border-top:1px dashed ${THEME_COLORS.border};">
              <span style="color:${THEME_COLORS.median};">Prior Months Median:</span>
              <strong style="color:${THEME_COLORS.median};">${formatMetricValue(histMedianValue, metricKey)}</strong>
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
        `Daily Avg ${metricConfig.label}`,
        'Historical Monthly Median',
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
      axisLabel: {
        color: THEME_COLORS.textMuted,
        fontSize: isMobile ? 10 : 11,
        interval: isMobile ? 4 : 1,
        formatter: (val) => (isMobile ? `Day ${val}` : `${val}`),
      },
      axisLine: { lineStyle: { color: THEME_COLORS.border } },
    },
    yAxis: {
      type: 'value',
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
        name: `Daily Avg ${metricConfig.label}`,
        type: 'line',
        data: actualAvgVals,
        smooth: true,
        showSymbol: true,
        symbolSize: isMobile ? 5 : 6,
        itemStyle: { color: THEME_COLORS.primary },
        lineStyle: { width: 2.5, color: THEME_COLORS.primary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: THEME_COLORS.primaryAreaStart },
            { offset: 1, color: THEME_COLORS.primaryAreaEnd },
          ]),
        },
      },
      ...(histMedianValue !== null && histMedianValue !== undefined
        ? [
            {
              name: 'Historical Monthly Median',
              type: 'line',
              markLine: {
                symbol: 'none',
                data: [{ yAxis: histMedianValue }],
                lineStyle: { color: THEME_COLORS.median, type: 'dashed', width: 2 },
                label: {
                  formatter: `Prior Months Median: ${histMedianValue.toFixed(1)}${metricConfig.shortUnit}`,
                  position: 'insideStartTop',
                  color: THEME_COLORS.median,
                  fontSize: isMobile ? 10 : 11,
                },
              },
            },
          ]
        : []),
    ],
  };

  chartInstance.setOption(option, true);
  chartInstance.resize();
}

export function disposeMonthlyChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

/**
 * Yearly Heatmap View (365-Day Annual Calendar & 12 Months x 24 Hours Seasonal Heatmap).
 * Provides high-level annual commute performance overview with drill-down capability into Daily View.
 */

import { buildYearlyCalendarData } from '../utils/stats-engine.js';
import { METRIC_CONFIGS, formatMetricValue } from '../utils/metric-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';
import { updateChartHeader } from '../utils/chart-header.js';
import { formatHour, HOURS_OF_DAY } from '../utils/time-utils.js';
import { getSafeContainerWidth, getClampedTooltipPosition } from '../utils/chart-helpers.js';

let chartInstance = null;
let currentCallbacks = null;

function calculateYearlyDimensions(containerEl, isSeasonalMode = false) {
  const containerWidth = getSafeContainerWidth(containerEl);
  const isMobile = containerWidth < 640;

  if (isSeasonalMode) {
    // 24 hours (X) x 12 months (Y)
    const leftMargin = isMobile ? 48 : 60;
    const rightMargin = isMobile ? 18 : 32;
    const availableWidth = Math.max(containerWidth - leftMargin - rightMargin, 24 * 8);
    const cellWidth = Math.max(Math.floor(availableWidth / 24), 8);
    const gridWidth = cellWidth * 24;
    const cellHeight = cellWidth; // Square readings: cell width === cell height
    const gridHeight = cellHeight * 12;
    const totalHeight = gridHeight + (isMobile ? 120 : 135);
    const maxLeft = Math.max(leftMargin, containerWidth - gridWidth - rightMargin);
    const computedLeft = Math.max(leftMargin, Math.min(maxLeft, Math.floor((containerWidth - gridWidth) / 2)));
    return { isMobile, containerWidth, totalHeight, gridWidth, gridHeight, computedLeft };
  }

  // 365-Day Calendar Mode
  const totalHeight = isMobile ? 320 : 340;
  return { isMobile, containerWidth, totalHeight };
}

export function renderYearlyHeatmapView(containerEl, records, state, callbacks = {}) {
  currentCallbacks = callbacks;
  const useMedian = !!state.yearlyUseMedian;
  const targetPeriod = state.selectedMonth || (state.selectedDate ? state.selectedDate.substring(0, 7) : (state.selectedYear ? `${state.selectedYear}-12` : '2026-10'));
  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;
  const mode = state.yearlyHeatmapMode || 'calendar'; // 'calendar' or 'seasonal'
  const isSeasonalMode = mode === 'seasonal';
  const metricAggregation = state.yearlyHeatmapMetricType || 'avg'; // 'avg' or 'peak'

  const yearlyData = buildYearlyCalendarData(records, targetPeriod, metricKey, {
    metricAggregation,
    allTime: useMedian,
  });

  const { calendarData, monthHourMatrix, monthSummary, yearlyStats } = yearlyData;

  // Apply height first so scrollbar appearance doesn't throw off clientWidth
  const prelimDims = calculateYearlyDimensions(containerEl, isSeasonalMode);
  containerEl.style.height = `${prelimDims.totalHeight}px`;
  const dims = calculateYearlyDimensions(containerEl, isSeasonalMode);
  containerEl.style.height = `${dims.totalHeight}px`;

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      renderYearlyHeatmapView(containerEl, records, state, callbacks);
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const aggLabel = useMedian
    ? (metricAggregation === 'peak' ? 'All-Time Peak' : 'All-Time Median')
    : (metricAggregation === 'peak' ? 'Peak Congestion' : 'Daily Average');

  const subtitle = useMedian
    ? (isSeasonalMode
        ? `Seasonal 12-Month hourly commute profile across all recorded data (Jan–Dec) • ${aggLabel}`
        : `All-Time commute performance calendar (${aggLabel}) • Click any date to open detailed Daily View`)
    : (isSeasonalMode
        ? `Seasonal 12-Month hourly commute profile (${aggLabel}) • Click any cell to inspect Monthly View`
        : `12-Month commute performance calendar (${aggLabel}) • Click any date to open detailed Daily View`);

  const titleText = useMedian
    ? `Annual ${metricConfig.label} Heatmap: All-Time Historical Median (EDT)`
    : `Annual ${metricConfig.label} Heatmap: ${yearlyData.targetLabel} (EDT)`;

  updateChartHeader({
    title: titleText,
    subtitle,
    unit: metricConfig.unit,
    metricLabel: metricConfig.label,
  });

  if (!records || records.length === 0 || yearlyStats.totalObservations === 0) {
    chartInstance.clear();
    containerEl.innerHTML = `
      <div class="chart-empty-state">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3>No Observations in ${yearlyData.targetLabel}</h3>
        <p>No traffic records recorded for this route between ${yearlyData.startDate} and ${yearlyData.endDate}. Use the navigator above to browse recorded periods.</p>
      </div>
    `;
    chartInstance = null;
    return;
  }

  // Calculate dynamic scale
  let observedVals = [];
  if (isSeasonalMode) {
    observedVals = monthHourMatrix.filter((d) => d[3] > 0 && d[2] !== null && d[2] >= 0).map((d) => d[2]);
  } else {
    observedVals = calendarData.filter((d) => d[1] !== null && d[1] >= 0).map((d) => d[1]);
  }

  let minScale = 0;
  let maxScale = 5;

  if (observedVals.length > 0) {
    const rawMin = Math.min(...observedVals);
    const rawMax = Math.max(...observedVals);

    if (metricKey === 'traffic_delay_min') {
      minScale = 0;
      maxScale = rawMax > 0 ? Number(rawMax.toFixed(1)) : 1;
    } else {
      if (rawMin === rawMax) {
        minScale = Math.max(0, Number((rawMin - 1).toFixed(1)));
        maxScale = Number((rawMax + 1).toFixed(1));
      } else {
        minScale = Number(rawMin.toFixed(1));
        maxScale = Number(rawMax.toFixed(1));
      }
    }
  }

  let option = {};

  if (!isSeasonalMode) {
    // ==========================================
    // Mode 1: 365-Day Annual Calendar Heatmap
    // Unrecorded days are completely blank (transparent calendar cells, no fill/border)
    // ==========================================
    const observedCalendarData = calendarData.filter((d) => d[2] > 0 && d[1] !== null);

    option = {
      backgroundColor: 'transparent',
      tooltip: {
        confine: true,
        position: getClampedTooltipPosition,
        backgroundColor: THEME_COLORS.bgSurface,
        borderColor: THEME_COLORS.border,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: THEME_COLORS.textPrimary, fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 8px; z-index: 9999; pointer-events: none;',
        formatter: function (params) {
          if (!params || !params.data) return '';
          const [dateStr, displayVal, count, peakVal, peakHour, avgVal] = params.data;
          const peakHourStr = peakHour !== null && peakHour !== undefined ? formatHour(peakHour) : '--';

          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:4px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${dateStr} (EDT)
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">${aggLabel}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(displayVal, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Daily Peak:</span>
              <strong style="color:${THEME_COLORS.peak};">
                ${formatMetricValue(peakVal, metricKey)} (at ${peakHourStr})
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Daily Average:</span>
              <strong style="color:${THEME_COLORS.textPrimary};">${formatMetricValue(avgVal, metricKey)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Observations:</span>
              <span style="color:${THEME_COLORS.textPrimary};font-weight:500;">${count} trips</span>
            </div>
            <div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${THEME_COLORS.border};color:${THEME_COLORS.primary};font-size:0.75rem;font-weight:500;">
              👉 Click to open Daily View for ${dateStr}
            </div>
          `;
        },
      },
      visualMap: {
        dimension: 1, // Explicitly evaluate displayVal at index 1
        min: minScale,
        max: maxScale,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 12,
        itemHeight: dims.isMobile ? 120 : 180,
        itemWidth: dims.isMobile ? 11 : 14,
        inRange: {
          color: THEME_COLORS.heatmapGradient,
        },
        text: [
          `High (${maxScale}${metricConfig.shortUnit})`,
          `Low (${minScale}${metricConfig.shortUnit})`,
        ],
        textStyle: { color: THEME_COLORS.textMuted, fontSize: 11 },
      },
      calendar: {
        top: dims.isMobile ? 35 : 45,
        left: dims.isMobile ? 28 : 45,
        right: dims.isMobile ? 18 : 32,
        range: [yearlyData.startDate, yearlyData.endDate],
        cellSize: ['auto', dims.isMobile ? 14 : 18],
        splitLine: {
          show: false, // Clean blank canvas without grid lines across unrecorded slots
        },
        itemStyle: {
          color: 'transparent', // Unrecorded days are completely blank
          borderColor: 'transparent',
          borderWidth: 0,
        },
        yearLabel: { show: false },
        dayLabel: {
          firstDay: 0,
          nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
          color: THEME_COLORS.textMuted,
          fontSize: dims.isMobile ? 9 : 10,
        },
        monthLabel: {
          color: THEME_COLORS.textSecondary,
          fontSize: dims.isMobile ? 10 : 11,
          fontWeight: 600,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: observedCalendarData, // ONLY observed days are rendered
          itemStyle: {
            borderColor: THEME_COLORS.bgSurface,
            borderWidth: 1.5,
            borderRadius: 2,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 6,
              shadowColor: 'rgba(0, 0, 0, 0.25)',
              borderColor: THEME_COLORS.textPrimary,
              borderWidth: 2,
            },
          },
        },
      ],
    };
  } else {
    // ==========================================
    // Mode 2: 12 Months x 24 Hours Seasonal Matrix
    // Unrecorded hour slots are completely blank
    // ==========================================
    const monthLabels = monthSummary.map((m) => m.monthName);
    const hourLabels = HOURS_OF_DAY.map((h) => h.label);
    const step = dims.isMobile ? 6 : dims.containerWidth < 960 ? 4 : 2;

    const observedMonthHourMatrix = monthHourMatrix.filter((d) => d[3] > 0 && d[2] !== null && d[2] >= 0);

    option = {
      backgroundColor: 'transparent',
      tooltip: {
        confine: true,
        position: getClampedTooltipPosition,
        backgroundColor: THEME_COLORS.bgSurface,
        borderColor: THEME_COLORS.border,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: THEME_COLORS.textPrimary, fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 8px; z-index: 9999; pointer-events: none;',
        formatter: function (params) {
          if (!params || !params.data) return '';
          const [hourIdx, monthIdx, displayVal, count, medVal, avgVal, maxVal] = params.data;
          const monthName = monthLabels[monthIdx];
          const hourLabel = formatHour(hourIdx);

          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:4px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${monthName} at ${hourLabel} (EDT)
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">${aggLabel}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(displayVal, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Monthly Hour Peak:</span>
              <strong style="color:${THEME_COLORS.peak};">${formatMetricValue(maxVal, metricKey)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Sample Count:</span>
              <span style="color:${THEME_COLORS.textPrimary};font-weight:500;">${count} trips</span>
            </div>
            <div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${THEME_COLORS.border};color:${THEME_COLORS.primary};font-size:0.75rem;font-weight:500;">
              👉 Click to open Monthly View for ${monthName}
            </div>
          `;
        },
      },
      grid: {
        top: dims.isMobile ? 12 : 16,
        left: dims.computedLeft,
        width: dims.gridWidth,
        height: dims.gridHeight,
      },
      xAxis: {
        type: 'category',
        data: hourLabels,
        splitArea: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: THEME_COLORS.textMuted,
          fontSize: dims.isMobile ? 9 : 10,
          interval: (idx) => idx % step === 0,
          formatter: (val, idx) => (idx % step === 0 ? val : ''),
        },
        axisLine: { lineStyle: { color: THEME_COLORS.border } },
      },
      yAxis: {
        type: 'category',
        data: monthLabels,
        inverse: true, // Jan at top, Dec at bottom
        splitArea: { show: false },
        splitLine: { show: false },
        axisLabel: {
          fontSize: dims.isMobile ? 10 : 11,
          fontWeight: 600,
          color: THEME_COLORS.textSecondary,
        },
        axisLine: { lineStyle: { color: THEME_COLORS.border } },
      },
      visualMap: {
        dimension: 2, // Explicitly evaluate displayVal at index 2
        min: minScale,
        max: maxScale,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: dims.isMobile ? 6 : 10,
        itemHeight: dims.isMobile ? 120 : 180,
        itemWidth: dims.isMobile ? 11 : 14,
        inRange: {
          color: THEME_COLORS.heatmapGradient,
        },
        text: [
          `High (${maxScale}${metricConfig.shortUnit})`,
          `Low (${minScale}${metricConfig.shortUnit})`,
        ],
        textStyle: { color: THEME_COLORS.textMuted, fontSize: dims.isMobile ? 10 : 11 },
      },
      series: [
        {
          name: metricConfig.label,
          type: 'heatmap',
          data: observedMonthHourMatrix, // ONLY observed readings are drawn; unrecorded slots are completely blank
          label: { show: false },
          itemStyle: {
            borderColor: THEME_COLORS.bgSurface,
            borderWidth: 1.5,
            borderRadius: 2,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 6,
              shadowColor: 'rgba(0, 0, 0, 0.25)',
              borderColor: THEME_COLORS.textPrimary,
              borderWidth: 2,
            },
          },
        },
      ],
    };
  }

  chartInstance.setOption(option, true);
  chartInstance.resize();

  // Attach click listener
  chartInstance.off('click');
  chartInstance.on('click', (params) => {
    if (!params || !params.data) return;
    if (!isSeasonalMode) {
      // Calendar Mode -> drill down to clicked Date
      const clickedDate = params.data[0];
      if (clickedDate && currentCallbacks && typeof currentCallbacks.onSelectDate === 'function') {
        currentCallbacks.onSelectDate(clickedDate);
      }
    } else {
      // Seasonal Mode -> drill down to clicked Month
      const monthIdx = params.data[1];
      let clickedMonthStr = yearlyData.monthSummary[monthIdx]?.monthStr;
      if (clickedMonthStr && clickedMonthStr.length === 2) {
        const curY = state.selectedYear || (state.selectedMonth ? state.selectedMonth.substring(0, 4) : '2026');
        clickedMonthStr = `${curY}-${clickedMonthStr}`;
      }
      if (clickedMonthStr && currentCallbacks && typeof currentCallbacks.onSelectMonth === 'function') {
        currentCallbacks.onSelectMonth(clickedMonthStr);
      }
    }
  });
}

export function disposeYearlyHeatmapChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

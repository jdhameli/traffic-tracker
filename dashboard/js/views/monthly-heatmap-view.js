/**
 * Monthly Heatmap View (Day of Month vs. 30-Minute Interval in EDT & Calendar Grid).
 * Provides granular 30-minute square readings across all 28-31 days of the selected month.
 * Unrecorded slots are completely blank; recorded slots are rendered as vibrant heat squares.
 * Supports clicking any reading to drill down into the Daily View.
 */

import { buildMonthlyHeatmapMatrix } from '../utils/stats-engine.js';
import { METRIC_CONFIGS, formatMetricValue } from '../utils/metric-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';
import { updateChartHeader } from '../utils/chart-header.js';
import { TIME_SLOTS_30MIN, formatTimeSlot, formatHour } from '../utils/time-utils.js';
import { getSafeContainerWidth, getClampedTooltipPosition } from '../utils/chart-helpers.js';

let chartInstance = null;
let currentCallbacks = null;

function calculateMonthlyDimensions(containerEl, daysInMonth, isCalendarMode = false) {
  const containerWidth = getSafeContainerWidth(containerEl);
  const isMobile = containerWidth < 640;

  if (isCalendarMode) {
    const totalHeight = isMobile ? 420 : 480;
    return { isMobile, containerWidth, totalHeight };
  }

  // 48 30-minute slots along X-axis x daysInMonth rows along Y-axis
  const leftMargin = isMobile ? 54 : 76;
  const rightMargin = isMobile ? 18 : 32; // Generous safe margin so rightmost column is NEVER cut off
  const availableWidth = Math.max(containerWidth - leftMargin - rightMargin, 48 * 6);

  // Exact Square aspect ratio: cell width === cell height
  const cellSize = Math.max(Math.floor(availableWidth / 48), 6);
  const gridWidth = cellSize * 48;
  const gridHeight = cellSize * daysInMonth;
  const totalHeight = gridHeight + (isMobile ? 115 : 130);
  // Guarantee right edge safety: computedLeft + gridWidth <= containerWidth - rightMargin
  const maxLeft = Math.max(leftMargin, containerWidth - gridWidth - rightMargin);
  const computedLeft = Math.max(leftMargin, Math.min(maxLeft, Math.floor((containerWidth - gridWidth) / 2)));

  return { cellSize, gridWidth, gridHeight, totalHeight, computedLeft, isMobile, containerWidth };
}

export function renderMonthlyHeatmapView(containerEl, records, state, callbacks = {}) {
  currentCallbacks = callbacks;
  const useMedian = !!state.monthlyUseMedian;
  const targetPeriod = state.selectedDate || (state.selectedMonth ? `${state.selectedMonth}-01` : '2026-10-04');
  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;
  const mode = state.monthlyHeatmapMode || 'matrix'; // 'matrix' or 'calendar'
  const isCalendarMode = mode === 'calendar';

  const matrixResult = buildMonthlyHeatmapMatrix(records, targetPeriod, metricKey, {
    useMedian,
    numDays: 28,
    allTime: useMedian,
  });

  const { daysInMonth, dayLabels, weekendDayIndices, slotLabels, matrixData, calendarDays, monthlyStats } = matrixResult;

  // Apply height first so scrollbar appearance doesn't throw off clientWidth
  const prelimDims = calculateMonthlyDimensions(containerEl, daysInMonth, isCalendarMode);
  containerEl.style.height = `${prelimDims.totalHeight}px`;
  const dims = calculateMonthlyDimensions(containerEl, daysInMonth, isCalendarMode);
  containerEl.style.height = `${dims.totalHeight}px`;

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      renderMonthlyHeatmapView(containerEl, records, state, callbacks);
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const displayRange = useMedian ? 'All-Time Historical Median' : `${matrixResult.startDate} – ${matrixResult.endDate}`;

  // Update decoupled responsive HTML header
  const subtitle = useMedian
    ? (isCalendarMode
        ? `All-Time Daily ${metricConfig.label} performance across Days 1–31 (EDT)`
        : `All-Time Median 30-minute square commute intervals across Days 1–31 (EDT)`)
    : (isCalendarMode
        ? `Daily ${metricConfig.label} performance • Click any date to open detailed Daily View`
        : `30-minute square commute intervals across 4 weeks (${daysInMonth} days) • Click any reading to inspect Daily View`);

  updateChartHeader({
    title: `Monthly ${metricConfig.label} Heatmap: ${displayRange} (EDT)`,
    subtitle,
    unit: metricConfig.unit,
    metricLabel: metricConfig.label,
  });

  if (!records || records.length === 0 || monthlyStats.totalObservations === 0) {
    chartInstance.clear();
    containerEl.innerHTML = `
      <div class="chart-empty-state">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3>No Observations in ${displayRange}</h3>
        <p>No traffic records recorded for this route in this period. Use the navigator above to browse recorded periods.</p>
      </div>
    `;
    chartInstance = null;
    return;
  }

  // Filter ONLY cells that have recorded data (unrecorded slots are left completely blank)
  const observedMatrixData = matrixData.filter((d) => d[3] > 0 && d[2] !== null);
  const observedVals = isCalendarMode
    ? calendarDays.filter((d) => d.count > 0 && d.avgValue !== null).map((d) => d.avgValue)
    : observedMatrixData.map((d) => d[2]);

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

  if (!isCalendarMode) {
    // ==========================================
    // Mode 1: 48 30-Min Intervals (X) x Days of Month (Y) Square Matrix
    // ==========================================
    const step = dims.isMobile ? 12 : dims.containerWidth < 960 ? 6 : 4;

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
          const [slotIdx, dayIdx, displayVal, count, medVal, avgVal, maxVal, dateStr] = params.data;
          const timeLabel = formatTimeSlot(slotIdx);

          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:4px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${dateStr} (${dayLabels[dayIdx]}) at ${timeLabel} (EDT)
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Avg ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(displayVal, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Median:</span>
              <strong style="color:${THEME_COLORS.textPrimary};">${formatMetricValue(medVal, metricKey)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Peak:</span>
              <strong style="color:${THEME_COLORS.peak};">${formatMetricValue(maxVal, metricKey)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textMuted};">
              <span>Sample Count:</span>
              <span style="color:${THEME_COLORS.textPrimary};font-weight:500;">${count} trips</span>
            </div>
            <div style="margin-top:6px;padding-top:4px;border-top:1px dashed ${THEME_COLORS.border};color:${THEME_COLORS.primary};font-size:0.75rem;font-weight:500;">
              👉 Click to open Daily View for ${dateStr}
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
        data: slotLabels,
        splitArea: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: THEME_COLORS.textMuted,
          fontSize: dims.isMobile ? 9 : 10,
          interval: (idx) => idx % step === 0,
          formatter: (val, idx) => {
            if (idx % step !== 0) return '';
            const slot = TIME_SLOTS_30MIN[idx];
            return slot ? slot.hourOnlyLabel : val;
          },
        },
        axisLine: { lineStyle: { color: THEME_COLORS.border } },
      },
      yAxis: {
        type: 'category',
        data: dayLabels,
        inverse: true, // Day 1 at top, Day 31 at bottom
        splitArea: { show: false },
        splitLine: { show: false },
        axisLabel: {
          fontSize: dims.isMobile ? 9 : 11,
          fontWeight: 500,
          color: (val, idx) => (weekendDayIndices.has(idx) ? THEME_COLORS.textMuted : THEME_COLORS.textSecondary),
        },
        axisLine: { lineStyle: { color: THEME_COLORS.border } },
      },
      visualMap: {
        dimension: 2, // Explicitly map displayVal at index 2
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
        textStyle: {
          color: THEME_COLORS.textMuted,
          fontSize: dims.isMobile ? 10 : 11,
        },
      },
      series: [
        {
          name: metricConfig.label,
          type: 'heatmap',
          data: observedMatrixData, // ONLY observed readings are drawn; unrecorded slots are completely blank
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
  } else {
    // ==========================================
    // Mode 2: Calendar Month Coordinate System
    // ==========================================
    const calendarData = calendarDays
      .filter((d) => d.count > 0 && d.avgValue !== null)
      .map((d) => [d.dateStr, d.avgValue, d.count, d.maxValue, d.peakHour, d.medianValue]);

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
          const [dateStr, avgVal, count, maxVal, peakHour, medVal] = params.data;
          const peakHourStr = peakHour !== null && peakHour !== undefined ? formatHour(peakHour) : '--';

          return `
            <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:4px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
              ${dateStr} (EDT)
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Daily Avg ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.primary}; font-size:1.05rem;">
                ${formatMetricValue(avgVal, metricKey, true)}
              </strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
              <span style="color:${THEME_COLORS.textSecondary};">Peak ${metricConfig.label}:</span>
              <strong style="color:${THEME_COLORS.peak};">
                ${formatMetricValue(maxVal, metricKey)} (at ${peakHourStr})
              </strong>
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
        dimension: 1, // Explicitly evaluate avgVal at index 1
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
        top: dims.isMobile ? 25 : 35,
        left: 'center',
        range: [matrixResult.startDate, matrixResult.endDate],
        cellSize: [dims.isMobile ? 42 : 64, dims.isMobile ? 42 : 56],
        splitLine: {
          show: false,
        },
        itemStyle: {
          color: 'transparent', // Unrecorded days are completely blank
          borderColor: 'transparent',
          borderWidth: 0,
        },
        yearLabel: { show: false },
        monthLabel: { show: false },
        dayLabel: {
          firstDay: 0,
          nameMap: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          color: THEME_COLORS.textSecondary,
          fontSize: dims.isMobile ? 10 : 12,
          fontWeight: 600,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: calendarData,
          itemStyle: {
            borderColor: THEME_COLORS.bgSurface,
            borderWidth: 2,
            borderRadius: 4,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
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

  // Attach click listener to drill down into Daily View
  chartInstance.off('click');
  chartInstance.on('click', (params) => {
    if (!params || !params.data) return;
    let clickedDate = null;
    if (isCalendarMode) {
      clickedDate = params.data[0];
    } else {
      clickedDate = params.data[7]; // dateStr is 8th item in matrixData
    }

    if (clickedDate && currentCallbacks && typeof currentCallbacks.onSelectDate === 'function') {
      currentCallbacks.onSelectDate(clickedDate);
    }
  });
}

export function disposeMonthlyHeatmapChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

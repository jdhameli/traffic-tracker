/**
 * View 1: Heatmap View (Day of Week vs. Hour of Day in EDT).
 * Uses standard unified theme palette.
 */

import { buildHeatmapMatrix } from '../utils/stats-engine.js';
import { DAYS_OF_WEEK, TIME_SLOTS_30MIN, formatTimeSlot, getWeekRangeEDT } from '../utils/time-utils.js';
import { METRIC_CONFIGS, formatMetricValue } from '../utils/metric-utils.js';
import { THEME_COLORS } from '../utils/theme-constants.js';

let chartInstance = null;

function calculateHeatmapDimensions(containerEl) {
  const containerWidth = containerEl.parentElement?.clientWidth || containerEl.clientWidth || 960;
  const isMobile = containerWidth < 640;
  const leftMargin = isMobile ? 38 : 55;
  const rightMargin = isMobile ? 12 : 25;
  const availableWidth = Math.max(containerWidth - leftMargin - rightMargin, 48 * 8);
  const cellSize = Math.max(Math.floor(availableWidth / 48), 6);
  const gridWidth = cellSize * 48;
  const gridHeight = cellSize * 7;
  const totalHeight = gridHeight + (isMobile ? 170 : 190);
  const computedLeft = Math.max(leftMargin, Math.floor((containerWidth - gridWidth) / 2));

  return { cellSize, gridWidth, gridHeight, totalHeight, computedLeft, isMobile, containerWidth };
}

export function renderHeatmapView(containerEl, records, state) {
  const dims = calculateHeatmapDimensions(containerEl);
  containerEl.style.height = `${dims.totalHeight}px`;

  chartInstance = echarts.getInstanceByDom(containerEl);
  if (!chartInstance) {
    chartInstance = echarts.init(containerEl, null, { renderer: 'svg' });
  }

  const handleResize = () => {
    if (chartInstance && containerEl.isConnected) {
      const updatedDims = calculateHeatmapDimensions(containerEl);
      containerEl.style.height = `${updatedDims.totalHeight}px`;
      chartInstance.setOption({
        grid: {
          left: updatedDims.computedLeft,
          width: updatedDims.gridWidth,
          height: updatedDims.gridHeight,
        },
      });
      chartInstance.resize();
    }
  };
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  const metricKey = state.selectedMetric || 'travel_time_min';
  const metricConfig = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;
  const useMedian = !!state.heatmapUseMedian;

  const { startDate, endDate, days } = getWeekRangeEDT(state.selectedDate || '2026-10-05');

  if (!records || records.length === 0) {
    chartInstance.clear();
    containerEl.innerHTML = `
      <div class="chart-empty-state">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <h3>No Data Available</h3>
        <p>No observations found for this route and direction to generate a heatmap.</p>
      </div>
    `;
    chartInstance = null;
    return;
  }

  const matrixData = buildHeatmapMatrix(records, metricKey, {
    weekDays: days,
    useMedian,
  });
  const slotLabels = TIME_SLOTS_30MIN.map((s) => s.fullLabel);

  const observedCells = matrixData.filter((d) => d[3] > 0);
  const observedVals = observedCells.map((d) => d[2]);

  let minScale = 0;
  let maxScale = 2;

  if (observedVals.length > 0) {
    const rawMin = Math.min(...observedVals);
    const rawMax = Math.max(...observedVals);

    if (metricKey === 'traffic_delay_min') {
      // For delay: 0 delay is free-flow green, max delay is red
      minScale = 0;
      maxScale = rawMax > 0 ? Number(rawMax.toFixed(1)) : 1;
    } else {
      // For travel time, baseline time, distance: calibrate across the actual observed span
      if (rawMin === rawMax) {
        minScale = Math.max(0, Number((rawMin - 1).toFixed(1)));
        maxScale = Number((rawMax + 1).toFixed(1));
      } else {
        minScale = Number(rawMin.toFixed(1));
        maxScale = Number(rawMax.toFixed(1));
      }
    }
  }

  const formattedMatrixData = matrixData.map(([s, d, displayVal, count, medVal, avgVal]) => {
    const visualVal = count === 0 ? null : displayVal;
    return [s, d, visualVal, count, medVal, avgVal, displayVal];
  });

  const subtitleText = useMedian
    ? `All-Time Historical Median • Day of Week vs. 30-Min Intervals (EDT)`
    : `Week of ${startDate} – ${endDate} (EDT) • Day of Week vs. 30-Min Intervals`;

  // Determine legible step intervals for X-axis labels
  const step = dims.isMobile ? 12 : dims.containerWidth < 960 ? 6 : 4;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${metricConfig.label} Heatmap (EDT)`,
      subtext: subtitleText,
      left: 'left',
      textStyle: {
        color: THEME_COLORS.textPrimary,
        fontSize: dims.isMobile ? 13 : 15,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
      },
      subtextStyle: {
        color: THEME_COLORS.textMuted,
        fontSize: dims.isMobile ? 11 : 12,
      },
    },
    tooltip: {
      position: 'top',
      backgroundColor: THEME_COLORS.bgSurface,
      borderColor: THEME_COLORS.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: {
        color: THEME_COLORS.textPrimary,
        fontSize: 12,
      },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 8px;',
      formatter: function (params) {
        const [slotIdx, dayIdx, , count, medVal, avgVal, displayVal] = params.data;
        const dayName = DAYS_OF_WEEK[dayIdx];
        const timeLabel = formatTimeSlot(slotIdx);

        if (count === 0) {
          return `
            <div style="font-weight:600;margin-bottom:4px;color:${THEME_COLORS.textPrimary};">${dayName} at ${timeLabel} EDT</div>
            <div style="color:${THEME_COLORS.textMuted};font-size:0.8rem;">No recorded observations</div>
          `;
        }

        return `
          <div style="font-weight:600;border-bottom:1px solid ${THEME_COLORS.borderSplit};padding-bottom:4px;margin-bottom:6px;color:${THEME_COLORS.textPrimary};">
            ${dayName} at ${timeLabel} (EDT)
          </div>
          <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
            <span style="color:${THEME_COLORS.textSecondary};">${useMedian ? 'Median' : 'Avg'} ${metricConfig.label}:</span>
            <strong style="color:${THEME_COLORS.primary};">
              ${formatMetricValue(displayVal, metricKey, true)}
            </strong>
          </div>
          <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;">
            <span style="color:${THEME_COLORS.textSecondary};">${useMedian ? 'Avg' : 'Median'} ${metricConfig.label}:</span>
            <strong style="color:${THEME_COLORS.textPrimary};">${formatMetricValue(useMedian ? avgVal : medVal, metricKey)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;gap:18px;margin:3px 0;font-size:0.8rem;color:${THEME_COLORS.textSecondary};">
            <span>Sample Count:</span>
            <span style="color:${THEME_COLORS.textPrimary};font-weight:500;">${count} observations</span>
          </div>
        `;
      },
    },
    grid: {
      top: 65,
      left: dims.computedLeft,
      width: dims.gridWidth,
      height: dims.gridHeight,
    },
    xAxis: {
      type: 'category',
      data: slotLabels,
      splitArea: {
        show: true,
        areaStyle: {
          color: [THEME_COLORS.bgSubtle, THEME_COLORS.bgSurface],
        },
      },
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
      data: DAYS_OF_WEEK,
      splitArea: { show: true },
      axisLabel: {
        color: THEME_COLORS.textSecondary,
        fontSize: dims.isMobile ? 10 : 12,
        fontWeight: 500,
      },
      axisLine: { lineStyle: { color: THEME_COLORS.border } },
    },
    visualMap: {
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
        data: formattedMatrixData,
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

  chartInstance.setOption(option, true);
  chartInstance.resize();
}

export function disposeHeatmapChart() {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
}

/**
 * View 1: Weekly Heatmap View (Day of Week vs. 30-Minute Interval in EDT).
 * Powered by Observable Plot with enhanced color range, tight square grid, and hover tooltips.
 */

import * as Plot from '@observablehq/plot';
import { buildHeatmapMatrix } from '../utils/stats-engine.js';
import { DAYS_OF_WEEK, formatTimeSlot, getRollingWeekRangeEDT } from '../utils/time-utils.js';
import { formatTravelTime } from '../utils/metric-utils.js';
import { updateChartHeader } from '../utils/chart-header.js';
import { mountPlot, renderEmptyState, travelTimeColor, TIP_STYLE } from '../utils/plot-theme.js';

let activeMount = null;

export function renderHeatmapView(containerEl, records, state, callbacks = {}) {
  disposeHeatmapChart();

  const useMedian = state.heatmapUseMedian !== false;
  const targetDate =
    state.selectedDate ||
    (state.routeData?.availableDates?.length
      ? state.routeData.availableDates[state.routeData.availableDates.length - 1]
      : '2026-10-25');
  const { startDate, endDate, days } = getRollingWeekRangeEDT(targetDate);

  const subtitleText = useMedian
    ? 'All-Time Historical Median • Day of Week vs. 30-Min Intervals (EDT)'
    : `7-Day Commute Window: ${startDate} – ${endDate} (EDT) • 30-Min Intervals • Hover square for details • Click to inspect Daily View`;

  if (!records || records.length === 0) {
    updateChartHeader({
      title: 'Weekly Travel Time Heatmap (EDT)',
      subtitle: subtitleText,
      unit: 'min',
      metricLabel: 'Travel Time',
    });
    renderEmptyState(containerEl, {
      title: 'No Data Available',
      message: 'No observations found for this route and direction to generate a weekly heatmap.',
    });
    return;
  }

  const matrixData = buildHeatmapMatrix(records, {
    weekDays: days,
    useMedian,
  });

  // Only observed cells are drawn; unrecorded slots are left blank
  const observedCells = matrixData.filter((d) => d.count > 0 && d.value !== null);

  if (observedCells.length === 0) {
    updateChartHeader({
      title: 'Weekly Travel Time Heatmap (EDT)',
      subtitle: subtitleText,
      unit: 'min',
      metricLabel: 'Travel Time',
    });
    renderEmptyState(containerEl, {
      title: 'No Observations in Selected Window',
      message: 'No traffic records recorded for this route in the selected week.',
    });
    return;
  }

  const vals = observedCells.map((d) => d.value);
  const minVal = vals.length > 0 ? Math.min(...vals) : null;
  const maxVal = vals.length > 0 ? Math.max(...vals) : null;

  updateChartHeader({
    title: 'Weekly Travel Time Heatmap (EDT)',
    subtitle: subtitleText,
    unit: 'min',
    metricLabel: 'Travel Time',
    minVal,
    maxVal,
  });

  // Y domain: day labels in Sun-Sat order
  const dayOrder = useMedian
    ? DAYS_OF_WEEK
    : days.map((dateStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        const dayName = DAYS_OF_WEEK[dt.getUTCDay()];
        return `${dayName} ${dateStr.substring(5)}`;
      });

  activeMount = mountPlot(
    containerEl,
    (width) => {
      const isMobile = width < 640;
      const leftMargin = isMobile ? 54 : 80;
      const rightMargin = isMobile ? 14 : 24;
      const availableWidth = Math.max(width - leftMargin - rightMargin, 300);
      const cellSize = Math.max(Math.floor(availableWidth / 48), isMobile ? 12 : 16);
      const gridWidth = cellSize * 48;
      const gridHeight = cellSize * 7;
      const marginTop = 20;
      const marginBottom = isMobile ? 52 : 45;
      const plotWidth = leftMargin + gridWidth + rightMargin;
      const plotHeight = marginTop + gridHeight + marginBottom;

      return Plot.plot({
        width: plotWidth,
        height: plotHeight,
        marginTop,
        marginRight: rightMargin,
        marginBottom,
        marginLeft: leftMargin,
        color: travelTimeColor(vals),
        x: {
          domain: Array.from({ length: 48 }, (_, i) => i),
          padding: 0, // Keep squares tightly packed together
          ticks: isMobile ? [0, 12, 24, 36] : [0, 6, 12, 18, 24, 30, 36, 42],
          tickFormat: (slot) => {
            const h = Math.floor(slot / 2);
            if (h === 0 || h === 24) return '12 AM';
            if (h === 12) return '12 PM';
            return h < 12 ? `${h} AM` : `${h - 12} PM`;
          },
          label: null,
        },
        y: {
          domain: dayOrder,
          padding: 0, // Keep squares tightly packed together
          label: null,
          tickSize: 0,
        },
        marks: [
          // Heatmap colored squares (tightly packed, no in-cell text)
          Plot.cell(observedCells, {
            x: 'slot',
            y: 'dayLabel',
            fill: 'value',
            inset: 0.5,
            rx: 1,
          }),
          // Hover/Tap Tooltip on EVERY square
          Plot.tip(
            observedCells,
            Plot.pointer({
              x: 'slot',
              y: 'dayLabel',
              ...TIP_STYLE,
              title: (d) => {
                const header = d.dateStr ? `${d.dateStr} (${d.dayLabel})` : d.dayLabel;
                const lines = [
                  `${header} at ${formatTimeSlot(d.slot)} EDT`,
                  `Average       ${formatTravelTime(d.mean, true)}`,
                  `Median        ${formatTravelTime(d.median)}`,
                  `Min – Max     ${formatTravelTime(d.min)} – ${formatTravelTime(d.max)}`,
                  `Observations  ${d.count} trip${d.count === 1 ? '' : 's'}`,
                ];
                if (!useMedian && d.dateStr) {
                  lines.push('👉 Click square to open Daily View');
                }
                return lines.join('\n');
              },
            })
          ),
        ],
      });
    },
    {
      minVal,
      maxVal,
      unit: 'min',
      onClickDatum: (datum) => {
        if (!useMedian && datum?.dateStr && typeof callbacks.onSelectDate === 'function') {
          callbacks.onSelectDate(datum.dateStr);
        }
      },
    }
  );
}

export function disposeHeatmapChart() {
  if (activeMount) {
    activeMount.dispose();
    activeMount = null;
  }
}

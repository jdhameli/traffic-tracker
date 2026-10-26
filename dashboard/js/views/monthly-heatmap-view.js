/**
 * Monthly Heatmap View (4-Week 30-Minute Square Matrix).
 * "Like weekly but taller" — provides 28 consecutive days x 48 slots.
 * Powered by Observable Plot with tight square grid and hover tooltips.
 */

import * as Plot from '@observablehq/plot';
import { buildMonthlyHeatmapMatrix } from '../utils/stats-engine.js';
import { formatTravelTime } from '../utils/metric-utils.js';
import { formatTimeSlot, get4WeekRangeEDT } from '../utils/time-utils.js';
import { updateChartHeader } from '../utils/chart-header.js';
import { mountPlot, renderEmptyState, travelTimeColor, TIP_STYLE } from '../utils/plot-theme.js';

let activeMount = null;

export function renderMonthlyHeatmapView(containerEl, records, state, callbacks = {}) {
  disposeMonthlyHeatmapChart();

  const targetDate =
    state.selectedDate ||
    (state.routeData?.availableDates?.length
      ? state.routeData.availableDates[state.routeData.availableDates.length - 1]
      : '2026-10-25');
  const { startDate, endDate, days } = get4WeekRangeEDT(targetDate);

  const matrixResult = buildMonthlyHeatmapMatrix(records, days, {
    useMedian: false,
    numDays: 28,
    allTime: false,
  });

  const { daysInMonth, dayLabels, matrixData, monthlyStats } = matrixResult;
  const displayRange = `${startDate} – ${endDate}`;
  const subtitle = `4-Week Commute Window: ${startDate} – ${endDate} (EDT) • 30-Min Intervals • Hover square for details • Click to inspect Daily View`;

  if (!records || records.length === 0 || monthlyStats.totalObservations === 0) {
    updateChartHeader({
      title: `Monthly Travel Time Heatmap: ${displayRange} (EDT)`,
      subtitle,
      unit: 'min',
      metricLabel: 'Travel Time',
    });
    renderEmptyState(containerEl, {
      title: `No Observations in ${displayRange}`,
      message: 'No traffic records recorded for this route in this period.',
    });
    return;
  }

  const observedCells = matrixData.filter((d) => d.count > 0 && d.value !== null);
  const vals = observedCells.map((d) => d.value);
  const minVal = vals.length > 0 ? Math.min(...vals) : null;
  const maxVal = vals.length > 0 ? Math.max(...vals) : null;

  updateChartHeader({
    title: `Monthly Travel Time Heatmap: ${displayRange} (EDT)`,
    subtitle,
    unit: 'min',
    metricLabel: 'Travel Time',
    minVal,
    maxVal,
  });

  activeMount = mountPlot(
    containerEl,
    (width) => {
      const isMobile = width < 640;
      const leftMargin = isMobile ? 54 : 86;
      const rightMargin = isMobile ? 14 : 24;
      const availableWidth = Math.max(width - leftMargin - rightMargin, 300);
      const cellSize = Math.max(Math.floor(availableWidth / 48), isMobile ? 10 : 14);
      const gridWidth = cellSize * 48;
      const gridHeight = cellSize * daysInMonth;
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
          domain: dayLabels,
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
                if (d.dateStr) {
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
        if (datum?.dateStr && typeof callbacks.onSelectDate === 'function') {
          callbacks.onSelectDate(datum.dateStr);
        }
      },
    }
  );
}

export function disposeMonthlyHeatmapChart() {
  if (activeMount) {
    activeMount.dispose();
    activeMount = null;
  }
}

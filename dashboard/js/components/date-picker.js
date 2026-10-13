/**
 * Contextual Date Picker & Navigator for Weekly Heatmap, Daily View, Monthly Heatmap, and Yearly Heatmap.
 *
 * Navigation Advancing Speeds:
 * - Weekly View: Advances by day (◀ / ▶) and jumps by week (« / »). All-Time Median toggle supported.
 * - Daily View: Advances by day (◀ / ▶) and jumps by week (« / »).
 * - Monthly View: Advances by week (◀ / ▶) and jumps by month (« / »). All-Time Median toggle supported.
 * - Yearly View: Advances by month (◀ / ▶) and jumps by year (« / »). All-Time Median toggle supported.
 */

import { stateStore } from '../state.js';
import { parseToEDT, getRollingWeekRangeEDT, shiftDateStr, shiftMonthStr } from '../utils/time-utils.js';

function getYearlyRollingLabel(curMonthStr) {
  const [y, m] = curMonthStr.split('-').map(Number);
  const startDt = new Date(Date.UTC(y, m - 1 - 11, 1, 12, 0, 0));
  const endDt = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const sName = startDt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const sYr = String(startDt.getUTCFullYear()).slice(-2);
  const eName = endDt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const eYr = String(endDt.getUTCFullYear()).slice(-2);
  return `${sName} '${sYr} – ${eName} '${eYr}`;
}

export function initDatePicker(
  containerEl,
  onChangeDate,
  onChangeMonth,
  onToggleHeatmapMedian,
  onChangeYear,
  onToggleMonthlyMode,
  onToggleYearlyMode,
  onToggleYearlyMetric,
  onToggleMonthlyMedian,
  onToggleYearlyMedian
) {
  function render(state) {
    const {
      selectedView,
      selectedDate,
      selectedMonth,
      selectedYear,
      heatmapUseMedian,
      monthlyUseMedian,
      yearlyUseMedian,
      monthlyHeatmapMode = 'matrix',
      yearlyHeatmapMode = 'calendar',
      yearlyHeatmapMetricType = 'avg',
      routeData,
    } = state;

    if (!selectedDate && !selectedMonth && !selectedYear) {
      containerEl.innerHTML = '';
      return;
    }

    const availableMonths = routeData?.availableMonths || [];
    const availableDates = routeData?.availableDates || [];

    // 1. Weekly Heatmap: Advances by Day (◀ / ▶), Jumps by Week (« / »), All-Time Median toggle
    if (selectedView === 'heatmap' || selectedView === 'weekly') {
      const targetDate = selectedDate || availableDates[availableDates.length - 1] || '2026-10-04';
      const { startDate, endDate } = getRollingWeekRangeEDT(targetDate, 7);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            ${
              !heatmapUseMedian
                ? `
              <button type="button" class="date-nav-btn jump-btn" id="prev-hm-jump-week-btn" title="Previous Week (7 Days)">
                «
              </button>
              <button type="button" class="date-nav-btn step-btn" id="prev-hm-step-day-btn" title="Previous Day">
                ◀
              </button>
              <div class="date-current-display">
                <span class="date-week-tag">Week: <strong>${startDate}</strong> – <strong>${endDate}</strong> (EDT)</span>
              </div>
              <button type="button" class="date-nav-btn step-btn" id="next-hm-step-day-btn" title="Next Day">
                ▶
              </button>
              <button type="button" class="date-nav-btn jump-btn" id="next-hm-jump-week-btn" title="Next Week (7 Days)">
                »
              </button>
            `
                : `
              <div class="date-current-display">
                <span class="date-week-tag">Scope: <strong>All-Time Historical Median</strong> (EDT)</span>
              </div>
            `
            }

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${heatmapUseMedian ? 'active' : ''}"
              id="toggle-hm-median-btn"
              title="${heatmapUseMedian ? 'Switch to Selected Week view' : 'Switch to All-Time Median view'}"
            >
              ${heatmapUseMedian ? '📅 View Selected Week' : '📊 Show All-Time Median'}
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#prev-hm-step-day-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, -1));
      });

      containerEl.querySelector('#next-hm-step-day-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, 1));
      });

      containerEl.querySelector('#prev-hm-jump-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, -7));
      });

      containerEl.querySelector('#next-hm-jump-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, 7));
      });

      containerEl.querySelector('#toggle-hm-median-btn')?.addEventListener('click', () => {
        if (onToggleHeatmapMedian) {
          onToggleHeatmapMedian(!heatmapUseMedian);
        }
      });

      return;
    }

    // 2. Daily View: Advances by Day (◀ / ▶), Jumps by Week (« / »)
    if (selectedView === 'daily') {
      const targetDate = selectedDate || availableDates[availableDates.length - 1] || '2026-10-04';
      const [y, m, d] = targetDate.split('-').map(Number);
      const curDateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const edtInfo = parseToEDT(curDateObj);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            <button type="button" class="date-nav-btn jump-btn" id="prev-day-jump-week-btn" title="Previous Week (7 Days)">
              «
            </button>
            <button type="button" class="date-nav-btn step-btn" id="prev-day-step-btn" title="Previous Day">
              ◀
            </button>
            <div class="date-current-display">
              <input type="date" id="daily-date-input" class="date-input" value="${targetDate}" />
              <span class="date-weekday-tag">${edtInfo.edtDayOfWeekName}, ${targetDate} (EDT)</span>
            </div>
            <button type="button" class="date-nav-btn step-btn" id="next-day-step-btn" title="Next Day">
              ▶
            </button>
            <button type="button" class="date-nav-btn jump-btn" id="next-day-jump-week-btn" title="Next Week (7 Days)">
              »
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#daily-date-input')?.addEventListener('change', (e) => {
        if (e.target.value) onChangeDate(e.target.value);
      });

      containerEl.querySelector('#prev-day-step-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, -1));
      });

      containerEl.querySelector('#next-day-step-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, 1));
      });

      containerEl.querySelector('#prev-day-jump-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, -7));
      });

      containerEl.querySelector('#next-day-jump-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(targetDate, 7));
      });

      return;
    }

    // 3. Monthly Heatmap: Advances by Week (◀ / ▶), Jumps by Month (« / »), All-Time Median toggle
    if (selectedView === 'monthly_heatmap' || selectedView === 'monthly') {
      const curDate = selectedDate || (selectedMonth ? `${selectedMonth}-01` : (availableDates[availableDates.length - 1] || '2026-10-04'));
      const { startDate, endDate } = getRollingWeekRangeEDT(curDate, 28);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            ${
              !monthlyUseMedian
                ? `
              <button type="button" class="date-nav-btn jump-btn" id="prev-month-jump-btn" title="Previous Month (4 Weeks)">
                «
              </button>
              <button type="button" class="date-nav-btn step-btn" id="prev-month-step-week-btn" title="Previous Week (7 Days)">
                ◀
              </button>
              <div class="date-current-display">
                <span class="date-month-tag">4-Week Window: <strong>${startDate}</strong> – <strong>${endDate}</strong> (EDT)</span>
              </div>
              <button type="button" class="date-nav-btn step-btn" id="next-month-step-week-btn" title="Next Week (7 Days)">
                ▶
              </button>
              <button type="button" class="date-nav-btn jump-btn" id="next-month-jump-btn" title="Next Month (4 Weeks)">
                »
              </button>
            `
                : `
              <div class="date-current-display">
                <span class="date-month-tag">Scope: <strong>All-Time Historical Median (Days 1–31)</strong> (EDT)</span>
              </div>
            `
            }

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${monthlyUseMedian ? 'active' : ''}"
              id="toggle-monthly-median-btn"
              title="${monthlyUseMedian ? 'Switch to Selected 4-Week Window' : 'Switch to All-Time Median view'}"
            >
              ${monthlyUseMedian ? '📅 View Selected Window' : '📊 Show All-Time Median'}
            </button>

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${monthlyHeatmapMode === 'calendar' ? 'active' : ''}"
              id="toggle-monthly-mode-btn"
              title="${monthlyHeatmapMode === 'calendar' ? 'Switch to 30-min Square Matrix' : 'Switch to Monthly Calendar Grid'}"
            >
              ${monthlyHeatmapMode === 'calendar' ? '📊 View 30-min Squares' : '🗓️ View Calendar Grid'}
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#prev-month-step-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(curDate, -7));
      });

      containerEl.querySelector('#next-month-step-week-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(curDate, 7));
      });

      containerEl.querySelector('#prev-month-jump-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(curDate, -28));
      });

      containerEl.querySelector('#next-month-jump-btn')?.addEventListener('click', () => {
        onChangeDate(shiftDateStr(curDate, 28));
      });

      containerEl.querySelector('#toggle-monthly-median-btn')?.addEventListener('click', () => {
        if (onToggleMonthlyMedian) {
          onToggleMonthlyMedian(!monthlyUseMedian);
        }
      });

      containerEl.querySelector('#toggle-monthly-mode-btn')?.addEventListener('click', () => {
        if (onToggleMonthlyMode) {
          const nextMode = monthlyHeatmapMode === 'calendar' ? 'matrix' : 'calendar';
          onToggleMonthlyMode(nextMode);
        }
      });

      return;
    }

    // 4. Yearly Heatmap: Advances by Month (◀ / ▶), Jumps by Year (« / »), All-Time Median toggle
    if (selectedView === 'yearly_heatmap' || selectedView === 'yearly') {
      const curMonth = selectedMonth || (selectedDate ? selectedDate.substring(0, 7) : (selectedYear ? `${selectedYear}-12` : '2026-10'));
      const periodLabel = getYearlyRollingLabel(curMonth);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            ${
              !yearlyUseMedian
                ? `
              <button type="button" class="date-nav-btn jump-btn" id="prev-year-jump-btn" title="Previous Year (12 Months)">
                «
              </button>
              <button type="button" class="date-nav-btn step-btn" id="prev-year-step-month-btn" title="Previous Month">
                ◀
              </button>
              <div class="date-current-display">
                <span class="date-month-tag">12 Months: <strong>${periodLabel}</strong> (EDT)</span>
              </div>
              <button type="button" class="date-nav-btn step-btn" id="next-year-step-month-btn" title="Next Month">
                ▶
              </button>
              <button type="button" class="date-nav-btn jump-btn" id="next-year-jump-btn" title="Next Year (12 Months)">
                »
              </button>
            `
                : `
              <div class="date-current-display">
                <span class="date-month-tag">Scope: <strong>All-Time Historical Median (Jan–Dec)</strong> (EDT)</span>
              </div>
            `
            }

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${yearlyUseMedian ? 'active' : ''}"
              id="toggle-yearly-median-btn"
              title="${yearlyUseMedian ? 'Switch to Selected 12-Month Window' : 'Switch to All-Time Median view'}"
            >
              ${yearlyUseMedian ? '📅 View Selected Window' : '📊 Show All-Time Median'}
            </button>

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${yearlyHeatmapMode === 'seasonal' ? 'active' : ''}"
              id="toggle-yearly-mode-btn"
              title="${yearlyHeatmapMode === 'seasonal' ? 'Switch to 365-Day Annual Calendar' : 'Switch to 12-Month Seasonal Matrix'}"
            >
              ${yearlyHeatmapMode === 'seasonal' ? '📅 365-Day Calendar' : '📊 Seasonal (12-Mo x 24h)'}
            </button>

            <button
              type="button"
              class="heatmap-mode-toggle-btn ${yearlyHeatmapMetricType === 'peak' ? 'active' : ''}"
              id="toggle-yearly-metric-btn"
              title="${yearlyHeatmapMetricType === 'peak' ? 'Switch to Daily Average' : 'Switch to Peak Congestion'}"
            >
              ${yearlyHeatmapMetricType === 'peak' ? '⚡ Peak Congestion' : '📈 Daily Average'}
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#prev-year-step-month-btn')?.addEventListener('click', () => {
        onChangeMonth(shiftMonthStr(curMonth, -1));
      });

      containerEl.querySelector('#next-year-step-month-btn')?.addEventListener('click', () => {
        onChangeMonth(shiftMonthStr(curMonth, 1));
      });

      containerEl.querySelector('#prev-year-jump-btn')?.addEventListener('click', () => {
        onChangeMonth(shiftMonthStr(curMonth, -12));
      });

      containerEl.querySelector('#next-year-jump-btn')?.addEventListener('click', () => {
        onChangeMonth(shiftMonthStr(curMonth, 12));
      });

      containerEl.querySelector('#toggle-yearly-median-btn')?.addEventListener('click', () => {
        if (onToggleYearlyMedian) {
          onToggleYearlyMedian(!yearlyUseMedian);
        }
      });

      containerEl.querySelector('#toggle-yearly-mode-btn')?.addEventListener('click', () => {
        if (onToggleYearlyMode) {
          const nextMode = yearlyHeatmapMode === 'seasonal' ? 'calendar' : 'seasonal';
          onToggleYearlyMode(nextMode);
        }
      });

      containerEl.querySelector('#toggle-yearly-metric-btn')?.addEventListener('click', () => {
        if (onToggleYearlyMetric) {
          const nextType = yearlyHeatmapMetricType === 'peak' ? 'avg' : 'peak';
          onToggleYearlyMetric(nextType);
        }
      });
    }
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.selectedView !== prevState.selectedView ||
      state.selectedDate !== prevState.selectedDate ||
      state.selectedMonth !== prevState.selectedMonth ||
      state.selectedYear !== prevState.selectedYear ||
      state.heatmapUseMedian !== prevState.heatmapUseMedian ||
      state.monthlyUseMedian !== prevState.monthlyUseMedian ||
      state.yearlyUseMedian !== prevState.yearlyUseMedian ||
      state.monthlyHeatmapMode !== prevState.monthlyHeatmapMode ||
      state.yearlyHeatmapMode !== prevState.yearlyHeatmapMode ||
      state.yearlyHeatmapMetricType !== prevState.yearlyHeatmapMetricType ||
      state.routeData !== prevState.routeData
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

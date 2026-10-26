/**
 * Contextual Date Picker & Navigator for Daily View, Weekly Heatmap, and Monthly Heatmap.
 *
 * Navigation Advancing Speeds:
 * - Weekly View: Advances by day (◀ / ▶) and jumps by week (« / »). All-Time Median toggle supported.
 * - Daily View: Advances by day (◀ / ▶) and jumps by week (« / »).
 * - Monthly View: Advances by week (‹ Week / Week ›) and jumps by month (« Month / Month »).
 */

import { stateStore } from '../state.js';
import { parseToEDT, getRollingWeekRangeEDT, get4WeekRangeEDT, shiftDateStr } from '../utils/time-utils.js';

export function initDatePicker(
  containerEl,
  onChangeDate,
  onChangeMonth,
  onToggleHeatmapMedian
) {
  function render(state) {
    const {
      selectedView,
      selectedDate,
      heatmapUseMedian,
      routeData,
    } = state;

    if (!selectedDate) {
      containerEl.innerHTML = '';
      return;
    }

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

    // 3. Monthly Heatmap: Advances by Week (‹ Week / Week ›), Jumps by Month (« Month / Month »)
    if (selectedView === 'monthly_heatmap' || selectedView === 'monthly') {
      const curDate = selectedDate || availableDates[availableDates.length - 1] || '2026-10-04';
      const { startDate, endDate } = get4WeekRangeEDT(curDate);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            <button type="button" class="date-nav-btn text-btn jump-btn" id="prev-month-jump-btn" title="Previous Month (4 Weeks / 28 Days)">
              « Month
            </button>
            <button type="button" class="date-nav-btn text-btn step-btn" id="prev-month-step-week-btn" title="Previous Week (7 Days)">
              ‹ Week
            </button>
            <div class="date-current-display">
              <span class="date-month-tag">4-Week Window: <strong>${startDate}</strong> – <strong>${endDate}</strong> (EDT)</span>
            </div>
            <button type="button" class="date-nav-btn text-btn step-btn" id="next-month-step-week-btn" title="Next Week (7 Days)">
              Week ›
            </button>
            <button type="button" class="date-nav-btn text-btn jump-btn" id="next-month-jump-btn" title="Next Month (4 Weeks / 28 Days)">
              Month »
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

      return;
    }
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.selectedView !== prevState.selectedView ||
      state.selectedDate !== prevState.selectedDate ||
      state.heatmapUseMedian !== prevState.heatmapUseMedian ||
      state.routeData !== prevState.routeData
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

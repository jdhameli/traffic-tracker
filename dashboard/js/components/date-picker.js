/**
 * Contextual Date Picker & Navigator for Heatmap, Daily, Weekly, and Monthly views.
 */

import { stateStore } from '../state.js';
import { parseToEDT, getWeekRangeEDT } from '../utils/time-utils.js';

export function initDatePicker(containerEl, onChangeDate, onChangeMonth, onToggleHeatmapMedian) {
  function render(state) {
    const { selectedView, selectedDate, selectedMonth, heatmapUseMedian } = state;

    if (!selectedDate && !selectedMonth) {
      containerEl.innerHTML = '';
      return;
    }

    if (selectedView === 'heatmap') {
      const { startDate, endDate } = getWeekRangeEDT(selectedDate);
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const startObj = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            ${
              !heatmapUseMedian
                ? `
              <button type="button" class="date-nav-btn prev-btn" id="prev-hm-week-btn" title="Previous Week">
                ◀
              </button>
              <div class="date-current-display">
                <span class="date-week-tag">Week: <strong>${startDate}</strong> – <strong>${endDate}</strong> (EDT)</span>
              </div>
              <button type="button" class="date-nav-btn next-btn" id="next-hm-week-btn" title="Next Week">
                ▶
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

      containerEl.querySelector('#prev-hm-week-btn')?.addEventListener('click', () => {
        const prev = new Date(startObj);
        prev.setUTCDate(prev.getUTCDate() - 7);
        const prevStr = prev.toISOString().split('T')[0];
        onChangeDate(prevStr);
      });

      containerEl.querySelector('#next-hm-week-btn')?.addEventListener('click', () => {
        const next = new Date(startObj);
        next.setUTCDate(next.getUTCDate() + 7);
        const nextStr = next.toISOString().split('T')[0];
        onChangeDate(nextStr);
      });

      containerEl.querySelector('#toggle-hm-median-btn')?.addEventListener('click', () => {
        if (onToggleHeatmapMedian) {
          onToggleHeatmapMedian(!heatmapUseMedian);
        }
      });

      return;
    }

    if (selectedView === 'daily') {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const curDateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const edtInfo = parseToEDT(curDateObj);

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            <button type="button" class="date-nav-btn prev-btn" id="prev-day-btn" title="Previous Day">
              ◀
            </button>
            <div class="date-current-display">
              <input type="date" id="daily-date-input" class="date-input" value="${selectedDate}" />
              <span class="date-weekday-tag">${edtInfo.edtDayOfWeekName}, ${selectedDate} (EDT)</span>
            </div>
            <button type="button" class="date-nav-btn next-btn" id="next-day-btn" title="Next Day">
              ▶
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#daily-date-input')?.addEventListener('change', (e) => {
        if (e.target.value) onChangeDate(e.target.value);
      });

      containerEl.querySelector('#prev-day-btn')?.addEventListener('click', () => {
        const prev = new Date(curDateObj);
        prev.setUTCDate(prev.getUTCDate() - 1);
        const prevStr = prev.toISOString().split('T')[0];
        onChangeDate(prevStr);
      });

      containerEl.querySelector('#next-day-btn')?.addEventListener('click', () => {
        const next = new Date(curDateObj);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextStr = next.toISOString().split('T')[0];
        onChangeDate(nextStr);
      });

      return;
    }

    if (selectedView === 'weekly') {
      const { startDate, endDate } = getWeekRangeEDT(selectedDate);
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const startObj = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            <button type="button" class="date-nav-btn prev-btn" id="prev-week-btn" title="Previous Week">
              ◀
            </button>
            <div class="date-current-display">
              <span class="date-week-tag">Week: <strong>${startDate}</strong> – <strong>${endDate}</strong> (EDT)</span>
            </div>
            <button type="button" class="date-nav-btn next-btn" id="next-week-btn" title="Next Week">
              ▶
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#prev-week-btn')?.addEventListener('click', () => {
        const prev = new Date(startObj);
        prev.setUTCDate(prev.getUTCDate() - 7);
        const prevStr = prev.toISOString().split('T')[0];
        onChangeDate(prevStr);
      });

      containerEl.querySelector('#next-week-btn')?.addEventListener('click', () => {
        const next = new Date(startObj);
        next.setUTCDate(next.getUTCDate() + 7);
        const nextStr = next.toISOString().split('T')[0];
        onChangeDate(nextStr);
      });

      return;
    }

    if (selectedView === 'monthly') {
      const [y, m] = (selectedMonth || selectedDate.substring(0, 7)).split('-').map(Number);
      const monthObj = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
      const monthLabel = monthObj.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      containerEl.innerHTML = `
        <div class="date-navigator-container">
          <div class="date-nav-controls">
            <button type="button" class="date-nav-btn prev-btn" id="prev-month-btn" title="Previous Month">
              ◀
            </button>
            <div class="date-current-display">
              <span class="date-month-tag">Month: <strong>${monthLabel}</strong> (EDT)</span>
            </div>
            <button type="button" class="date-nav-btn next-btn" id="next-month-btn" title="Next Month">
              ▶
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#prev-month-btn')?.addEventListener('click', () => {
        let prevM = m - 1;
        let prevY = y;
        if (prevM < 1) {
          prevM = 12;
          prevY--;
        }
        const prevMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`;
        onChangeMonth(prevMonthStr);
      });

      containerEl.querySelector('#next-month-btn')?.addEventListener('click', () => {
        let nextM = m + 1;
        let nextY = y;
        if (nextM > 12) {
          nextM = 1;
          nextY++;
        }
        const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
        onChangeMonth(nextMonthStr);
      });
    }
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.selectedView !== prevState.selectedView ||
      state.selectedDate !== prevState.selectedDate ||
      state.selectedMonth !== prevState.selectedMonth ||
      state.heatmapUseMedian !== prevState.heatmapUseMedian ||
      state.routeData !== prevState.routeData
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

/**
 * View navigation tabs component — Minimal Segmented Pill Navigation.
 */

import { stateStore } from '../state.js';

export const VIEWS = [
  { id: 'daily', label: 'Daily View' },
  { id: 'heatmap', label: 'Weekly Heatmap' },
  { id: 'monthly_heatmap', label: 'Monthly Heatmap' },
];

export function initViewNav(containerEl, onSelectView) {
  function render(state) {
    const { selectedView } = state;

    containerEl.innerHTML = `
      <div class="view-tabs" role="tablist">
        ${VIEWS.map(
          (v) => `
          <button
            type="button"
            class="view-tab-btn ${v.id === selectedView ? 'active' : ''}"
            role="tab"
            aria-selected="${v.id === selectedView}"
            data-view="${v.id}"
          >
            <span>${v.label}</span>
          </button>
        `
        ).join('')}
      </div>
    `;

    containerEl.querySelectorAll('.view-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        if (viewId !== state.selectedView) {
          onSelectView(viewId);
        }
      });
    });
  }

  stateStore.subscribe((state, prevState) => {
    if (state.selectedView !== prevState.selectedView) {
      render(state);
    }
  });

  render(stateStore.getState());
}

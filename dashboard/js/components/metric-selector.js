/**
 * Metric Selector component — Minimal segmented chips.
 */

import { stateStore } from '../state.js';
import { METRIC_CONFIGS } from '../utils/metric-utils.js';

export function initMetricSelector(containerEl, onSelectMetric) {
  function render(state) {
    const { selectedMetric } = state;
    const metricKeys = Object.keys(METRIC_CONFIGS);

    containerEl.innerHTML = `
      <div class="control-item">
        <div class="metric-chips" role="radiogroup" aria-label="Select Metric">
          ${metricKeys
            .map((key) => {
              const conf = METRIC_CONFIGS[key];
              const isSelected = conf.id === selectedMetric;
              return `
              <button
                type="button"
                class="metric-chip-btn ${isSelected ? 'active' : ''}"
                data-metric="${conf.id}"
                role="radio"
                aria-checked="${isSelected}"
                title="${conf.description}"
              >
                <span>${conf.label}</span>
              </button>
            `;
            })
            .join('')}
        </div>
      </div>
    `;

    containerEl.querySelectorAll('.metric-chip-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const metric = btn.getAttribute('data-metric');
        if (metric !== state.selectedMetric) {
          onSelectMetric(metric);
        }
      });
    });
  }

  stateStore.subscribe((state, prevState) => {
    if (state.selectedMetric !== prevState.selectedMetric) {
      render(state);
    }
  });

  render(stateStore.getState());
}

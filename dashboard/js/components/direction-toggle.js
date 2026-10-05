/**
 * Direction toggle pill component (Forward / Reverse).
 */

import { stateStore } from '../state.js';

export function initDirectionToggle(containerEl, onToggleDirection) {
  function render(state) {
    const route = stateStore.getCurrentRouteConfig();
    const forwardLabel = route ? route.forwardLabel : 'Forward';
    const reverseLabel = route ? route.reverseLabel : 'Reverse';
    const isForward = state.selectedDirection === 'forward';

    containerEl.innerHTML = `
      <div class="control-item">
        <div class="toggle-segmented" role="radiogroup" aria-label="Route Direction">
          <button
            type="button"
            class="toggle-btn ${isForward ? 'active' : ''}"
            data-dir="forward"
            role="radio"
            aria-checked="${isForward}"
            title="Forward: ${forwardLabel}"
          >
            <span>${forwardLabel}</span>
          </button>
          <button
            type="button"
            class="toggle-btn ${!isForward ? 'active' : ''}"
            data-dir="reverse"
            role="radio"
            aria-checked="${!isForward}"
            title="Reverse: ${reverseLabel}"
          >
            <span>${reverseLabel}</span>
          </button>
        </div>
      </div>
    `;

    containerEl.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = btn.getAttribute('data-dir');
        if (dir !== state.selectedDirection) {
          onToggleDirection(dir);
        }
      });
    });
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.selectedDirection !== prevState.selectedDirection ||
      state.selectedRouteId !== prevState.selectedRouteId ||
      state.routes !== prevState.routes
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

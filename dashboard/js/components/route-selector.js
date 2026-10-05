/**
 * Minimal Route Selector component.
 */

import { stateStore } from '../state.js';

export function initRouteSelector(containerEl, onSelectRoute) {
  function render(state) {
    const { routes, selectedRouteId } = state;
    if (!routes || routes.length === 0) {
      containerEl.innerHTML = '<div class="select-loading">Loading...</div>';
      return;
    }

    containerEl.innerHTML = `
      <div class="control-item">
        <span class="control-prefix">Route:</span>
        <div class="custom-select-wrapper">
          <select id="route-select" class="custom-select" aria-label="Selected Route">
            ${routes
              .map(
                (r) => `
              <option value="${r.routeId}" ${r.routeId === selectedRouteId ? 'selected' : ''}>
                ${r.displayName}
              </option>
            `
              )
              .join('')}
          </select>
        </div>
      </div>
    `;

    const selectEl = containerEl.querySelector('#route-select');
    selectEl.addEventListener('change', (e) => {
      onSelectRoute(e.target.value);
    });
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.routes !== prevState.routes ||
      state.selectedRouteId !== prevState.selectedRouteId
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

/**
 * Traffic Tracker Dashboard Main Application Entrypoint.
 * Powered by Observable Plot for travel time analysis.
 */

import { loadAppConfig } from './api/config-loader.js';
import { loadRouteData } from './api/data-loader.js';
import { stateStore } from './state.js';
import { initRouteSelector } from './components/route-selector.js';
import { initDirectionToggle } from './components/direction-toggle.js';
import { initViewNav } from './components/view-nav.js';
import { initDatePicker } from './components/date-picker.js';
import { renderHeatmapView, disposeHeatmapChart } from './views/heatmap-view.js';
import { renderDailyView, disposeDailyChart } from './views/daily-view.js';
import { renderMonthlyHeatmapView, disposeMonthlyHeatmapChart } from './views/monthly-heatmap-view.js';
import { parseToEDT } from './utils/time-utils.js';

let chartContainerEl = null;

async function switchRoute(routeId) {
  stateStore.setState({ isLoading: true, selectedRouteId: routeId });
  try {
    const routeData = await loadRouteData(routeId);

    // Pick the most recent available date from records, or current EDT date
    let defaultDate =
      routeData.availableDates.length > 0
        ? routeData.availableDates[routeData.availableDates.length - 1]
        : parseToEDT(new Date()).edtDateStr;

    let defaultMonth = defaultDate.substring(0, 7);

    stateStore.setState({
      routeData,
      selectedDate: defaultDate,
      selectedMonth: defaultMonth,
      isLoading: false,
    });

    renderCurrentView();
  } catch (err) {
    console.error('Failed to load route data:', err);
    stateStore.setState({
      isLoading: false,
      error: `Failed to load traffic data for route ${routeId}`,
    });
  }
}

function switchDirection(direction) {
  stateStore.setState({ selectedDirection: direction });
  renderCurrentView();
}

function switchView(viewId) {
  disposeAllCharts();
  stateStore.setState({ selectedView: viewId });
  renderCurrentView();
}

function changeDate(dateStr) {
  stateStore.setState({
    selectedDate: dateStr,
    selectedMonth: dateStr.substring(0, 7),
  });
  renderCurrentView();
}

function changeMonth(monthStr) {
  stateStore.setState({
    selectedMonth: monthStr,
    selectedDate: `${monthStr}-01`,
  });
  renderCurrentView();
}

function toggleHeatmapMedian(useMedian) {
  stateStore.setState({
    heatmapUseMedian: useMedian,
  });
  renderCurrentView();
}

function drillDownToDate(dateStr) {
  disposeAllCharts();

  stateStore.setState({
    selectedDate: dateStr,
    selectedMonth: dateStr.substring(0, 7),
    selectedView: 'daily',
  });
  renderCurrentView();
}

function disposeAllCharts() {
  disposeHeatmapChart();
  disposeDailyChart();
  disposeMonthlyHeatmapChart();
  if (chartContainerEl) {
    chartContainerEl.innerHTML = '';
  }
}

function renderCurrentView() {
  if (!chartContainerEl) return;
  const state = stateStore.getState();
  const filteredRecords = stateStore.getFilteredRecords();

  if (state.isLoading) {
    chartContainerEl.innerHTML = `
      <div class="chart-loading-state">
        <div class="spinner"></div>
        <p>Loading traffic records...</p>
      </div>
    `;
    return;
  }

  switch (state.selectedView) {
    case 'daily':
      renderDailyView(chartContainerEl, filteredRecords, state);
      break;
    case 'heatmap':
    case 'weekly':
      renderHeatmapView(chartContainerEl, filteredRecords, state, {
        onSelectDate: drillDownToDate,
      });
      break;
    case 'monthly_heatmap':
    case 'monthly':
      renderMonthlyHeatmapView(chartContainerEl, filteredRecords, state, {
        onSelectDate: drillDownToDate,
      });
      break;
    default:
      renderHeatmapView(chartContainerEl, filteredRecords, state, {
        onSelectDate: drillDownToDate,
      });
      break;
  }
}

async function init() {
  chartContainerEl = document.getElementById('chart-container');

  // Initialize UI component containers
  const routeSelectorContainer = document.getElementById('route-selector-container');
  const directionToggleContainer = document.getElementById('direction-toggle-container');
  const viewNavContainer = document.getElementById('view-nav-container');
  const datePickerContainer = document.getElementById('date-picker-container');

  initRouteSelector(routeSelectorContainer, switchRoute);
  initDirectionToggle(directionToggleContainer, switchDirection);
  initViewNav(viewNavContainer, switchView);
  initDatePicker(
    datePickerContainer,
    changeDate,
    changeMonth,
    toggleHeatmapMedian
  );

  try {
    const config = await loadAppConfig();
    const initialRouteId = config.routes.length > 0 ? config.routes[0].routeId : null;

    stateStore.setState({
      routes: config.routes,
      locations: config.locations,
      selectedRouteId: initialRouteId,
    });

    if (initialRouteId) {
      await switchRoute(initialRouteId);
    }
  } catch (err) {
    console.error('App initialization failed:', err);
    if (chartContainerEl) {
      chartContainerEl.innerHTML = `
        <div class="chart-error-state">
          <h3>Failed to load configuration</h3>
          <p>Please check that <code>config/routes.json</code> and <code>config/locations.json</code> exist.</p>
        </div>
      `;
    }
  }
}

// Start app once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

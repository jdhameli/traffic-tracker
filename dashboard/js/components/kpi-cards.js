/**
 * KPI Metric Cards component.
 */

import { stateStore } from '../state.js';
import { formatMinutes } from '../utils/time-utils.js';

export function initKpiCards(containerEl) {
  function render(state) {
    const records = stateStore.getFilteredRecords();

    if (!records || records.length === 0) {
      containerEl.innerHTML = `
        <div class="kpi-empty">No observations recorded for this route and direction yet.</div>
      `;
      return;
    }

    // Latest observation
    const latest = records[records.length - 1];
    const latestDelay = latest.traffic_delay_min;
    const latestTravelTime = latest.travel_time_min;
    const baseline = latest.baseline_time_min;

    // Peak delay
    let maxDelay = 0;
    let maxDelayRecord = null;
    let totalDelay = 0;

    for (const r of records) {
      if (r.traffic_delay_min > maxDelay) {
        maxDelay = r.traffic_delay_min;
        maxDelayRecord = r;
      }
      totalDelay += r.traffic_delay_min;
    }

    const avgDelay = totalDelay / records.length;

    // Delay status pill
    let delayBadge = '<span class="badge badge-success">Freeflow</span>';
    if (latestDelay > 5) {
      delayBadge = '<span class="badge badge-danger">Severe Congestion</span>';
    } else if (latestDelay > 1) {
      delayBadge = '<span class="badge badge-warning">Moderate Delay</span>';
    }

    containerEl.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card card-glow-primary">
          <div class="kpi-header">
            <span class="kpi-title">Latest Traffic Delay</span>
            ${delayBadge}
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value ${latestDelay > 0 ? 'text-amber' : 'text-green'}">
              +${formatMinutes(latestDelay)}
            </span>
            <span class="kpi-subtext">Total: ${formatMinutes(latestTravelTime)}</span>
          </div>
          <div class="kpi-footer">
            <span class="kpi-time">Recorded at ${latest.edt.edtTimeStr} EDT (${latest.edt.edtDateStr})</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Free-flow Baseline</span>
            <span class="badge badge-neutral">Standard</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${formatMinutes(baseline)}</span>
            <span class="kpi-subtext">${(latest.distance_mi !== undefined ? latest.distance_mi : (latest.distance_km * 0.621371).toFixed(2))} mi</span>
          </div>
          <div class="kpi-footer">
            <span>Ideal travel duration without traffic</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Average Delay</span>
            <span class="badge badge-info">Historical</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">+${formatMinutes(avgDelay)}</span>
            <span class="kpi-subtext">Peak: +${formatMinutes(maxDelay)}</span>
          </div>
          <div class="kpi-footer">
            <span>${maxDelayRecord ? `Peak on ${maxDelayRecord.edt.edtDateStr} at ${maxDelayRecord.edt.edtTimeStr} EDT` : 'Across all history'}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Total Samples</span>
            <span class="badge badge-neutral">EDT Records</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value text-accent">${records.length}</span>
            <span class="kpi-subtext">Points</span>
          </div>
          <div class="kpi-footer">
            <span>100% evaluated in EDT</span>
          </div>
        </div>
      </div>
    `;
  }

  stateStore.subscribe((state, prevState) => {
    if (
      state.routeData !== prevState.routeData ||
      state.selectedDirection !== prevState.selectedDirection ||
      state.selectedRouteId !== prevState.selectedRouteId
    ) {
      render(state);
    }
  });

  render(stateStore.getState());
}

/**
 * Observable Plot Theme, Color Scales, and Container Mount Utilities.
 * Unified Minimal Theme for Traffic Tracker.
 */

import * as Plot from '@observablehq/plot';
import { THEME_COLORS } from './theme-constants.js';
import { getSafeContainerWidth } from './chart-helpers.js';

/**
 * Common tooltip styling for Plot.tip marks.
 */
export const TIP_STYLE = {
  fill: THEME_COLORS.bgSurface,
  stroke: THEME_COLORS.border,
  strokeWidth: 1,
  fontSize: 12,
  lineHeight: 1.35,
  textPadding: 8,
};

/**
 * Returns an enhanced Observable Plot continuous color scale definition for Travel Time.
 * Uses a curated 7-stop chromatic traffic palette with lab interpolation and
 * distribution-calibrated stops so variation is visible even on low-variance routes.
 */
export function travelTimeColor(values, options = {}) {
  const clean = (values || [])
    .filter((v) => v !== null && v !== undefined && !isNaN(v) && v > 0)
    .sort((a, b) => a - b);

  const stops = [
    '#059669', // Rich Emerald (Optimal / Fast)
    '#10b981', // Clean Emerald (Smooth Flow)
    '#84cc16', // Vibrant Lime (Normal / Light)
    '#eab308', // Warm Amber (Mild Slowdown)
    '#f97316', // Rich Orange (Moderate Congestion)
    '#ef4444', // Crimson Red (Heavy Congestion)
    '#881337', // Deep Burgundy (Peak Commute)
  ];

  if (clean.length === 0) {
    return {
      type: 'linear',
      domain: [0, 5, 10, 15, 20, 25, 30],
      range: stops,
      interpolate: 'lab',
      legend: false,
      label: 'Travel Time (min)',
    };
  }

  const lo = clean[0];
  const hi = clean[clean.length - 1];

  let domain;
  if (hi - lo < 1) {
    domain = stops.map((_, i) => lo + i * 0.25);
  } else {
    // Multi-quantile distribution breaks to reveal meaningful variation
    // across both normal variance and extreme peak congestion
    const quantiles = [0, 0.2, 0.4, 0.65, 0.82, 0.94, 1.0];
    domain = quantiles.map((q) => {
      const idx = Math.min(clean.length - 1, Math.floor(q * (clean.length - 1)));
      return clean[idx];
    });
    // Ensure strictly monotonic domain
    for (let i = 1; i < domain.length; i++) {
      if (domain[i] <= domain[i - 1]) {
        domain[i] = Number((domain[i - 1] + (hi - lo) / 50 + 0.05).toFixed(2));
      }
    }
  }

  return {
    type: 'linear',
    domain,
    range: stops,
    interpolate: 'lab',
    legend: false,
    label: 'Travel Time (min)',
    tickFormat: (d) => `${d.toFixed(d % 1 === 0 ? 0 : 1)}m`,
  };
}

/**
 * Determines whether text placed inside a colored cell should be dark or white for legibility.
 */
export function getContrastTextColor(val, minVal, maxVal) {
  if (val === null || val === undefined || isNaN(val)) return 'transparent';
  if (maxVal <= minVal) return THEME_COLORS.textPrimary;
  const ratio = (val - minVal) / (maxVal - minVal);
  // Upper range (heavy congestion, orange to dark red) uses white text
  return ratio > 0.55 ? '#ffffff' : THEME_COLORS.textPrimary;
}

/**
 * Renders an empty state placeholder inside the chart container.
 */
export function renderEmptyState(containerEl, { title, message }) {
  containerEl.innerHTML = `
    <div class="chart-empty-state">
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <h3>${title || 'No Observations Found'}</h3>
      <p>${message || 'No traffic records recorded for this route and selection.'}</p>
    </div>
  `;
}

/**
 * Mounts an Observable Plot chart inside containerEl.
 * Watches for container resize with ResizeObserver and debounces re-renders.
 * Handles click drill-down on clicked datum.
 *
 * @param {HTMLElement} containerEl
 * @param {(width: number) => HTMLElement|SVGSVGElement|null} buildPlot
 * @param {Object} [options]
 * @returns {{ dispose: () => void, rerender: () => void }}
 */
export function mountPlot(containerEl, buildPlot, options = {}) {
  let currentPlot = null;
  let resizeObserver = null;
  let rafId = null;

  function render() {
    const width = getSafeContainerWidth(containerEl);
    if (width <= 0) return;

    if (currentPlot) {
      currentPlot.remove();
      currentPlot = null;
    }
    containerEl.innerHTML = '';

    const plot = buildPlot(width);
    if (!plot) return;

    currentPlot = plot;
    containerEl.appendChild(plot);

    // Wire click listener for drill-down
    if (typeof options.onClickDatum === 'function') {
      plot.addEventListener('click', (event) => {
        // When pointer transform is used on Plot, plot.value contains the active datum
        const datum = plot.value || event.target?.__data__ || null;
        if (datum) {
          options.onClickDatum(datum, event);
        }
      });
    }
  }

  render();

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (containerEl && containerEl.isConnected) {
          render();
        }
      });
    });
    resizeObserver.observe(containerEl);
  }

  return {
    dispose: () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (currentPlot) {
        currentPlot.remove();
        currentPlot = null;
      }
    },
    rerender: render,
  };
}

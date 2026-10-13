/**
 * Chart Header Management Utility.
 *
 * Decouples chart titles, subtitles, and unit metadata from the ECharts
 * Canvas/SVG rendering context into semantic HTML DOM elements.
 *
 * Why this permanently eliminates text overlap across all layouts:
 * 1. HTML DOM Flow: Responsive text wraps naturally via CSS flexbox/block layout,
 *    pushing down content below it without hardcoded pixel coordinates.
 * 2. Viewport Independence: On mobile, tablet, or desktop, long titles wrap cleanly
 *    without invading the chart canvas.
 * 3. Zero Canvas Contention: The canvas top margin is dedicated exclusively to chart
 *    data and axes, making Y-axis title collisions impossible.
 */

export function updateChartHeader({ title, subtitle, unit, metricLabel }) {
  const titleEl = document.getElementById('chart-header-title');
  const subtitleEl = document.getElementById('chart-header-subtitle');
  const metaEl = document.getElementById('chart-header-meta');

  if (titleEl && title !== undefined) {
    titleEl.textContent = title;
  }

  if (subtitleEl && subtitle !== undefined) {
    subtitleEl.textContent = subtitle;
  }

  if (metaEl) {
    if (unit) {
      metaEl.innerHTML = `
        <span class="chart-meta-pill" title="Metric Unit: ${metricLabel || unit}">
          <span class="chart-meta-dot"></span>
          <span>Unit: <strong>${unit}</strong></span>
        </span>
      `;
      metaEl.style.display = 'flex';
    } else {
      metaEl.innerHTML = '';
      metaEl.style.display = 'none';
    }
  }
}

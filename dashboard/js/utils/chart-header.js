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

export function updateChartHeader({ title, subtitle, unit, metricLabel, minVal, maxVal }) {
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
    const pills = [];

    if (minVal !== undefined && minVal !== null && !isNaN(minVal)) {
      const minFormatted = typeof minVal === 'number' ? `${minVal.toFixed(1)} ${unit || 'min'}` : minVal;
      pills.push(`
        <span class="chart-meta-pill" title="Minimum observed travel time">
          <span class="chart-meta-dot dot-min"></span>
          <span>Minimum: <strong>${minFormatted}</strong></span>
        </span>
      `);
    }

    if (maxVal !== undefined && maxVal !== null && !isNaN(maxVal)) {
      const maxFormatted = typeof maxVal === 'number' ? `${maxVal.toFixed(1)} ${unit || 'min'}` : maxVal;
      pills.push(`
        <span class="chart-meta-pill" title="Maximum observed travel time">
          <span class="chart-meta-dot dot-max"></span>
          <span>Maximum: <strong>${maxFormatted}</strong></span>
        </span>
      `);
    }

    if (pills.length > 0) {
      metaEl.innerHTML = pills.join('');
      metaEl.style.display = 'flex';
    } else {
      metaEl.innerHTML = '';
      metaEl.style.display = 'none';
    }
  }
}

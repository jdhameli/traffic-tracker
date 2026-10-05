/**
 * Standard Unified Theme Color Palette for all Charts and Views.
 * Consistent Indigo Slate Theme without ad-hoc colors.
 */

export const THEME_COLORS = {
  // Primary Observed Series (Line, Bar, Area)
  primary: '#4f46e5', // Deep Indigo
  primaryLight: '#6366f1', // Indigo Accent
  primaryAreaStart: 'rgba(79, 70, 229, 0.12)',
  primaryAreaEnd: 'rgba(79, 70, 229, 0.0)',

  // Historical Median Benchmark Series (Dashed line)
  median: '#d97706', // Warm Amber

  // Free-flow / Baseline Reference (Dotted line / Indicator)
  baseline: '#10b981', // Emerald

  // Peak / Extreme Indicator
  peak: '#e11d48', // Crimson Rose

  // Standard Heatmap Gradient (Green -> Lime -> Yellow -> Orange -> Red -> Dark Red)
  heatmapGradient: [
    '#22c55e', // Green (Free-flow / Low)
    '#84cc16', // Lime (Light)
    '#eab308', // Yellow (Moderate)
    '#f97316', // Orange (Heavy)
    '#ef4444', // Red (Severe)
    '#991b1b', // Dark Red (Peak Congestion)
  ],

  // UI & Canvas Elements
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  border: '#e2e8f0',
  borderSplit: '#f1f5f9',
  bgSurface: '#ffffff',
  bgSubtle: '#f8fafc',
};

/**
 * Metric definitions, unit formatting, and conversion utilities.
 * Focused exclusively on Travel Time.
 */

export const TRAVEL_TIME = {
  id: 'travel_time_min',
  label: 'Travel Time',
  unit: 'min',
  shortUnit: 'm',
  icon: '🚗',
  description: 'Commute duration in minutes',
};

export const METRIC_CONFIGS = {
  travel_time_min: TRAVEL_TIME,
};

/**
 * Extracts travel time in minutes from a record.
 */
export function getTravelTime(record) {
  if (!record) return 0;
  const val = record.travel_time_min;
  return val !== undefined && val !== null ? Number(val) : 0;
}

/**
 * Compatibility alias for getTravelTime.
 */
export function getMetricValue(record) {
  return getTravelTime(record);
}

/**
 * Formats travel time with unit string (e.g. "12.4m" or "12m 24s").
 */
export function formatTravelTime(val, detailed = false) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const num = Number(val);
  if (!detailed) {
    return `${num.toFixed(1)}m`;
  }
  const m = Math.floor(num);
  const s = Math.round((num - m) * 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Compatibility alias for formatTravelTime.
 */
export function formatMetricValue(val, _metricKey, detailed = false) {
  return formatTravelTime(val, detailed);
}

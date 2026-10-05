/**
 * Metric definitions, unit formatting, and conversion utilities.
 */

export const KM_TO_MILES = 0.621371;

export const METRIC_CONFIGS = {
  travel_time_min: {
    id: 'travel_time_min',
    label: 'Travel Time',
    unit: 'min',
    shortUnit: 'm',
    icon: '🚗',
    description: 'Total commute duration with live traffic',
    isDistance: false,
    zeroLabel: '0.0m',
  },
  traffic_delay_min: {
    id: 'traffic_delay_min',
    label: 'Traffic Delay',
    unit: 'min',
    shortUnit: 'm',
    icon: '⏱️',
    description: 'Congestion delay above free-flow speed',
    isDistance: false,
    zeroLabel: '0.0m (Freeflow)',
  },
  baseline_time_min: {
    id: 'baseline_time_min',
    label: 'Baseline Free-flow',
    unit: 'min',
    shortUnit: 'm',
    icon: '🏁',
    description: 'Typical travel duration without traffic',
    isDistance: false,
    zeroLabel: '0.0m',
  },
  distance_mi: {
    id: 'distance_mi',
    label: 'Distance (mi)',
    unit: 'mi',
    shortUnit: 'mi',
    icon: '🛣️',
    description: 'Route length in miles',
    isDistance: true,
    zeroLabel: '0.00 mi',
  },
};

/**
 * Extracts the numeric value of the chosen metric from a record.
 * Converts km to miles if distance_mi is requested.
 */
export function getMetricValue(record, metricKey = 'travel_time_min') {
  if (!record) return 0;
  if (metricKey === 'distance_mi') {
    if (record.distance_mi !== undefined && record.distance_mi !== null) {
      return Number(record.distance_mi);
    }
    return Number(((record.distance_km || 0) * KM_TO_MILES).toFixed(2));
  }
  const val = record[metricKey];
  return val !== undefined && val !== null ? Number(val) : 0;
}

/**
 * Formats a metric value with appropriate unit string (e.g. "0.0m", "12.4m", "5.62 mi").
 */
export function formatMetricValue(val, metricKey = 'travel_time_min', detailed = false) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const config = METRIC_CONFIGS[metricKey] || METRIC_CONFIGS.travel_time_min;
  const num = Number(val);

  if (config.isDistance) {
    return `${num.toFixed(2)} mi`;
  }

  if (num === 0 && metricKey === 'traffic_delay_min') {
    return detailed ? '0.0m (Free-flow)' : '0.0m';
  }

  if (!detailed) {
    return `${num.toFixed(1)}${config.shortUnit}`;
  }

  const m = Math.floor(num);
  const s = Math.round((num - m) * 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

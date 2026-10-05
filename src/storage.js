import fs from 'node:fs';
import path from 'node:path';

const CSV_HEADERS = [
  'timestamp',
  'route_id',
  'direction',
  'origin_id',
  'origin_name',
  'destination_id',
  'destination_name',
  'distance_km',
  'travel_time_min',
  'traffic_delay_min',
  'baseline_time_min',
  'status',
  'error_message'
];

/**
 * Escapes a value for CSV formatting
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Appends a traffic observation record to the route's monthly CSV file.
 * @param {Object} record
 * @param {Object} options
 * @param {string} [options.dataDir] - Root data directory (default: 'data')
 * @returns {string} The path to the updated CSV file
 */
export function appendRouteRecord(record, options = {}) {
  const dataDir = options.dataDir || path.resolve(process.cwd(), 'data');
  const routeId = record.route_id || 'unknown';
  const routeDir = path.join(dataDir, 'routes', routeId);

  fs.mkdirSync(routeDir, { recursive: true });

  const timestamp = record.timestamp ? new Date(record.timestamp) : new Date();
  const yearMonth = timestamp.toISOString().slice(0, 7); // "YYYY-MM"
  const filePath = path.join(routeDir, `${yearMonth}.csv`);

  const fileExists = fs.existsSync(filePath);
  const isFileEmpty = fileExists ? fs.statSync(filePath).size === 0 : true;

  const rowValues = CSV_HEADERS.map(header => escapeCsvValue(record[header]));
  const csvLine = rowValues.join(',') + '\n';

  if (!fileExists || isFileEmpty) {
    const headerLine = CSV_HEADERS.join(',') + '\n';
    fs.writeFileSync(filePath, headerLine + csvLine, { encoding: 'utf8' });
  } else {
    fs.appendFileSync(filePath, csvLine, { encoding: 'utf8' });
  }

  return filePath;
}

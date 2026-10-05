/**
 * Fetches and parses CSV data for routes, mapping timestamps to EDT.
 */

import { parseToEDT } from '../utils/time-utils.js';

const routeDataCache = new Map();

/**
 * Generate candidate month strings (YYYY-MM) spanning recent past, current, and near future.
 */
function getCandidateMonths() {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  // Scan from 2025 up to currentYear + 1
  const startYear = Math.min(2025, currentYear - 1);
  const endYear = currentYear + 1;

  for (let yr = startYear; yr <= endYear; yr++) {
    for (let mo = 1; mo <= 12; mo++) {
      months.push(`${yr}-${String(mo).padStart(2, '0')}`);
    }
  }
  return months;
}

/**
 * Simple CSV parser fallback if PapaParse is not loaded globally.
 */
function parseCsvFallback(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    data.push(row);
  }
  return data;
}

/**
 * Parses raw CSV text into structured records with numeric types and EDT metadata.
 */
function parseCsvRecords(csvText) {
  let rawRows = [];

  if (typeof window !== 'undefined' && window.Papa && typeof window.Papa.parse === 'function') {
    const parsed = window.Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    rawRows = parsed.data || [];
  } else {
    rawRows = parseCsvFallback(csvText);
  }

  const records = [];
  for (const row of rawRows) {
    if (!row.timestamp || !row.route_id) continue;

    try {
      const edt = parseToEDT(row.timestamp);
      records.push({
        timestamp: row.timestamp,
        route_id: row.route_id,
        direction: row.direction || 'forward',
        origin_id: row.origin_id || '',
        origin_name: row.origin_name || '',
        destination_id: row.destination_id || '',
        destination_name: row.destination_name || '',
        distance_km: row.distance_km ? parseFloat(row.distance_km) : 0,
        distance_mi: row.distance_km ? Number((parseFloat(row.distance_km) * 0.621371).toFixed(2)) : 0,
        travel_time_min: row.travel_time_min ? parseFloat(row.travel_time_min) : 0,
        traffic_delay_min: row.traffic_delay_min ? parseFloat(row.traffic_delay_min) : 0,
        baseline_time_min: row.baseline_time_min ? parseFloat(row.baseline_time_min) : 0,
        status: row.status || 'OK',
        error_message: row.error_message || '',
        edt,
      });
    } catch (e) {
      console.warn('Skipping invalid timestamp row:', row, e);
    }
  }

  return records;
}

/**
 * Loads all available CSV data for a specific route.
 * @param {string} routeId - e.g. 'ROUTE_01'
 * @param {boolean} forceReload - bypass cache
 * @returns {Promise<Array<Object>>}
 */
export async function loadRouteData(routeId, forceReload = false) {
  if (!forceReload && routeDataCache.has(routeId)) {
    return routeDataCache.get(routeId);
  }

  const candidateMonths = getCandidateMonths();
  const allRecords = [];
  const availableMonths = [];

  // Fetch candidate monthly CSVs in parallel batches with cache-busting
  const timestamp = Date.now();
  const fetchPromises = candidateMonths.map(async (month) => {
    const url = `./data/routes/${routeId}/${month}.csv?_t=${timestamp}`;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const text = await res.text();
        const records = parseCsvRecords(text);
        if (records.length > 0) {
          availableMonths.push(month);
          return records;
        }
      }
    } catch (e) {
      // 404 or network error is expected for non-existent months
    }
    return [];
  });

  const results = await Promise.all(fetchPromises);
  for (const batch of results) {
    allRecords.push(...batch);
  }

  // Sort all records chronologically
  allRecords.sort((a, b) => a.edt.dateObj - b.edt.dateObj);

  const routeData = {
    routeId,
    records: allRecords,
    availableMonths: availableMonths.sort(),
    availableDates: Array.from(new Set(allRecords.map((r) => r.edt.edtDateStr))).sort(),
  };

  routeDataCache.set(routeId, routeData);
  return routeData;
}

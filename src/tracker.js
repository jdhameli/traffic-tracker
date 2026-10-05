import { loadEnvFile, loadConfig } from './config.js';
import { getRouteTravelTime } from './tomtom.js';
import { appendRouteRecord } from './storage.js';

// Load local .env if available
loadEnvFile();

/**
 * Runs traffic tracking for configured routes
 * @param {Object} options
 * @param {string} [options.routeFilter] - Specific routeId to run
 * @param {string} [options.apiKey] - TomTom API Key
 * @param {Object} [options.config] - Preloaded config object
 * @param {Function} [options.fetchFn] - Custom fetch implementation
 * @param {string} [options.dataDir] - Data output directory
 * @returns {Promise<Array<Object>>} List of recorded results
 */
export async function runTracker(options = {}) {
  const config = options.config || loadConfig();
  const apiKey = options.apiKey || process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    throw new Error('TOMTOM_API_KEY is not set. Please set it in environment variables or .env file.');
  }

  const { locations, routes } = config;
  const targetRouteId = options.routeFilter;

  const routesToProcess = routes.filter(r => {
    if (!r.enabled) return false;
    if (targetRouteId && r.routeId !== targetRouteId) return false;
    return true;
  });

  if (routesToProcess.length === 0) {
    console.log(targetRouteId
      ? `No enabled route found matching routeId: "${targetRouteId}"`
      : 'No enabled routes to process.');
    return [];
  }

  console.log(`\n🚦 Starting Traffic Tracker at ${new Date().toISOString()}`);
  console.log(`Found ${routesToProcess.length} route(s) to process (bidirectional)...\n`);

  const results = [];

  for (const route of routesToProcess) {
    const locA = locations[route.locationA];
    const locB = locations[route.locationB];

    console.log(`📍 Processing Route: [${route.routeId}] (${locA.name} <-> ${locB.name})`);

    // 1. Forward Direction: A -> B
    const forwardRecord = await checkDirection({
      routeId: route.routeId,
      direction: 'forward',
      originId: route.locationA,
      origin: locA,
      destinationId: route.locationB,
      destination: locB,
      apiKey,
      fetchFn: options.fetchFn,
      dataDir: options.dataDir
    });
    results.push(forwardRecord);

    // Brief throttle pause to respect QPS limits
    await new Promise(r => setTimeout(r, 400));

    // 2. Reverse Direction: B -> A
    const reverseRecord = await checkDirection({
      routeId: route.routeId,
      direction: 'reverse',
      originId: route.locationB,
      origin: locB,
      destinationId: route.locationA,
      destination: locA,
      apiKey,
      fetchFn: options.fetchFn,
      dataDir: options.dataDir
    });
    results.push(reverseRecord);

    // Brief throttle pause before next route
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n📊 Summary of Traffic Checks:');
  console.table(results.map(r => ({
    Route: r.route_id,
    Direction: r.direction,
    'From -> To': `${r.origin_name} -> ${r.destination_name}`,
    'Travel Time (min)': r.travel_time_min ?? 'N/A',
    'Delay (min)': r.traffic_delay_min ?? 'N/A',
    'Distance (km)': r.distance_km ?? 'N/A',
    Status: r.status
  })));

  return results;
}

async function checkDirection({ routeId, direction, originId, origin, destinationId, destination, apiKey, fetchFn, dataDir }) {
  const timestamp = new Date().toISOString();
  console.log(`  ➡️ [${direction.toUpperCase()}] ${origin.name} ➔ ${destination.name}...`);

  const baseRecord = {
    timestamp,
    route_id: routeId,
    direction,
    origin_id: originId,
    origin_name: origin.name,
    destination_id: destinationId,
    destination_name: destination.name,
    distance_km: null,
    travel_time_min: null,
    traffic_delay_min: null,
    baseline_time_min: null,
    status: 'OK',
    error_message: ''
  };

  try {
    const travelInfo = await getRouteTravelTime({
      origin,
      destination,
      apiKey,
      fetchFn
    });

    const record = {
      ...baseRecord,
      distance_km: travelInfo.distanceKm,
      travel_time_min: travelInfo.travelTimeMin,
      traffic_delay_min: travelInfo.trafficDelayMin,
      baseline_time_min: travelInfo.baselineTimeMin,
      status: 'OK'
    };

    const filePath = appendRouteRecord(record, { dataDir });
    console.log(`     ✅ ${travelInfo.travelTimeMin} min (${travelInfo.trafficDelayMin} min delay, ${travelInfo.distanceKm} km) -> saved to ${filePath}`);
    return record;
  } catch (err) {
    console.error(`     ❌ Error checking route: ${err.message}`);
    const failedRecord = {
      ...baseRecord,
      status: 'ERROR',
      error_message: err.message
    };
    appendRouteRecord(failedRecord, { dataDir });
    return failedRecord;
  }
}

// Direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('tracker.js')) {
  const args = process.argv.slice(2);
  let routeFilter = null;

  const routeArgIdx = args.findIndex(a => a === '--route' || a === '-r');
  if (routeArgIdx !== -1 && args[routeArgIdx + 1]) {
    routeFilter = args[routeArgIdx + 1];
  }

  runTracker({ routeFilter }).catch(err => {
    console.error('Execution failed:', err.message);
    process.exit(1);
  });
}

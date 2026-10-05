/**
 * TomTom Routing API Client
 */

/**
 * Calculates the travel time and traffic details between origin and destination
 * @param {Object} params
 * @param {Object} params.origin - { lat, lon, name }
 * @param {Object} params.destination - { lat, lon, name }
 * @param {string} params.apiKey - TomTom API Key
 * @param {Function} [params.fetchFn] - Optional fetch implementation for testing
 * @returns {Promise<Object>}
 */
export async function getRouteTravelTime({ origin, destination, apiKey, fetchFn = fetch, maxRetries = 3 }) {
  if (!apiKey) {
    throw new Error('TOMTOM_API_KEY is not configured.');
  }

  // Coordinates format: lat,lon:lat,lon
  const locationsParam = `${origin.lat},${origin.lon}:${destination.lat},${destination.lon}`;
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${locationsParam}/json`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('traffic', 'true');
  url.searchParams.set('travelMode', 'car');
  url.searchParams.set('departAt', 'now');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetchFn(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GitHub-Traffic-Tracker/1.0'
      }
    });

    if (response.status === 429 && attempt < maxRetries) {
      const backoffMs = attempt * 800;
      await new Promise(res => setTimeout(res, backoffMs));
      continue;
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errJson = await response.json();
        errorDetail = errJson.detailedError?.message || errJson.message || JSON.stringify(errJson);
      } catch {
        errorDetail = await response.text();
      }
      throw new Error(`TomTom API Error [HTTP ${response.status}]: ${errorDetail}`);
    }

    const data = await response.json();

    if (!data.routes || !data.routes.length) {
      throw new Error('No route found between specified coordinates.');
    }

    const summary = data.routes[0].summary;

    const travelTimeSeconds = summary.travelTimeInSeconds ?? 0;
    const trafficDelaySeconds = summary.trafficDelayInSeconds ?? 0;
    const historicTrafficTravelTimeSeconds = summary.historicTrafficTravelTimeInSeconds ??
      summary.noTrafficTravelTimeInSeconds ??
      Math.max(0, travelTimeSeconds - trafficDelaySeconds);
    const lengthMeters = summary.lengthInMeters ?? 0;

    return {
      distanceKm: Number((lengthMeters / 1000).toFixed(2)),
      travelTimeMin: Number((travelTimeSeconds / 60).toFixed(2)),
      trafficDelayMin: Number((trafficDelaySeconds / 60).toFixed(2)),
      baselineTimeMin: Number((historicTrafficTravelTimeSeconds / 60).toFixed(2)),
      departureTime: summary.departureTime || new Date().toISOString(),
      arrivalTime: summary.arrivalTime || null,
      rawSummary: summary
    };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../src/config.js';
import { getRouteTravelTime } from '../src/tomtom.js';
import { appendRouteRecord } from '../src/storage.js';
import { runTracker } from '../src/tracker.js';

test('loadConfig validates locations and routes correctly', () => {
  const config = loadConfig();
  assert.ok(config.locations.LOC_01);
  assert.equal(typeof config.locations.LOC_01.lat, 'number');
  assert.equal(typeof config.locations.LOC_01.lon, 'number');
  assert.ok(Array.isArray(config.routes));
  assert.equal(config.routes.length, 5);
  assert.equal(config.routes[0].routeId, 'ROUTE_01');
});

test('getRouteTravelTime parses TomTom API response correctly', async () => {
  const mockOrigin = { name: 'Origin', lat: 40.7128, lon: -74.0060 };
  const mockDest = { name: 'Destination', lat: 40.7580, lon: -73.9855 };

  const mockFetch = async (url) => {
    assert.match(url, /40\.7128,-74\.006:40\.758,-73\.9855/);
    assert.match(url, /traffic=true/);
    assert.match(url, /key=mock_key/);

    return {
      ok: true,
      json: async () => ({
        routes: [
          {
            summary: {
              lengthInMeters: 5500,
              travelTimeInSeconds: 1200,
              trafficDelayInSeconds: 300,
              historicTrafficTravelTimeInSeconds: 900,
              departureTime: '2026-10-04T19:00:00Z',
              arrivalTime: '2026-10-04T19:20:00Z'
            }
          }
        ]
      })
    };
  };

  const result = await getRouteTravelTime({
    origin: mockOrigin,
    destination: mockDest,
    apiKey: 'mock_key',
    fetchFn: mockFetch
  });

  assert.equal(result.distanceKm, 5.5);
  assert.equal(result.travelTimeMin, 20);
  assert.equal(result.trafficDelayMin, 5);
  assert.equal(result.baselineTimeMin, 15);
});

test('appendRouteRecord creates route folder and monthly CSV', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-test-'));

  try {
    const record = {
      timestamp: '2026-10-04T19:00:00Z',
      route_id: 'test_route',
      direction: 'forward',
      origin_id: 'home',
      origin_name: 'Home, Sweet Home',
      destination_id: 'office',
      destination_name: 'Work Office',
      distance_km: 12.5,
      travel_time_min: 25.4,
      traffic_delay_min: 4.2,
      baseline_time_min: 21.2,
      status: 'OK',
      error_message: ''
    };

    const filePath = appendRouteRecord(record, { dataDir: tempDir });
    assert.ok(fs.existsSync(filePath));
    assert.ok(filePath.endsWith(path.join('routes', 'test_route', '2026-10.csv')));

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2); // Header + 1 record
    assert.match(lines[0], /^timestamp,route_id/);
    assert.match(lines[1], /"Home, Sweet Home"/); // Escaped properly

    // Append second record
    appendRouteRecord({ ...record, direction: 'reverse', travel_time_min: 28.0 }, { dataDir: tempDir });
    const updatedLines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    assert.equal(updatedLines.length, 3);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runTracker executes bidirectional queries for routes and saves results', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-tracker-full-'));

  const mockConfig = {
    locations: {
      loc_a: { name: 'Location A', lat: 10.0, lon: 20.0 },
      loc_b: { name: 'Location B', lat: 10.5, lon: 20.5 }
    },
    routes: [
      {
        routeId: 'a_to_b',
        locationA: 'loc_a',
        locationB: 'loc_b',
        enabled: true
      }
    ]
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      routes: [
        {
          summary: {
            lengthInMeters: 10000,
            travelTimeInSeconds: 600,
            trafficDelayInSeconds: 60,
            historicTrafficTravelTimeInSeconds: 540
          }
        }
      ]
    })
  });

  try {
    const results = await runTracker({
      config: mockConfig,
      apiKey: 'test_key',
      fetchFn: mockFetch,
      dataDir: tempDir
    });

    assert.equal(results.length, 2); // Forward and reverse
    assert.equal(results[0].direction, 'forward');
    assert.equal(results[0].origin_id, 'loc_a');
    assert.equal(results[0].destination_id, 'loc_b');

    assert.equal(results[1].direction, 'reverse');
    assert.equal(results[1].origin_id, 'loc_b');
    assert.equal(results[1].destination_id, 'loc_a');

    const csvPath = path.join(tempDir, 'routes', 'a_to_b', `${new Date().toISOString().slice(0, 7)}.csv`);
    assert.ok(fs.existsSync(csvPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

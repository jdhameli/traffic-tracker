import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Basic .env loader (without requiring external dependencies)
 */
export function loadEnvFile(envPath = path.join(ROOT_DIR, '.env')) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["'](.*)["']$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

/**
 * Loads and validates locations.json and routes.json
 */
export function loadConfig(options = {}) {
  const configDir = options.configDir || path.join(ROOT_DIR, 'config');
  const locationsFile = path.join(configDir, 'locations.json');
  const routesFile = path.join(configDir, 'routes.json');

  if (!fs.existsSync(locationsFile)) {
    throw new Error(`Missing locations configuration file: ${locationsFile}`);
  }
  if (!fs.existsSync(routesFile)) {
    throw new Error(`Missing routes configuration file: ${routesFile}`);
  }

  const locations = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
  const routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));

  // Validate locations
  for (const [id, loc] of Object.entries(locations)) {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
      throw new Error(`Location "${id}" is missing valid numeric 'lat' or 'lon' coordinates.`);
    }
    if (!loc.name) {
      loc.name = id;
    }
  }

  // Validate routes
  if (!Array.isArray(routes)) {
    throw new Error('routes.json must be an array of route objects.');
  }

  const validatedRoutes = routes.map((r, index) => {
    if (!r.routeId || typeof r.routeId !== 'string') {
      throw new Error(`Route at index ${index} is missing a valid string 'routeId'.`);
    }
    if (!r.locationA || !locations[r.locationA]) {
      throw new Error(`Route "${r.routeId}" references undefined locationA: "${r.locationA}"`);
    }
    if (!r.locationB || !locations[r.locationB]) {
      throw new Error(`Route "${r.routeId}" references undefined locationB: "${r.locationB}"`);
    }

    return {
      routeId: r.routeId,
      locationA: r.locationA,
      locationB: r.locationB,
      enabled: r.enabled !== false,
      metadata: r.metadata || {}
    };
  });

  return {
    locations,
    routes: validatedRoutes,
    rootDir: ROOT_DIR
  };
}

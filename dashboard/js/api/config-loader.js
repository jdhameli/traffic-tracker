/**
 * Loads and processes locations.json and routes.json configurations.
 */

let cachedConfig = null;

export async function loadAppConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const [locationsRes, routesRes] = await Promise.all([
      fetch('./config/locations.json'),
      fetch('./config/routes.json'),
    ]);

    if (!locationsRes.ok) {
      throw new Error(`Failed to load locations.json (Status: ${locationsRes.status})`);
    }
    if (!routesRes.ok) {
      throw new Error(`Failed to load routes.json (Status: ${routesRes.status})`);
    }

    const locations = await locationsRes.json();
    const rawRoutes = await routesRes.json();

    const routes = rawRoutes
      .filter((r) => r.enabled !== false)
      .map((r) => {
        const locA = locations[r.locationA] || { name: r.locationA };
        const locB = locations[r.locationB] || { name: r.locationB };

        return {
          routeId: r.routeId,
          locationAId: r.locationA,
          locationAName: locA.name,
          locationBId: r.locationB,
          locationBName: locB.name,
          forwardLabel: `${locA.name} → ${locB.name}`,
          reverseLabel: `${locB.name} → ${locA.name}`,
          displayName: `${r.routeId}: ${locA.name} ↔ ${locB.name}`,
        };
      });

    cachedConfig = {
      locations,
      routes,
    };

    return cachedConfig;
  } catch (err) {
    console.error('Error loading application configuration:', err);
    throw err;
  }
}

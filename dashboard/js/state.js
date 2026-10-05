/**
 * Reactive state store for the Traffic Tracker Dashboard.
 */

class DashboardState {
  constructor() {
    this.state = {
      routes: [],
      locations: {},
      selectedRouteId: null,
      selectedDirection: 'forward', // 'forward' or 'reverse'
      selectedMetric: 'travel_time_min', // 'travel_time_min' | 'traffic_delay_min' | 'baseline_time_min' | 'distance_mi'
      selectedView: 'heatmap', // 'heatmap' | 'daily' | 'weekly' | 'monthly'
      heatmapUseMedian: false, // if true, show all-time median heatmap profile
      selectedDate: null, // 'YYYY-MM-DD' in EDT
      selectedMonth: null, // 'YYYY-MM' in EDT
      routeData: null, // Cached route records object
      isLoading: false,
      error: null,
    };

    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(partialState) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...partialState };
    this.notify(prevState);
  }

  notify(prevState) {
    for (const listener of this.listeners) {
      try {
        listener(this.state, prevState);
      } catch (err) {
        console.error('State subscriber error:', err);
      }
    }
  }

  getFilteredRecords() {
    if (!this.state.routeData || !this.state.routeData.records) {
      return [];
    }
    return this.state.routeData.records.filter(
      (r) => r.direction === this.state.selectedDirection
    );
  }

  getCurrentRouteConfig() {
    if (!this.state.routes) return null;
    return this.state.routes.find((r) => r.routeId === this.state.selectedRouteId) || null;
  }
}

export const stateStore = new DashboardState();

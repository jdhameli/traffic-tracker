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
      selectedView: 'heatmap', // 'daily' | 'heatmap' | 'monthly_heatmap'
      heatmapUseMedian: true, // default to true: show all-time median weekly heatmap profile (shows more data)
      selectedDate: null, // 'YYYY-MM-DD' in EDT
      selectedMonth: null, // 'YYYY-MM' in EDT
      showCellValues: false, // if true, render numeric value labels inside heatmap cells
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

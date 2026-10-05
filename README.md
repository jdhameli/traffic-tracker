# 🚦 Traffic Tracker

An automated traffic tracker powered by **Node.js**, **TomTom Routing API**, and **GitHub Actions**.

The workflow queries real-time travel durations and traffic delays for configured route pairs bidirectionally ($A \rightarrow B$ and $B \rightarrow A$). The observations are automatically committed and archived directly into monthly CSV files organized by route.

---

## 📁 Repository Structure

```
traffic-tracker/
├── .github/
│   └── workflows/
│       └── traffic_tracker.yml   # Automation workflow
├── config/
│   ├── locations.json            # Location coordinates (lat/lon)
│   └── routes.json               # Route definitions and pair mappings
├── data/
│   └── routes/                   # Auto-generated monthly CSV data
│       ├── ROUTE_01/
│       │   └── 2026-10.csv
│       └── ...
├── dashboard/                    # Interactive Analytics Dashboard
│   ├── css/                      # Modular styling & design tokens
│   └── js/                       # ES modules (API, stats engine, views)
├── src/                          # Traffic collection engine
│   ├── config.js
│   ├── tomtom.js
│   ├── storage.js
│   └── tracker.js
├── tests/                        # Test suite
│   ├── tracker.test.js
│   └── dashboard.test.js
├── index.html                    # GitHub Pages dashboard entrypoint
├── package.json
└── README.md
```

---

## 📈 Interactive Web Dashboard (GitHub Pages)

An interactive, responsive analytics dashboard is included and ready to host directly via **GitHub Pages** (or run locally).

### Features
1. **Universal EDT Time Mapping**: All timestamps, hourly bins, and day-of-week views are rendered in local Eastern Time (EDT).
2. **Dynamic Route & Direction Switching**: Select any configured route and toggle between `Forward` ($A \rightarrow B$) and `Reverse` ($B \rightarrow A$) instantly.
3. **4 Analytical Views**:
   - **Congestion Delay Heatmap**: Day of Week (Sun–Sat) vs. Hour of Day (0–23 EDT) matrix colored by delay intensity with sample counts.
   - **Daily View**: 24-hour time-of-day timeline with live points + **Historical Median Trendline** computed from previous matching days.
   - **Weekly View**: 7-day progression + **Historical Weekly Median Baseline**.
   - **Monthly View**: Calendar-day progression + **Historical Monthly Median Baseline**.
4. **KPI Summary Cards**: Real-time stats for current delay, baseline freeflow, peak delay, and total samples.

### 🚀 Running the Dashboard Locally
```bash
npm run dev
# or
npx serve .
```
Open `http://localhost:3000` (or the printed port) in your browser.

---

## ⚙️ Configuration Format

### 1. Locations (`config/locations.json`)
Locations are defined with sequential IDs (`LOC_01`, `LOC_02`, ...) to keep private labels off public commit history:

```json
{
  "LOC_01": {
    "name": "Location 1",
    "lat": 42.279636,
    "lon": -71.388739
  },
  "LOC_02": {
    "name": "Location 2",
    "lat": 42.299689,
    "lon": -71.352453
  }
}
```

### 2. Routes (`config/routes.json`)
Route pairs map two location IDs together under a unique `routeId`. The runner automatically evaluates both directions ($A \rightarrow B$ and $B \rightarrow A$):

```json
[
  {
    "routeId": "ROUTE_01",
    "locationA": "LOC_01",
    "locationB": "LOC_02",
    "enabled": true
  }
]
```

---

## 📊 CSV Output Structure

Data is stored per route in `data/routes/<routeId>/YYYY-MM.csv`:

```
data/
└── routes/
    ├── ROUTE_01/
    │   ├── 2026-10.csv
    │   └── 2026-11.csv
    └── ROUTE_02/
        └── 2026-10.csv
```

### CSV Schema

| Column | Description | Example |
|---|---|---|
| `timestamp` | Observation timestamp in UTC ISO-8601 | `2026-10-05T00:12:15.779Z` |
| `route_id` | Route identifier | `ROUTE_01` |
| `direction` | `forward` ($A \rightarrow B$) or `reverse` ($B \rightarrow A$) | `forward` |
| `origin_id` | Starting location identifier | `LOC_01` |
| `origin_name` | Origin label | `Location 1` |
| `destination_id` | Ending location identifier | `LOC_02` |
| `destination_name` | Destination label | `Location 2` |
| `distance_km` | Route distance in kilometers | `5.61` |
| `travel_time_min` | Real-time travel duration with live traffic | `7.98` |
| `traffic_delay_min` | Delay caused by traffic congestion | `0.00` |
| `baseline_time_min` | Typical baseline duration without traffic | `7.98` |
| `status` | Query status (`OK` or `ERROR`) | `OK` |
| `error_message` | Error detail if the request failed | `""` |

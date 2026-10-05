# 🚦 Traffic Tracker

An automated traffic tracker powered by **Node.js**, **TomTom Routing API**, and **GitHub Actions**.

Every 30 minutes, the GitHub Actions workflow queries real-time travel durations and traffic delays for configured route pairs bidirectionally ($A \rightarrow B$ and $B \rightarrow A$). The observations are committed and archived directly into monthly CSV files organized by route.

---

## 📁 Repository Structure

```
traffic-tracker/
├── .github/
│   └── workflows/
│       └── traffic_tracker.yml   # Scheduled workflow (runs every 30 minutes)
├── config/
│   ├── locations.json            # Location coordinates (lat/lon)
│   └── routes.json               # Route definitions and pair mappings
├── data/
│   └── routes/                   # Auto-generated monthly CSV data
│       ├── ROUTE_01/
│       │   └── 2026-10.csv
│       ├── ROUTE_02/
│       │   └── 2026-10.csv
│       └── ...
├── src/
│   ├── config.js                 # Configuration loader and validator
│   ├── tomtom.js                 # TomTom Routing API client with retry & rate limiting
│   ├── storage.js                # CSV file writer and directory manager
│   └── tracker.js                # Main bidirectional execution engine
├── tests/
│   └── tracker.test.js           # Automated test suite
├── package.json
└── README.md
```

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

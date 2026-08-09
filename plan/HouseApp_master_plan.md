# UK House-Finding App — Master Implementation Plan

## Goal
A premium, modern web application that helps users find the best sub-area in London to live in, based on their workplace postcode and personalised priority weights (safety, convenience, cost, entertainment). The algorithm directly surfaces specific neighbourhoods (e.g. "Canada Water", "Clapham") — no intermediate broad-area step.

---

## Application Flow

```
Step 1: Postcode Entry       → User enters work postcode
Step 2: Commute Mode         → User selects transit / driving
Step 3: Priority Sliders     → User weighs Safety / Convenience / Cost / Entertainment
Step 4: Loading              → Algorithm runs
Step 5: Top 5 Sub-Areas      → Ranked herocards; search bar for manual lookup
         ↓ click "View Properties"
Step 6: StepListings         → Property grid + Neighbourhood profile dashboard
```

---

## 1. Technology Stack

### Frontend
- **Framework**: React + Vite
- **Styling**: Vanilla CSS Modules with CSS Variables (Grid, Flexbox, `backdrop-filter`)
- **Animations**: Framer Motion
- **Routing**: react-router-dom (`useParams`, `useNavigate`)
- **Maps**: react-leaflet + OpenStreetMap (Step 6 Journey Simulator)
- **Charts**: Radar Chart library (Step 3 priority visualiser)
- **Typography & Icons**: Google Fonts (Inter / Plus Jakarta Sans), Lucide React

### Backend
- **Language**: Python 3.10+
- **Framework**: FastAPI (async, Swagger auto-docs)
- **Database**: PostgreSQL + PostGIS
- **ORM**: SQLAlchemy / SQLModel
- **Scraping**: Playwright (property listings)
- **Data Math**: Pandas + NumPy (Z-score normalisation)
- **Deployment**: Docker Compose (FastAPI + PostGIS containers)

---

## 2. UI/UX Design System

- **Theme**: Premium Dark Mode — deep navy backgrounds (`#0B0F19`, `#1A202C`)
- **Accents**: Electric Violet / Coral for active states and primary CTAs
- **Text**: High-contrast whites and soft greys
- **Cards**: Glassmorphic semi-transparent frosted panels (`backdrop-filter: blur`)
- **Motion**: Smooth slide-ins, hover expansions, staggered card reveals (`transition.staggerChildren: 0.1`)

---

## 3. Database Schema

### `locations` Table
Each row is a **specific sub-area** — no broad-area parents, no `sub_areas` JSON column.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | String | e.g. `"Canada Water"` |
| `borough` | String | e.g. `"Southwark"` |
| `lat` | Float | |
| `lng` | Float | |
| `coordinates` | Geography Point | PostGIS |
| `avg_rent_pcm` | Integer | £/month |
| `crime_incidents_per_1k` | Float | Static seed fallback |
| `entertainment_index` | Float | 1–10 |
| `transport_zone` | Integer | |
| `image_url` | String | Neighbourhood-specific photo (not stock) |
| `commute_transit_min` | Integer | Fallback commute |
| `commute_car_min` | Integer | Fallback commute |
| `description` | String | Short bio |
| `highlights` | JSONB | Emoji bullet list |

**Seed data**: 50–80 London sub-areas covering Zones 1–4, with realistic variance in every stat column (required for Z-score normalisation to work).

Suggested seed sub-areas (expand in `seed.py`):
- Canada Water, Bermondsey, Surrey Quays, Rotherhithe (Southwark)
- Brixton, Streatham, Clapham, Stockwell (Lambeth)
- Hackney Central, London Fields, Dalston, Stoke Newington (Hackney)
- Walthamstow, Leyton, Leytonstone (Waltham Forest)
- Stratford, Forest Gate, Plaistow (Newham)
- Peckham, East Dulwich, Nunhead (Southwark/Lewisham)
- Tooting, Balham, Colliers Wood (Wandsworth/Merton)
- Bow, Mile End, Stepney Green (Tower Hamlets)
- Finsbury Park, Stroud Green, Crouch End (Haringey)
- Elephant & Castle, Kennington, Walworth (Southwark)
- Greenwich, Blackheath, Lewisham (Greenwich/Lewisham)
- Ealing, Acton, Chiswick (Ealing/Hounslow)
- Wimbledon, Raynes Park, Morden (Merton)

---

## 4. API Endpoints

### `POST /api/v1/search`
Receives work postcode + priority weights; returns top 5 ranked sub-areas.

**Request payload**:
```json
{
  "workPostcode": "E14 5GL",
  "commuteMode": "transit",
  "weights": { "safety": 80, "convenience": 90, "cost": 40, "entertainment": 20 }
}
```

**Response schema** (`RankedLocation`):
```json
{
  "name": "Canada Water",
  "borough": "Southwark",
  "rank_score": 4.72,
  "image_url": "...",
  "commute_time_mins": 22,
  "isLiveCrime": true,
  "scores": { "safety": 8.1, "convenience": 9.0, "cost": 6.5, "entertainment": 7.2 }
}
```
- No `subAreas` field.
- Includes `isLiveCrime: bool` flag.

**Backend flow**:
1. Geocode `workPostcode` → Lat/Lng
2. PostGIS radius filter (≤20 miles)
3. Batch async commute times (TfL API or mock matrix)
4. Concurrent live crime fetch (see Section 6)
5. Ranking Algorithm (see Section 5)
6. Return top 5 sorted by `Final_Rank_Score`

---

### `GET /api/v1/properties/{location_name}`
Triggers async Playwright scraper for Zoopla / OpenRent / SpareRoom; returns normalised property array.

**Response per item**: `{ image, price_pcm, bedrooms, source_url, platform }`

---

### `GET /api/v1/locations/search?q={query}`
Powers the Step 5 manual search bar. SQLAlchemy `ilike` on `locations.name`.

**Response**: Full `RankedLocation` schema for matched location.

---

### `GET /api/v1/commute/simulator`
**Query params**: `origin`, `destination`, `time`, `mode`

Calls TfL Journey Planner API; returns polyline coordinates + step-by-step directions for the Step 6 map.

---

## 5. Ranking Algorithm

*Do not use simple addition. Implement the full 5-step model.*

### Step A — Z-Score Normalisation
```
Z = (x - mean) / standard_deviation
```
Applied to: `avg_rent_pcm`, `commute_time_mins`, `crime_incidents_per_1k`, `entertainment_index`

### Step B — Directionality Inversion
```
Score_Cost          = -Z_Cost
Score_Crime         = -Z_Crime
Score_Commute       = -Z_Commute
Score_Entertainment =  Z_Entertainment
```

### Step C — Exponential Penalty Functions
```
IF commute_time_mins > 90:
    P_commute = exp(-0.1 * (commute_time_mins - 90))

IF crime_incidents > 90th_percentile:
    P_crime = 0.5
```

### Step D — Weighted Linear Combination
Normalise frontend 0–100 weights → `w_i` summing to 1.0:
```
Raw_Score = (W_cost × Score_Cost) + (W_safety × Score_Crime)
          + (W_convenience × Score_Commute) + (W_entertainment × Score_Entertainment)
```

### Step E — Final Score
```
Final_Rank_Score = Raw_Score × P_commute × P_crime
```
Sort descending; return top 5.

---

## 6. Live Crime Data Service (`backend/app/services/crime.py`)

Uses the free Met Police API (no auth required):
```
GET https://data.police.uk/api/crimes-at-location?lat={lat}&lng={lng}&date={YYYY-MM}
```

- `fetch_crime_count(lat, lng)` — fetches most recent available month; converts raw count → `incidents_per_1k` using fixed per-neighbourhood population estimate
- In-memory cache keyed by `(lat, lng)` — updates monthly
- Graceful fallback to static seed value if API unreachable
- Called concurrently (same semaphore pattern as `batch_commute_times`) inside `POST /search`

---

## 7. Frontend Component Architecture

### Step 1 — Postcode Entry (`/`)
- Hero section with animated gradient background
- Large central input for workplace postcode
- "Next" button fades in on valid UK postcode format

### Step 2 — Commute Mode (`/commute`)
- Toggle: Transit / Driving

### Step 3 — Priority Sliders (`/priorities`) — `Step2Priorities.jsx`
**Split-view Dashboard layout**:
- **Left column (60%)**: Four slim slider rows — Safety / Convenience / Cost / Entertainment
- **Right column (40%)**: Sticky Radar Chart that updates in real-time

**Slider logic — Locked Redistribution**:
- Each category has a lock toggle (boolean state)
- Adjusting an unlocked slider redistributes delta proportionally across other unlocked sliders
- Total sum always remains constant
- All other sliders locked → current slider frozen

**Semantic Labels** (updates live):
- Safety: 1–3 → "High urban activity" | 8–10 → "Quiet & Secure"
- Convenience: 1–3 → "Remote/Secluded" | 8–10 → "Commuter Paradise"
- Cost: 1–3 → "Luxury/Premium" | 8–10 → "Budget Friendly"
- Entertainment: 1–3 → "Peaceful" | 8–10 → "Vibrant Nightlife"

**Active state polish**:
- Hover/interact on slider → scale corresponding Radar Chart point 1.2×
- Glow on slider track using category accent colour
- Radar Chart colours match slider accents

**Technical constraints**:
- Values sent to handler must always be integers
- Sliders bounded [0, 10]

### Step 4 — Loading (`/loading`)
- Animated loading state while `POST /search` resolves

### Step 5 — Top 5 Results (`/results`) — `Step3Results.jsx`
- **Search bar**: "Looking for a specific area?" — autocomplete hits `GET /api/v1/locations/search`; matching result renders as a Herocard, suspending the algorithm's Top 5 list
- Each result card = **Herocard**: `image_url` as full background / header
- Shows: sub-area name, borough, Match Score, per-category score breakdown, commute time
- `🚔 Live crime data` badge visible when `isLiveCrime: true`
- `🚇 Live TfL times` badge (existing)
- Click "View Available Properties" → navigates to `StepListings` for that sub-area
- Accordion-style expansion on card click for deeper summary

### Step 6 — Property Listings + Neighbourhood Profile (`/listings/:locationId`) — `StepListings.jsx`
*(Repurposed from `Step4SubAreas.jsx`)*

**Property Grid section**:
- `<PlatformTabs />`: maps `['Zoopla', 'OpenRent', 'SpareRoom']`; `onClick` sets `activePlatform` state
- `<PropertyGrid />`: receives `listingsData` prop; `.map()` → `<PropertyCard />`
- `<PropertyCard />`: lazy image, `Intl.NumberFormat` GBP rent, `<a href target="_blank" rel="noopener noreferrer">`
- `<motion.div layout>` on grid; `staggerChildren: 0.1` cascade on platform switch
- `isLoading` state → animated loading skeletons

**Journey Simulator section** (react-leaflet):
- Toggle: `[🏠 To Work]` / `[🏢 To Home]`
- Time picker dropdown (e.g. `08:30 AM`)
- Map draws transit polyline from neighbourhood → work postcode (via `GET /api/v1/commute/simulator`)
- Step-by-step directions panel alongside the map

**Safety & Crime Context panel**:
- `isLiveCrime` badge
- Exact incidents per 1,000 residents
- Friendly percentile string (e.g. "Top 10% Safest in London")

**Cost of Living Micro-Table**:
- 🏛️ Council Tax Band estimate
- 🍺 Average pint price
- 🛒 Nearest everyday amenities

**Navigation**: Floating "Back to Results" button using `navigate(-1)`

---

## 8. Implementation Roadmap

1. Initialise FastAPI app structure: `main.py`, `models/`, `api/`, `services/`, `data/`
2. Docker Compose: FastAPI + PostGIS containers
3. Build `locations` table schema; write `seed.py` with 50–80 sub-area rows
4. Implement `POST /search` with mock data and full ranking algorithm
5. Add `services/crime.py` (Met Police API + fallback)
6. Add `GET /api/v1/locations/search` endpoint
7. Add `GET /api/v1/commute/simulator` endpoint (TfL Journey Planner)
8. Playwright scraper for `GET /api/v1/properties/{location_name}`
9. Scaffold React + Vite frontend; apply design system
10. Build Steps 1–4 with static/mock data
11. Build Step 5 (`Step3Results`) with Herocard layout + search bar
12. Build Step 6 (`StepListings`) with property grid + Journey Simulator + Safety panel
13. Wire frontend to live backend endpoints
14. Unit test FastAPI endpoints (HTTP 200, schema validation)
15. Manual end-to-end user journey test

---

## 9. Files to Edit / Create

| File | Action |
|---|---|
| `backend/app/main.py` | Create FastAPI entry point |
| `backend/app/models/location.py` | `locations` schema; `RankedLocation` response (add `image_url`, `isLiveCrime`; remove `subAreas`) |
| `backend/app/api/routes.py` | All endpoints; remove broad-area grouping logic; add `/locations/search` and `/commute/simulator` |
| `backend/app/services/crime.py` | New — Met Police API fetch + in-memory cache |
| `backend/app/data/seed.py` | Replace with 50–80 sub-area rows, realistic stat variance, place-specific `image_url` |
| `houseapp/src/App.jsx` | Remove Step 6 block (`Step4SubAreas`), simplify flow to 5+listings steps |
| `houseapp/src/components/Step2Priorities.jsx` | Split-view layout, locked redistribution, semantic labels, radar chart glow |
| `houseapp/src/components/Step3Results.jsx` | Herocard layout, `image_url` backgrounds, manual search bar, live crime badge |
| `houseapp/src/components/StepListings.jsx` | Renamed from `Step4SubAreas`; add Journey Simulator map, Safety panel, Cost of Living table |
| `docker-compose.yml` | FastAPI + PostGIS services |

---

## 10. Verification Plan

### Automated
- FastAPI unit tests: `POST /search`, `GET /locations/search`, `GET /commute/simulator` all return HTTP 200 with valid schema
- Integer enforcement on slider values
- Slider bounds [0, 10] enforced

### Manual
- Full user journey: Postcode → Commute Mode → Priority Sliders → Results → Listings
- Verify Radar Chart reacts live to slider changes
- Verify Herocard `image_url` loads for all 5 result cards
- Verify live crime badge appears when `isLiveCrime: true`
- Verify Journey Simulator map renders polyline on `StepListings`
- Responsive layout: mobile and desktop
- Hover states, animations, and accordion expand

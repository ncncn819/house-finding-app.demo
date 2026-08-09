# HouseApp — UK House-Finding App

A web app that helps you find the best sub-area in London to live in, based on your
workplace postcode and personalised priority weights (safety, convenience, cost,
entertainment). It ranks specific neighbourhoods — e.g. "Canada Water", "Clapham" —
rather than broad boroughs.

## Flow

1. Enter your work postcode
2. Pick a commute mode (transit / driving)
3. Weigh your priorities with sliders
4. The ranking algorithm runs
5. Browse the top 5 sub-areas
6. Drill into property listings and a neighbourhood profile dashboard

## Stack

**Frontend** — React + Vite, vanilla CSS modules, Framer Motion, Leaflet, Lucide icons

**Backend** — FastAPI (async), SQLAlchemy, PostgreSQL + PostGIS, Pandas/NumPy for
z-score normalisation, Playwright for listing scrapes

## Project layout

```
backend/     FastAPI service — API routes, ranking services, data
houseapp/    React + Vite frontend
plan/        Master implementation plan
```

## Getting started

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in your own keys
uvicorn main:app --reload --port 8000
```

Swagger docs at http://localhost:8000/docs

### Frontend

```bash
cd houseapp
npm install
cp .env.example .env      # then fill in your own keys
npm run dev
```

### Docker

```bash
cd backend
docker compose up
```

## Tests

```bash
make test
```

Runs `pytest` for the backend and `vitest` for the frontend. Individual suites are
available as `make test-backend` and `make test-frontend`.

## Configuration

Both `backend/` and `houseapp/` read config from a local `.env`, which is **not**
committed. Copy the matching `.env.example` and supply your own API keys (TfL, Google
Maps, Unsplash, RapidAPI).

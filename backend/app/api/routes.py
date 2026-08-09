"""
routes.py — API endpoints

  POST /api/v1/search                        → ranked top-5 sub-area locations
  GET  /api/v1/locations/search?q={query}    → autocomplete sub-area lookup
  GET  /api/v1/properties/{name}             → scraped property listings
  GET  /api/v1/health                        → liveness check
"""
import asyncio
from datetime import datetime, timezone
import json as json_lib

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.location import (
    Location,
    PropertiesResponse,
    RankedLocation,
    SearchRequest,
    SearchResponse,
)
from app.services.commute import batch_commute_times
from app.services.crime import batch_crime_rates, fetch_crime_rate, fetch_crime_yearly
from app.services.geocoding import haversine_km, postcode_to_latlng
from app.services.rent import fetch_borough_rents
from app.services.rent_timeseries import fetch_borough_rent_yearly
from app.services.amenities import batch_amenity_counts
from app.services.buildings import fetch_residential_buildings
from app.services.census_density import get_oa_density
from app.services.ranking import rank_locations
from app.services.scraper import scrape_openrent

settings = get_settings()

router = APIRouter()

MAX_RADIUS_KM = 35.0
MAX_LIVE_COMMUTE_DESTINATIONS = 18
MAX_LIVE_CRIME_DESTINATIONS = 20
MAX_LIVE_AMENITY_DESTINATIONS = 12

SEARCH_TIMEOUT_COMMUTE_S = 8.0
SEARCH_TIMEOUT_CRIME_S = 7.0
SEARCH_TIMEOUT_RENT_S = 5.0
SEARCH_TIMEOUT_AMENITY_S = 6.0


async def _with_timeout(coro, timeout_s: float, default):
    """Bound third-party latency so /search can return quickly with fallbacks."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout_s)
    except Exception:
        return default

# ─── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok"}


# ─── Endpoint 1: POST /search ─────────────────────────────────────────────────

@router.post("/search", response_model=SearchResponse)
async def search(payload: SearchRequest, db: AsyncSession = Depends(get_db)):
    """
    1. Geocode work postcode.
    2. Filter sub-area locations within MAX_RADIUS_KM.
    3. Fetch live TfL commute times concurrently.
    4. Run Z-score + WLC + penalty ranking.
    5. Return top 5 ranked sub-areas.
    """
    coords = await postcode_to_latlng(payload.workPostcode)
    if coords is None:
        raise HTTPException(status_code=422, detail=f"Could not geocode postcode: {payload.workPostcode}")
    origin_lat, origin_lng = coords

    result = await db.execute(select(Location))
    all_locations: list[Location] = result.scalars().all()

    nearby = [
        loc for loc in all_locations
        if haversine_km(origin_lat, origin_lng, loc.lat, loc.lng) <= MAX_RADIUS_KM
    ]
    if not nearby:
        nearby = all_locations

    # Keep the user-facing ranking fast: cap live lookups and fall back to static
    # seed values for the rest when third-party APIs are slow.
    nearby_sorted = sorted(
        nearby,
        key=lambda loc: haversine_km(origin_lat, origin_lng, loc.lat, loc.lng),
    )
    destinations_for_commute = [
        (loc.lat, loc.lng, loc.name) for loc in nearby_sorted[:MAX_LIVE_COMMUTE_DESTINATIONS]
    ]
    destinations_for_crime = [
        (loc.lat, loc.lng, loc.name) for loc in nearby_sorted[:MAX_LIVE_CRIME_DESTINATIONS]
    ]
    destinations_for_amenities = []
    if len(nearby_sorted) <= 20:
        destinations_for_amenities = [
            (loc.lat, loc.lng, loc.name) for loc in nearby_sorted[:MAX_LIVE_AMENITY_DESTINATIONS]
        ]

    commute_task = _with_timeout(
        batch_commute_times(
            origin_postcode=payload.workPostcode,
            destinations=destinations_for_commute,
            mode=payload.commuteMode,
            max_concurrent=8,
        ),
        SEARCH_TIMEOUT_COMMUTE_S,
        {},
    )
    crime_task = _with_timeout(
        batch_crime_rates(destinations_for_crime, max_concurrent=8),
        SEARCH_TIMEOUT_CRIME_S,
        {},
    )
    rent_task = _with_timeout(fetch_borough_rents(), SEARCH_TIMEOUT_RENT_S, None)
    if destinations_for_amenities:
        amenities_task = _with_timeout(
            batch_amenity_counts(destinations_for_amenities, max_concurrent=2),
            SEARCH_TIMEOUT_AMENITY_S,
            {},
        )
    else:
        amenities_task = asyncio.sleep(0, result={})

    commute_times, live_crime, live_rents, live_amenities = await asyncio.gather(
        commute_task,
        crime_task,
        rent_task,
        amenities_task,
    )

    is_real_time = len(commute_times) > 0
    is_live_crime = len(live_crime) > 0
    is_live_rents = live_rents is not None and len(live_rents) > 0
    is_live_amenities = len(live_amenities) > 0

    ranked = rank_locations(
        locations=nearby,
        commute_mode=payload.commuteMode,
        commute_times=commute_times,
        weights=payload.weights,
        live_crime_rates=live_crime if is_live_crime else None,
        live_rents=live_rents if is_live_rents else None,
        live_amenity_counts=live_amenities if is_live_amenities else None,
    )

    return SearchResponse(
        results=ranked,
        isRealTime=is_real_time,
        isLiveCrime=is_live_crime,
        isLiveRents=is_live_rents,
        isLiveAmenities=is_live_amenities,
        postcode=payload.workPostcode.upper().strip(),
    )


# ─── Endpoint 2: GET /locations/search ────────────────────────────────────────

@router.get("/locations/search", response_model=list[RankedLocation])
async def locations_search(
    q: str = Query(..., min_length=2, description="Sub-area name to search"),
    db: AsyncSession = Depends(get_db),
):
    """
    Autocomplete search — returns up to 6 sub-areas whose name contains the query.
    Used by the frontend search bar so users can look up a specific neighbourhood.
    Results include full stats so the frontend can render a hero card immediately.
    """
    result = await db.execute(
        select(Location)
        .where(Location.name.ilike(f"%{q}%"))
        .order_by(Location.name)
        .limit(6)
    )
    locations: list[Location] = result.scalars().all()

    return [
        {
            "id":           str(loc.id),
            "name":         loc.name,
            "borough":      loc.borough,
            "displayScore": 0,
            "commuteTime":  loc.commute_transit_min,
            "avgRent":      loc.avg_rent_pcm,
            "crimePenalty": False,
            "isRealTime":   False,
            "metricBars":   {"safety": 50, "convenience": 50, "cost": 50, "entertainment": 50},
            "description":  loc.description or "",
            "highlights":   loc.highlights_list(),
            "imageUrl":     loc.image_url,
            "lat":          loc.lat,
            "lng":          loc.lng,
            "crimeRate":    round(loc.crime_incidents_per_1k, 1),
        }
        for loc in locations
    ]


# ─── Endpoint 4: GET /commute/simulator ───────────────────────────────────────

TFL_JOURNEY_URL = "https://api.tfl.gov.uk/Journey/JourneyResults/{origin}/to/{destination}"
TFL_TRANSIT_MODE = "tube,dlr,elizabeth-line,overground,bus,national-rail,walking"


@router.get("/commute/simulator")
async def commute_simulator(
    from_lat: float = Query(...),
    from_lng: float = Query(...),
    to_postcode: str = Query(...),
    time: str = Query(default="0830"),
    direction: str = Query(default="toWork"),
):
    """
    Fetch a step-by-step journey from the TfL Journey Planner.
    Returns leg-by-leg breakdown and a polyline array for rendering on a map.
    Falls back to an empty response if TfL is unreachable.
    """
    clean_postcode = to_postcode.replace(" ", "")
    coord_str = f"{from_lat}%2C{from_lng}"

    if direction == "toWork":
        origin, destination = coord_str, clean_postcode
    else:
        origin, destination = clean_postcode, coord_str

    url = TFL_JOURNEY_URL.format(origin=origin, destination=destination)
    params: dict = {
        "time": time,
        "timeIs": "Departing",
        "mode": TFL_TRANSIT_MODE,
        "journeyPreference": "LeastTime",
    }
    if settings.TFL_APP_KEY:
        params["app_key"] = settings.TFL_APP_KEY

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return {"duration": 0, "legs": [], "polyline": []}
            data = resp.json()

        journeys = data.get("journeys", [])
        if not journeys:
            return {"duration": 0, "legs": [], "polyline": []}

        journey = journeys[0]
        total_duration = journey.get("duration", 0)
        legs = []
        all_points: list[list[float]] = []

        for leg in journey.get("legs", []):
            mode_id = leg.get("mode", {}).get("id", "walking")
            summary = leg.get("instruction", {}).get("summary", "")
            duration = leg.get("duration", 0)

            points: list[list[float]] = []
            line_str = leg.get("path", {}).get("lineString")
            if line_str:
                try:
                    raw = json_lib.loads(line_str)
                    points = [[float(p[0]), float(p[1])] for p in raw]
                except Exception:
                    pass
            if not points:
                dep = leg.get("departurePoint", {})
                arr = leg.get("arrivalPoint", {})
                if dep and arr:
                    points = [
                        [float(dep.get("lat", 0)), float(dep.get("lon", 0))],
                        [float(arr.get("lat", 0)), float(arr.get("lon", 0))],
                    ]

            legs.append({"mode": mode_id, "summary": summary, "duration": duration, "points": points})
            all_points.extend(points)

        return {"duration": total_duration, "legs": legs, "polyline": all_points}

    except Exception:
        return {"duration": 0, "legs": [], "polyline": []}


# ─── Endpoint 5: GET /crime/yearly ─────────────────────────────────────────────

@router.get("/crime/yearly")
async def get_crime_yearly(
    lat: float = Query(...),
    lng: float = Query(...),
    years: int = Query(default=5, ge=1, le=10),
):
    series = await _with_timeout(fetch_crime_yearly(lat, lng, years), timeout_s=35.0, default=None)
    if not series:
        # Fallback to a flat trend from the lighter 2-month crime lookup so the
        # chart remains available when historical monthly fetches are throttled.
        rate = await _with_timeout(fetch_crime_rate(lat, lng), timeout_s=10.0, default=None)
        if rate is not None:
            current_year = datetime.now(timezone.utc).year
            start_year = current_year - years + 1
            series = [
                {"year": start_year + i, "weighted_per_1k": round(float(rate), 2), "months_counted": 2}
                for i in range(years)
            ]
    if not series:
        raise HTTPException(status_code=503, detail="Crime API unreachable")
    return {"lat": lat, "lng": lng, "years": years, "series": series}


# ─── Endpoint 6: GET /rent/yearly ──────────────────────────────────────────────

@router.get("/rent/yearly")
async def get_rent_yearly(
    borough: str = Query(...),
    years: int = Query(default=5, ge=1, le=10),
):
    series = await _with_timeout(fetch_borough_rent_yearly(borough, years), timeout_s=20.0, default=None)
    if series is None:
        raise HTTPException(status_code=503, detail="Rent trend unavailable (seed missing and live PRMS fetch failed)")
    return {"borough": borough, "years": years, "series": series}


# ─── Endpoint 7: GET /buildings/residential ───────────────────────────────────

@router.get("/buildings/residential")
async def get_residential_buildings(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(default=400),
):
    """
    Return nearby residential building centroids for heatmap rendering.
    """
    points = await fetch_residential_buildings(lat, lng, radius)
    if points is None:
        return {"points": []}
    return {"points": points}


@router.get("/density/oa")
async def get_density_oa(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(default=400, ge=100, le=2000),
):
    return get_oa_density(lat, lng, radius)


# ─── Endpoint 3: GET /properties/{location_name} ──────────────────────────────

@router.get("/properties/{location_name}", response_model=PropertiesResponse)
async def get_properties(location_name: str):
    """
    Trigger an async Playwright scrape of OpenRent for the given London location.
    Returns up to 10 normalised property listings. Failures return empty list.
    """
    listings = await scrape_openrent(location_name)
    return PropertiesResponse(location=location_name, listings=listings)

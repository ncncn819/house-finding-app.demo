"""
crime.py — Live crime data from the Met Police public API.

Endpoint: https://data.police.uk/api/crimes-at-location
- Free, no API key required
- Updated monthly
- Returns individual crime records for a lat/lng point

Strategy:
  1. Fetch crimes for the last 3 available months and average them (smooths anomalies).
  2. Normalise raw count to incidents_per_1k using fixed neighbourhood population estimates.
  3. Cache in-memory keyed by (lat, lng) — results are stable within a session.
  4. On any failure, return None so the caller falls back to the DB static value.
"""
import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx

MET_POLICE_URL = "https://data.police.uk/api/crimes-street/all-crime"

# crimes-street returns all crimes within ~1 mile radius of the given point.
# A 1-mile radius covers ~8 km² — at London's average density of ~10-12k/km²
# that yields roughly 80k–100k residents in the catchment zone.
DEFAULT_POPULATION = 100_000

# In-process cache: (lat_rounded, lng_rounded) → incidents_per_1k
_cache: dict[tuple[float, float], float] = {}
_yearly_cache: dict[tuple[float, float, int], list[dict]] = {}
_yearly_cache_at: dict[tuple[float, float, int], datetime] = {}
YEARLY_CACHE_TTL_HOURS = 24

CRIME_SEVERITY = {
    "violent-crime": 3.0,
    "sexual-offences": 3.0,
    "robbery": 2.5,
    "possession-of-weapons": 2.5,
    "anti-social-behaviour": 2.0,
    "burglary": 1.5,
    "theft-from-the-person": 1.5,
    "public-order": 1.5,
    "criminal-damage-arson": 1.2,
    "drugs": 1.0,
    "other-theft": 1.0,
    "other-crime": 1.0,
    "vehicle-crime": 0.7,
    "bicycle-theft": 0.5,
    "shoplifting": 0.3,
}
DEFAULT_SEVERITY = 1.0


def _round_coord(v: float) -> float:
    """Round to 3dp to group very close points to one cache key."""
    return round(v, 3)


def _recent_months(n: int = 2) -> list[str]:
    """Return the last N months as YYYY-MM strings. Police data lags ~2 months."""
    months = []
    d = date.today().replace(day=1)
    for _ in range(n):
        d -= timedelta(days=1)          # go to last day of previous month
        months.append(d.strftime("%Y-%m"))
        d = d.replace(day=1)           # back to 1st of that month
    return months


def _is_yearly_cache_valid(key: tuple[float, float, int], now: datetime) -> bool:
    cached_at = _yearly_cache_at.get(key)
    if cached_at is None:
        return False
    return (now - cached_at) < timedelta(hours=YEARLY_CACHE_TTL_HOURS)


async def _fetch_month(client: httpx.AsyncClient, lat: float, lng: float, month: str) -> tuple[float, int]:
    """Fetch weighted and raw crime counts for one month. Returns (0.0, 0) on failure."""
    try:
        resp = await client.get(
            MET_POLICE_URL,
            params={"lat": lat, "lng": lng, "date": month},
            timeout=8.0,
        )
        if resp.status_code == 200:
            records = resp.json()
            if not isinstance(records, list):
                return 0.0, 0
            weighted = 0.0
            raw = 0
            for record in records:
                if not isinstance(record, dict):
                    continue
                category = record.get("category")
                severity = CRIME_SEVERITY.get(category, DEFAULT_SEVERITY)
                weighted += severity
                raw += 1
            return weighted, raw
    except Exception:
        pass
    return 0.0, 0


async def fetch_crime_rate(lat: float, lng: float) -> Optional[float]:
    """
    Return estimated perceived-harm-weighted crime incidents per 1,000 residents.
    Returns None if the API is unreachable so the caller can fall back to static data.
    """
    key = (_round_coord(lat), _round_coord(lng))
    if key in _cache:
        return _cache[key]

    months = _recent_months(2)

    async with httpx.AsyncClient() as client:
        counts = await asyncio.gather(
            *[_fetch_month(client, lat, lng, m) for m in months],
            return_exceptions=True,
        )

    # Only count months that returned real data (raw > 0).
    valid = [c for c in counts if isinstance(c, tuple) and len(c) == 2 and c[1] > 0]
    if not valid:
        return None

    avg_monthly_weighted = sum(weighted for weighted, _raw in valid) / len(valid)
    annual_estimate = avg_monthly_weighted * 12
    per_1k = round((annual_estimate / DEFAULT_POPULATION) * 1000, 1)

    _cache[key] = per_1k
    return per_1k


async def fetch_crime_yearly(lat: float, lng: float, years: int = 5) -> Optional[list[dict]]:
    """
    Returns [{"year": 2021, "weighted_per_1k": float, "months_counted": int}, ...]
    ordered oldest → newest. None on total failure.
    """
    key = (_round_coord(lat), _round_coord(lng), years)
    now = datetime.now(timezone.utc)
    if key in _yearly_cache and _is_yearly_cache_valid(key, now):
        return _yearly_cache[key]

    months = _recent_months(years * 12)
    if not months:
        return None

    semaphore = asyncio.Semaphore(6)

    async with httpx.AsyncClient() as client:
        async def fetch_one(month: str) -> tuple[str, tuple[float, int]]:
            async with semaphore:
                weighted, raw = await _fetch_month(client, lat, lng, month)
                return month, (weighted, raw)

        results = await asyncio.gather(
            *[fetch_one(month) for month in months],
            return_exceptions=True,
        )

    by_year: dict[int, list[tuple[float, int]]] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        month, counts = result
        try:
            year = int(month.split("-", 1)[0])
        except Exception:
            continue
        weighted, raw = counts
        by_year.setdefault(year, []).append((float(weighted), int(raw)))

    if not by_year:
        return None

    series: list[dict] = []
    for year in sorted(by_year.keys()):
        months_in_year = by_year[year]
        total_weighted = sum(weighted for weighted, raw in months_in_year if raw > 0)
        months_counted = sum(1 for _weighted, raw in months_in_year if raw > 0)
        if months_counted == 0:
            continue
        annual_weighted = total_weighted * (12 / months_counted)
        weighted_per_1k = round((annual_weighted / DEFAULT_POPULATION) * 1000, 2)
        series.append(
            {
                "year": year,
                "weighted_per_1k": weighted_per_1k,
                "months_counted": months_counted,
            }
        )

    if not series:
        return None

    trimmed = series[-years:]
    _yearly_cache[key] = trimmed
    _yearly_cache_at[key] = now
    return trimmed


async def batch_crime_rates(
    locations: list[tuple[float, float, str]],   # (lat, lng, name)
    max_concurrent: int = 6,
) -> dict[str, float]:
    """
    Fetch live crime rates for multiple locations concurrently.
    Returns { location_name: incidents_per_1k } for successful lookups only.
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(lat: float, lng: float, name: str) -> tuple[str, Optional[float]]:
        async with semaphore:
            rate = await fetch_crime_rate(lat, lng)
            return name, rate

    results = await asyncio.gather(
        *[fetch_one(lat, lng, name) for lat, lng, name in locations],
        return_exceptions=True,
    )

    return {
        name: rate
        for result in results
        if not isinstance(result, Exception)
        for name, rate in [result]
        if rate is not None
    }

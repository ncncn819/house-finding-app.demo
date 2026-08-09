"""
commute.py — TfL Journey Planner wrapper with in-memory LRU cache.

The TfL Unified API is free for read-only access without a key (rate-limited).
Providing TFL_APP_KEY in .env removes the rate limit.

Cache strategy: commute times are stable across a session — cache keyed by
(origin_postcode, destination_lat_lng, mode) to avoid redundant API calls.
"""
import asyncio
from functools import lru_cache
from typing import Optional

import httpx

from app.config import get_settings

settings = get_settings()

TFL_BASE = "https://api.tfl.gov.uk/Journey/JourneyResults/{origin}/to/{destination}"

# Simple in-process cache: (origin, dest_name, mode) → minutes
_cache: dict[tuple[str, str, str], int] = {}


async def get_commute_time(
    origin_postcode: str,
    dest_lat: float,
    dest_lng: float,
    dest_name: str,
    mode: str = "transit",
) -> Optional[int]:
    """
    Fetch journey time in minutes from origin postcode to a destination lat/lng.

    Returns None if TfL is unreachable — caller should fall back to static data.
    Mode: "transit" uses public transport; "car" uses driving.
    """
    cache_key = (origin_postcode.upper().replace(" ", ""), dest_name, mode)
    if cache_key in _cache:
        return _cache[cache_key]

    tfl_mode = "tube,dlr,elizabeth-line,overground,bus,national-rail" if mode == "transit" else "driving"
    # TfL requires no spaces in postcode and comma-separated coords URL-encoded in path
    origin_clean = origin_postcode.replace(" ", "")
    dest_str = f"{dest_lat}%2C{dest_lng}"
    url = TFL_BASE.format(origin=origin_clean, destination=dest_str)

    params: dict[str, str] = {"journeyPreference": "LeastTime", "mode": tfl_mode}
    if settings.TFL_APP_KEY:
        params["app_key"] = settings.TFL_APP_KEY

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            journeys = data.get("journeys", [])
            if journeys:
                duration = int(journeys[0].get("duration", 0))
                _cache[cache_key] = duration
                return duration
        except Exception:
            pass

    return None


async def batch_commute_times(
    origin_postcode: str,
    destinations: list[tuple[float, float, str]],  # (lat, lng, name)
    mode: str = "transit",
    max_concurrent: int = 5,
) -> dict[str, int]:
    """
    Fetch commute times for multiple destinations concurrently.
    Respects TfL's rate limits with a semaphore (max 5 concurrent requests).

    Returns a dict of { destination_name: minutes } for successful lookups only.
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(lat: float, lng: float, name: str) -> tuple[str, Optional[int]]:
        async with semaphore:
            minutes = await get_commute_time(origin_postcode, lat, lng, name, mode)
            return name, minutes

    tasks = [fetch_one(lat, lng, name) for lat, lng, name in destinations]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    commute_map: dict[str, int] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        name, minutes = result
        if minutes is not None:
            commute_map[name] = minutes

    return commute_map

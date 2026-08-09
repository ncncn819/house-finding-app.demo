"""
amenities.py — Live amenity counts from Overpass (OpenStreetMap).

Counts nearby nightlife/food amenities and returns raw counts. Ranking normalises
those values via z-scores, so no extra scaling is needed here.
"""
from __future__ import annotations

import asyncio
from typing import Optional

import httpx

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)

# (lat_rounded, lng_rounded, radius_m) -> count
_cache: dict[tuple[float, float, int], int] = {}


def _round_coord(v: float) -> float:
    return round(v, 3)


def _build_query(lat: float, lng: float, radius_m: int) -> str:
    return (
        "[out:json][timeout:15];"
        "("
        f'node[amenity~"restaurant|bar|pub|cafe|cinema|theatre|nightclub"](around:{radius_m},{lat},{lng});'
        ");"
        "out count;"
    )


def _extract_count(payload: dict) -> int | None:
    elements = payload.get("elements")
    if not isinstance(elements, list):
        return None

    for element in elements:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags")
        if not isinstance(tags, dict):
            continue
        total = tags.get("total")
        if total is None:
            continue
        try:
            count = int(total)
        except (TypeError, ValueError):
            return None
        return max(count, 0)

    return None


async def _fetch_overpass_payload(query: str) -> dict | None:
    for url in OVERPASS_URLS:
        try:
            async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
                resp = await client.get(url, params={"data": query})
                resp.raise_for_status()
                return resp.json()
        except Exception:
            continue
    return None


async def fetch_amenity_count(lat: float, lng: float, radius_m: int = 1000) -> Optional[int]:
    """Return nearby amenity count for a single point, or None on failure."""
    key = (_round_coord(lat), _round_coord(lng), radius_m)
    if key in _cache:
        return _cache[key]

    query = _build_query(lat, lng, radius_m)

    try:
        payload = await _fetch_overpass_payload(query)
        if payload is None:
            return None

        count = _extract_count(payload)
        if count is None:
            return None

        _cache[key] = count
        return count
    except Exception:
        return None


async def batch_amenity_counts(
    locations: list[tuple[float, float, str]],
    max_concurrent: int = 3,
) -> dict[str, int]:
    """Fetch amenity counts for multiple locations with bounded concurrency."""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(lat: float, lng: float, name: str) -> tuple[str, Optional[int]]:
        async with semaphore:
            value = await fetch_amenity_count(lat, lng)
            return name, value

    tasks = [fetch_one(lat, lng, name) for lat, lng, name in locations]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: dict[str, int] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        name, value = result
        if value is not None:
            out[name] = value
    return out

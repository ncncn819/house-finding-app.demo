"""
buildings.py — Residential building hotspots from OpenStreetMap Overpass.
"""
from __future__ import annotations

from typing import Optional

import httpx

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)

_cache: dict[tuple[float, float, int], list[list[float]]] = {}


def _round_coord(v: float) -> float:
    return round(v, 3)


def _build_query(lat: float, lng: float, radius_m: int) -> str:
    return (
        "[out:json][timeout:15];"
        "("
        f'node[building~"residential|apartments|house|terrace|detached|semidetached_house"](around:{radius_m},{lat},{lng});'
        f'way[building~"residential|apartments|house|terrace|detached|semidetached_house"](around:{radius_m},{lat},{lng});'
        ");"
        "out center tags;"
    )


def _build_fallback_query(lat: float, lng: float, radius_m: int) -> str:
    # Fallback for city-centre areas where explicit residential tags are sparse.
    return (
        "[out:json][timeout:15];"
        "("
        f'way[building](around:{radius_m},{lat},{lng});'
        ");"
        "out center tags;"
    )


def _extract_points(payload: dict) -> list[list[float]]:
    points: list[list[float]] = []
    elements = payload.get("elements")
    if not isinstance(elements, list):
        return points

    for element in elements:
        if not isinstance(element, dict):
            continue

        # Resolve centroid — same as before.
        lat = element.get("lat")
        lon = element.get("lon")
        if lat is None or lon is None:
            center = element.get("center")
            if isinstance(center, dict):
                lat = center.get("lat")
                lon = center.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue

        # Weight by building:levels. Default 1; clamp to [1, 30] to avoid
        # outlier tags dominating the visual.
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        raw_levels = tags.get("building:levels") if tags else None
        try:
            levels = int(float(raw_levels)) if raw_levels else 1
        except (ValueError, TypeError):
            levels = 1
        levels = max(1, min(levels, 30))

        points.append([float(lat), float(lon), float(levels)])

    return points


async def _fetch_overpass_payload(query: str) -> dict | None:
    for url in OVERPASS_URLS:
        try:
            async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": "HouseApp/1.0"}) as client:
                resp = await client.get(url, params={"data": query})
                resp.raise_for_status()
                return resp.json()
        except Exception:
            continue
    return None


async def fetch_residential_buildings(lat: float, lng: float, radius_m: int = 400) -> Optional[list[list[float]]]:
    """Return [lat, lng] points for nearby residential buildings, or None on error."""
    key = (_round_coord(lat), _round_coord(lng), radius_m)
    if key in _cache:
        return _cache[key]

    query = _build_query(lat, lng, radius_m)
    try:
        payload = await _fetch_overpass_payload(query)
        if payload is None:
            return None

        points = _extract_points(payload)
        if not points:
            fallback_query = _build_fallback_query(lat, lng, radius_m)
            payload = await _fetch_overpass_payload(fallback_query)
            if payload is None:
                return None
            points = _extract_points(payload)

        _cache[key] = points
        return points
    except Exception:
        return None

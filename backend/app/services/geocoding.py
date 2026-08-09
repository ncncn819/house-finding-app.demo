"""
geocoding.py — Convert UK postcodes to lat/lng using postcodes.io (free, no API key).
"""
import math
from typing import Optional

import httpx

POSTCODES_IO = "https://api.postcodes.io/postcodes/{postcode}"


async def postcode_to_latlng(postcode: str) -> Optional[tuple[float, float]]:
    """
    Returns (lat, lng) for a UK postcode, or None if lookup fails.
    Uses postcodes.io — free, no authentication required.
    """
    clean = postcode.strip().replace(" ", "").upper()
    url = POSTCODES_IO.format(postcode=clean)

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            result = data.get("result", {})
            lat = result.get("latitude")
            lng = result.get("longitude")
            if lat is not None and lng is not None:
                return float(lat), float(lng)
        except Exception:
            pass

    return None


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Great-circle distance in kilometres between two lat/lng points.
    Used to filter locations within a commutable radius (≤ 32 km ≈ 20 miles).
    """
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

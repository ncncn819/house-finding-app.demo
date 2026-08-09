"""
census_density.py — Cheap haversine-filtered access to Greater London Output
Area population density.

Loads the static GeoJSON (built once by scripts/build_oa_density.py) into
process memory on first call. Each query returns the OAs whose pre-computed
centroids fall inside (radius_m + 200 m) of the query point. No spatial
library at runtime — pre-stamped centroids do all the geometry work.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "london_oa_density.geojson"


@lru_cache(maxsize=1)
def _load_oa_index() -> list[dict]:
    """Read the GeoJSON once; flatten to a list of {centroid_lat, centroid_lng, feature}."""
    if not DATA_PATH.exists():
        return []
    try:
        geojson = json.loads(DATA_PATH.read_text())
    except Exception:
        return []

    out: list[dict] = []
    for feature in geojson.get("features", []):
        props = (feature or {}).get("properties") or {}
        c_lat = props.get("centroid_lat")
        c_lng = props.get("centroid_lng")
        if not isinstance(c_lat, (int, float)) or not isinstance(c_lng, (int, float)):
            continue
        out.append({"centroid_lat": float(c_lat), "centroid_lng": float(c_lng), "feature": feature})
    return out


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(a))


def get_oa_density(lat: float, lng: float, radius_m: int = 400) -> dict:
    """
    Return GeoJSON FeatureCollection of OAs whose centroid is within
    (radius_m + 200 m) of the query point. Extra 200 m ensures partial
    overlaps still render at the edge of the catchment.
    """
    buffer_km = (radius_m + 200) / 1000
    matched = [
        entry["feature"]
        for entry in _load_oa_index()
        if _haversine_km(lat, lng, entry["centroid_lat"], entry["centroid_lng"]) <= buffer_km
    ]
    return {"type": "FeatureCollection", "features": matched}

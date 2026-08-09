"""
rent_timeseries.py — Yearly borough rent (£/month) over the last 5 years.

Data sources:
  - Historical years: app/data/borough_rent_history.json
        (built once by scripts/build_rent_seed.py from Wayback-archived PRMS
         workbooks; each datapoint is an observed median for that borough).
  - Latest year: live PRMS via rent.py:fetch_borough_rents() (24h cached).

Each borough's curve is therefore genuinely per-borough in BOTH level and
shape — there's no shared multiplier.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from app.services.rent import (
    LONDON_BOROUGHS,
    _normalise_borough,
    fetch_borough_rents,
)

SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "borough_rent_history.json"
CACHE_TTL_HOURS = 24

_cache: dict[str, list[dict]] = {}
_cache_at: dict[str, datetime] = {}


@lru_cache(maxsize=1)
def _load_seed() -> dict[str, dict[int, int]]:
    """Load the seed JSON once. Returns {borough: {year_int: median_int}}."""
    if not SEED_PATH.exists():
        return {}
    try:
        payload = json.loads(SEED_PATH.read_text())
    except Exception:
        return {}

    raw = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw, dict):
        return {}

    out: dict[str, dict[int, int]] = {}
    for borough, by_year in raw.items():
        if not isinstance(by_year, dict):
            continue
        cleaned: dict[int, int] = {}
        for year_str, value in by_year.items():
            try:
                cleaned[int(year_str)] = int(value)
            except (ValueError, TypeError):
                continue
        if cleaned:
            out[borough] = cleaned
    return out


def _is_cache_valid(key: str, now: datetime) -> bool:
    cached = _cache_at.get(key)
    if cached is None:
        return False
    return (now - cached) < timedelta(hours=CACHE_TTL_HOURS)


def _find_borough_match(seed: dict[str, dict[int, int]] | dict[str, int], normalised: str) -> Optional[str]:
    for name in seed:
        if _normalise_borough(name) == normalised:
            return name
    return None


def _with_yoy(series: list[dict]) -> list[dict]:
    out: list[dict] = []
    for idx, row in enumerate(series):
        item = {**row, "yoy_pct": None}
        if idx > 0:
            prev = float(out[idx - 1]["median_gbp"])
            curr = float(item["median_gbp"])
            if prev > 0:
                item["yoy_pct"] = round(((curr - prev) / prev) * 100, 2)
        out.append(item)
    return out


async def fetch_borough_rent_yearly(borough: str, years: int = 5) -> Optional[list[dict]]:
    """
    Returns
        [{"year": 2020, "median_gbp": 1450, "yoy_pct": None,        "release_period": "2020 (PRMS, observed)"},
         {"year": 2021, "median_gbp": 1480, "yoy_pct": 2.07,        "release_period": "2021 (PRMS, observed)"},
         ...,
         {"year": 2024, "median_gbp": 1700, "yoy_pct": 4.94,        "release_period": "2024 (PRMS, live)"}]
    oldest → newest, length ≤ years.

    Returns None when:
      - `borough` is not in LONDON_BOROUGHS
      - the seed file is missing AND live PRMS is unavailable
      - fewer than 2 yearly points can be assembled
    """
    norm = _normalise_borough(borough)
    if norm not in {_normalise_borough(name) for name in LONDON_BOROUGHS}:
        return None

    now = datetime.now(timezone.utc)
    if _is_cache_valid(norm, now) and norm in _cache:
        return _cache[norm][-years:]

    points: dict[int, dict] = {}

    # 1. Historical years from the seed.
    seed = _load_seed()
    seed_borough = _find_borough_match(seed, norm)
    if seed_borough is not None:
        for year, value in seed[seed_borough].items():
            points[year] = {
                "year": year,
                "median_gbp": int(value),
                "release_period": f"{year} (PRMS, observed)",
            }

    # 2. Latest live year from PRMS — overwrites the most recent seed year if
    #    there's a collision.
    try:
        live = await fetch_borough_rents()
    except Exception:
        live = None
    if isinstance(live, dict):
        live_borough = _find_borough_match(live, norm)
        if live_borough is not None:
            live_year = now.year
            points[live_year] = {
                "year": live_year,
                "median_gbp": int(live[live_borough]),
                "release_period": f"{live_year} (PRMS, live)",
            }

    if len(points) < 2:
        return None

    series = [points[year] for year in sorted(points)]
    series = _with_yoy(series)

    _cache[norm] = series
    _cache_at[norm] = now
    return series[-years:]

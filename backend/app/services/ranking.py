"""
ranking.py — Statistical ranking engine (Python/NumPy mirror of frontend scoring.js)

Pipeline:
  A. Z-Score Normalisation      — standardise heterogeneous units onto a common bell curve
  B. Directionality Inversion   — invert "higher = worse" metrics so +z always = good
  C. Exponential Penalty Funcs  — dealbreaker logic for extreme commute / high crime
  D. Weighted Linear Combination — apply user slider weights (sum-to-1 normalised)
  E. Final Scaling              — penalties applied; display scores mapped to 55–95 range
"""
import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.models.location import Location, Weights

WEIGHT_EXPONENT = 2.0
PUNISHMENT_FLOOR = 0.20


# ─── Internal result ───────────────────────────────────────────────────────────

@dataclass
class ScoredLocation:
    location: Location
    rank_score: float
    commute_time: int
    is_real_time: bool
    crime_penalty: bool
    crime_rate: float
    z_safety: float
    z_convenience: float
    z_cost: float
    z_entertainment: float


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _build_weights(w: Weights) -> dict[str, dict[str, float]]:
    """
    Build dual weights:
      - reward: convex-normalised slider weights (high slider values dominate)
      - punishment: each category has at least a floor so bad ignored categories still hurt
    """
    raw = {
        "safety": max(w.safety, 0.0),
        "convenience": max(w.convenience, 0.0),
        "cost": max(w.cost, 0.0),
        "entertainment": max(w.entertainment, 0.0),
    }
    powered = {k: v ** WEIGHT_EXPONENT for k, v in raw.items()}
    total = sum(powered.values()) or 1.0
    reward = {k: v / total for k, v in powered.items()}
    punishment = {k: max(reward[k], PUNISHMENT_FLOOR) for k in reward}
    return {"reward": reward, "punishment": punishment}


def _z_to_display(z: float) -> int:
    """
    Map z ∈ [-3, +3] → display bar 0–100.
    z = +3 → 100 (best), z = 0 → 50 (average), z = -3 → 0 (worst).
    """
    return int(max(0, min(100, round(((z + 3) / 6) * 100))))


# ─── Public API ────────────────────────────────────────────────────────────────

def rank_locations(
    locations: list[Location],
    commute_mode: str,
    commute_times: dict[str, int],          # { location_name: minutes } — TfL live times
    weights: Weights,
    live_crime_rates: dict[str, float] | None = None,  # { name: incidents_per_1k } override
    live_rents: dict[str, int] | None = None,          # { borough: median_monthly_rent }
    live_amenity_counts: dict[str, int] | None = None, # { name: amenity_count }
) -> list[dict[str, Any]]:
    """
    Rank a list of Location ORM objects using the full Z-score + WLC + penalty pipeline.

    Parameters
    ----------
    locations     : ORM rows from the DB
    commute_mode  : "transit" | "car"
    commute_times : live commute times from TfL keyed by location name (may be partial / empty)
    weights       : user priority sliders (0–100 each)

    Returns
    -------
    List of dicts sorted by displayScore descending — top 5 only.
    """
    if not locations:
        return []

    n = len(locations)

    def _vector_with_coverage_guard(
        live_map: dict[str, int] | None,
        key_getter,
        static_getter,
        threshold: float = 0.8,
    ) -> np.ndarray:
        static_values = [float(static_getter(loc)) for loc in locations]
        if not live_map:
            return np.array(static_values, dtype=float)

        live_values_by_index: list[float | None] = []
        live_values: list[float] = []

        for loc in locations:
            key = key_getter(loc)
            value = live_map.get(key)
            if isinstance(value, (int, float)):
                v = float(value)
                live_values_by_index.append(v)
                live_values.append(v)
            else:
                live_values_by_index.append(None)

        coverage = len(live_values) / n if n else 0.0
        if coverage < threshold or not live_values:
            return np.array(static_values, dtype=float)

        backfill = float(np.mean(live_values))
        merged = [v if v is not None else backfill for v in live_values_by_index]
        return np.array(merged, dtype=float)

    # ── Step A: raw vectors ────────────────────────────────────────────────────
    commutes = np.array([
        commute_times.get(loc.name,
            loc.commute_transit_min if commute_mode == "transit" else loc.commute_car_min)
        for loc in locations
    ], dtype=float)

    crimes  = np.array([
        live_crime_rates.get(loc.name, loc.crime_incidents_per_1k)
        if live_crime_rates else loc.crime_incidents_per_1k
        for loc in locations
    ], dtype=float)
    rents = _vector_with_coverage_guard(
        live_map=live_rents,
        key_getter=lambda loc: loc.borough,
        static_getter=lambda loc: loc.avg_rent_pcm,
    )
    ents = _vector_with_coverage_guard(
        live_map=live_amenity_counts,
        key_getter=lambda loc: loc.name,
        static_getter=lambda loc: loc.entertainment_index,
    )

    def _stats(arr: np.ndarray) -> tuple[float, float]:
        mu    = float(np.mean(arr))
        sigma = float(np.std(arr))
        return mu, (sigma if sigma > 0 else 1.0)

    mu_c, sig_c = _stats(commutes)
    mu_cr, sig_cr = _stats(crimes)
    mu_r, sig_r  = _stats(rents)
    mu_e, sig_e  = _stats(ents)

    crime_p90 = float(np.percentile(crimes, 90))

    weights_dual = _build_weights(weights)

    # ── Steps B + C + D per location ──────────────────────────────────────────
    scored: list[ScoredLocation] = []

    for i, loc in enumerate(locations):
        commute_time = int(commutes[i])
        is_real_time = loc.name in commute_times

        # Step B: directionality (lower crime/rent/commute = better → negate Z)
        z_safety        = -float((crimes[i]   - mu_cr) / sig_cr)
        z_cost          = -float((rents[i]    - mu_r)  / sig_r)
        z_entertainment =  float((ents[i]     - mu_e)  / sig_e)
        z_convenience   = -float((commutes[i] - mu_c)  / sig_c)

        # Step C: exponential penalties
        p_commute = (
            math.exp(-0.1 * (commute_time - 90))
            if commute_time > 90 else 1.0
        )
        zs = {
            "safety": z_safety,
            "convenience": z_convenience,
            "cost": z_cost,
            "entertainment": z_entertainment,
        }
        contribution = 0.0
        for category, z_value in zs.items():
            if z_value >= 0:
                contribution += weights_dual["reward"][category] * z_value
            else:
                contribution += weights_dual["punishment"][category] * z_value

        # Step E: apply penalties
        rank_score = contribution * p_commute

        scored.append(ScoredLocation(
            location=loc,
            rank_score=rank_score,
            commute_time=commute_time,
            is_real_time=is_real_time,
            crime_penalty=crimes[i] >= crime_p90,
            crime_rate=float(crimes[i]),
            z_safety=z_safety,
            z_convenience=z_convenience,
            z_cost=z_cost,
            z_entertainment=z_entertainment,
        ))

    # Sort descending
    scored.sort(key=lambda s: s.rank_score, reverse=True)

    # Normalise display scores to 55–95 range
    raw_scores = [s.rank_score for s in scored]
    raw_min = raw_scores[-1]
    raw_max = raw_scores[0]
    raw_range = raw_max - raw_min or 1.0

    results = []
    for s in scored:
        display_score = round(((s.rank_score - raw_min) / raw_range) * 40 + 55)
        results.append({
            "id":           str(s.location.id),
            "name":         s.location.name,
            "borough":      s.location.borough,
            "displayScore": display_score,
            "commuteTime":  s.commute_time,
            "avgRent":      s.location.avg_rent_pcm,
            "crimePenalty": s.crime_penalty,
            "isRealTime":   s.is_real_time,
            "metricBars": {
                "safety":        _z_to_display(s.z_safety),
                "convenience":   _z_to_display(s.z_convenience),
                "cost":          _z_to_display(s.z_cost),
                "entertainment": _z_to_display(s.z_entertainment),
            },
            "description": s.location.description or "",
            "highlights":  s.location.highlights_list(),
            "imageUrl":    s.location.image_url,
            "lat":         s.location.lat,
            "lng":         s.location.lng,
            "crimeRate":   round(s.crime_rate, 1),
        })

    return results[:5]

import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import rent_timeseries


@pytest.fixture(autouse=True)
def reset_rent_timeseries_caches(monkeypatch):
    monkeypatch.setattr(rent_timeseries, "_cache", {})
    monkeypatch.setattr(rent_timeseries, "_cache_at", {})
    rent_timeseries._load_seed.cache_clear()


def test_returns_combined_seed_and_live_series(monkeypatch):
    current_year = datetime.now(timezone.utc).year
    seed_years = [current_year - 4, current_year - 3, current_year - 2, current_year - 1]

    monkeypatch.setattr(
        rent_timeseries,
        "_load_seed",
        lambda: {"Hackney": {seed_years[0]: 1400, seed_years[1]: 1450, seed_years[2]: 1500, seed_years[3]: 1560}},
    )

    calls = {"count": 0}

    async def fake_live():
        calls["count"] += 1
        return {"Hackney": 1700}

    monkeypatch.setattr(rent_timeseries, "fetch_borough_rents", fake_live)

    series = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Hackney", years=5))

    assert series is not None
    assert len(series) == 5
    assert [row["year"] for row in series] == seed_years + [current_year]
    assert series[-1]["median_gbp"] == 1700
    assert series[1]["yoy_pct"] == pytest.approx(3.57, abs=0.01)
    assert series[-1]["release_period"].endswith("(PRMS, live)")
    assert all(row["release_period"].endswith("(PRMS, observed)") for row in series[:-1])
    assert calls["count"] == 1


def test_seed_only_works_when_live_unreachable(monkeypatch):
    monkeypatch.setattr(
        rent_timeseries,
        "_load_seed",
        lambda: {"Hackney": {2020: 1400, 2021: 1450, 2022: 1500, 2023: 1560}},
    )

    async def fake_live():
        return None

    monkeypatch.setattr(rent_timeseries, "fetch_borough_rents", fake_live)

    series = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Hackney", years=5))

    assert series is not None
    assert len(series) == 4
    assert [row["year"] for row in series] == [2020, 2021, 2022, 2023]
    assert all("observed" in row["release_period"] for row in series)


def test_returns_none_when_only_one_year_available(monkeypatch):
    monkeypatch.setattr(rent_timeseries, "_load_seed", lambda: {"Hackney": {2024: 1700}})

    async def fake_live():
        return None

    monkeypatch.setattr(rent_timeseries, "fetch_borough_rents", fake_live)

    series = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Hackney", years=5))

    assert series is None


def test_unknown_borough_short_circuits(monkeypatch):
    tracker = {"called": False}

    def tracked_seed():
        tracker["called"] = True
        return {}

    monkeypatch.setattr(rent_timeseries, "_load_seed", tracked_seed)

    series = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Manchester", years=5))

    assert series is None
    assert tracker["called"] is False


def test_uses_cache_on_second_call(monkeypatch):
    current_year = datetime.now(timezone.utc).year
    monkeypatch.setattr(
        rent_timeseries,
        "_load_seed",
        lambda: {"Hackney": {current_year - 2: 1500, current_year - 1: 1560}},
    )

    calls = {"count": 0}

    async def fake_live():
        calls["count"] += 1
        return {"Hackney": 1700}

    monkeypatch.setattr(rent_timeseries, "fetch_borough_rents", fake_live)

    first = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Hackney", years=5))
    second = asyncio.run(rent_timeseries.fetch_borough_rent_yearly("Hackney", years=5))

    assert first == second
    assert calls["count"] == 1

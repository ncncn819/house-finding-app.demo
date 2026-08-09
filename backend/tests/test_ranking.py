import uuid

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("pydantic")
pytest.importorskip("numpy")
pytest.importorskip("asyncpg")

from app.models.location import Location, Weights
from app.services.ranking import rank_locations


def _location(
    name: str,
    borough: str,
    lat: float,
    lng: float,
    avg_rent_pcm: int,
    crime_incidents_per_1k: float,
    entertainment_index: float,
    commute_transit_min: int,
    commute_car_min: int,
) -> Location:
    return Location(
        id=uuid.uuid4(),
        name=name,
        borough=borough,
        lat=lat,
        lng=lng,
        avg_rent_pcm=avg_rent_pcm,
        crime_incidents_per_1k=crime_incidents_per_1k,
        entertainment_index=entertainment_index,
        transport_zone=2,
        commute_transit_min=commute_transit_min,
        commute_car_min=commute_car_min,
        description=f"{name} description",
        highlights='["Parks", "Transport"]',
        image_url=f"https://img.example/{name.lower()}.jpg",
    )


def test_rank_locations_returns_sorted_results_with_realtime_flags():
    locations = [
        _location("Camden", "Camden", 51.54, -0.15, 2300, 75.0, 90.0, 35, 40),
        _location("Hackney", "Hackney", 51.55, -0.06, 1900, 60.0, 78.0, 45, 38),
        _location("Greenwich", "Greenwich", 51.48, 0.00, 1700, 50.0, 70.0, 55, 42),
    ]
    commute_times = {"Hackney": 28}
    weights = Weights(safety=40, convenience=35, cost=20, entertainment=5)

    ranked = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times=commute_times,
        weights=weights,
    )

    assert len(ranked) == 3
    assert [row["displayScore"] for row in ranked] == sorted(
        [row["displayScore"] for row in ranked], reverse=True
    )
    assert {row["name"] for row in ranked} == {"Camden", "Hackney", "Greenwich"}

    realtime_map = {row["name"]: row["isRealTime"] for row in ranked}
    assert realtime_map["Hackney"] is True
    assert realtime_map["Camden"] is False
    assert realtime_map["Greenwich"] is False

    for row in ranked:
        assert 55 <= row["displayScore"] <= 95
        assert set(row["metricBars"].keys()) == {"safety", "convenience", "cost", "entertainment"}


def test_rank_locations_limits_results_to_top_five():
    locations = [
        _location(f"Loc{i}", "Borough", 51.0 + i * 0.01, -0.1, 1500 + i * 40, 40 + i * 4, 50 + i, 20 + i * 3, 25 + i)
        for i in range(6)
    ]
    weights = Weights(safety=25, convenience=25, cost=25, entertainment=25)

    ranked = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=weights,
    )

    assert len(ranked) == 5


def test_rank_locations_honors_live_rents_and_amenities():
    locations = [
        _location("Alpha", "Hackney", 51.54, -0.08, 2200, 60.0, 4.0, 30, 30),
        _location("Beta", "Southwark", 51.50, -0.07, 1800, 60.0, 6.0, 30, 30),
        _location("Gamma", "Newham", 51.53, -0.01, 1600, 60.0, 5.0, 30, 30),
    ]
    weights = Weights(safety=5, convenience=5, cost=45, entertainment=45)

    baseline = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=weights,
    )

    # Make Hackney dramatically cheaper and richer in amenities than others.
    with_live = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=weights,
        live_rents={"Hackney": 1300, "Southwark": 2100, "Newham": 2400},
        live_amenity_counts={"Alpha": 120, "Beta": 40, "Gamma": 10},
    )

    assert baseline[0]["name"] != with_live[0]["name"]
    assert with_live[0]["name"] == "Alpha"

    regression = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=weights,
        live_rents=None,
        live_amenity_counts=None,
    )
    assert baseline == regression


def test_amplified_weights_widen_score_gap():
    locations = [
        _location("SafeButFar", "Hackney", 51.54, -0.08, 2000, 90.0, 6.0, 70, 70),
        _location("UnsafeButNear", "Southwark", 51.50, -0.07, 2000, 100.0, 6.0, 20, 20),
        _location("Anchor1", "Newham", 51.53, -0.01, 1900, 96.0, 6.0, 30, 30),
        _location("Anchor2", "Camden", 51.52, -0.10, 2100, 94.0, 6.0, 60, 60),
    ]

    high_priority = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=Weights(safety=100, convenience=0, cost=0, entertainment=0),
    )
    balanced = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=Weights(safety=50, convenience=50, cost=0, entertainment=0),
    )

    high_map = {row["name"]: row["displayScore"] for row in high_priority}
    bal_map = {row["name"]: row["displayScore"] for row in balanced}

    high_gap = high_map["SafeButFar"] - high_map["UnsafeButNear"]
    balanced_gap = bal_map["SafeButFar"] - bal_map["UnsafeButNear"]

    assert high_gap > balanced_gap


def test_floor_punishment_applies_when_slider_zero():
    locations = [
        _location("SafeArea", "Hackney", 51.54, -0.08, 2000, 40.0, 7.0, 30, 30),
        _location("UnsafeArea", "Hackney", 51.54, -0.08, 2000, 140.0, 7.0, 30, 30),
    ]

    ranked = rank_locations(
        locations=locations,
        commute_mode="transit",
        commute_times={},
        weights=Weights(safety=0, convenience=100, cost=100, entertainment=100),
    )

    names = [row["name"] for row in ranked]
    assert names.index("SafeArea") < names.index("UnsafeArea")

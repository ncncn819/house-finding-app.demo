from pathlib import Path
import sys

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import census_density

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "oa_density_mini.geojson"


@pytest.fixture(autouse=True)
def patch_data_path(monkeypatch):
    monkeypatch.setattr(census_density, "DATA_PATH", FIXTURE_PATH)
    census_density._load_oa_index.cache_clear()


def test_returns_oas_within_buffer():
    data = census_density.get_oa_density(51.515, -0.13, radius_m=400)

    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 3


def test_returns_empty_far_outside_london():
    data = census_density.get_oa_density(52.48, -1.90, radius_m=400)

    assert data["features"] == []


def test_features_carry_density_property():
    data = census_density.get_oa_density(51.515, -0.13, radius_m=400)

    assert len(data["features"]) > 0
    for feature in data["features"]:
        props = feature["properties"]
        assert "density_per_km2" in props
        assert "oa_code" in props

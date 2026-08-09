import asyncio
from pathlib import Path
import sys

import pytest

pytest.importorskip("httpx")

import httpx

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import crime


@pytest.fixture(autouse=True)
def _reset_cache(monkeypatch):
    monkeypatch.setattr(crime, "_cache", {})
    monkeypatch.setattr(crime, "_yearly_cache", {})
    monkeypatch.setattr(crime, "_yearly_cache_at", {})
    monkeypatch.setattr(crime, "_recent_months", lambda n=2: ["2026-01"])


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else []

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses=None, error: Exception | None = None):
        self.responses = list(responses or [])
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, *_args, **_kwargs):
        if self.error is not None:
            raise self.error
        if not self.responses:
            return _FakeResponse(status_code=200, payload=[])
        return self.responses.pop(0)


def _records(category: str, n: int) -> list[dict]:
    return [{"category": category} for _ in range(n)]


def test_severity_weighting_violent_dominates_shoplifting(monkeypatch):
    violent = _FakeClient(responses=[_FakeResponse(payload=_records("violent-crime", 10))])
    monkeypatch.setattr(crime.httpx, "AsyncClient", lambda *args, **kwargs: violent)
    violent_rate = asyncio.run(crime.fetch_crime_rate(51.50, -0.10))

    shoplifting = _FakeClient(responses=[_FakeResponse(payload=_records("shoplifting", 10))])
    monkeypatch.setattr(crime.httpx, "AsyncClient", lambda *args, **kwargs: shoplifting)
    shoplifting_rate = asyncio.run(crime.fetch_crime_rate(51.51, -0.11))

    assert violent_rate is not None
    assert shoplifting_rate is not None
    assert violent_rate / shoplifting_rate >= 8.0


def test_unknown_category_uses_default_severity(monkeypatch):
    fake = _FakeClient(responses=[_FakeResponse(payload=_records("unknown-category", 10))])
    monkeypatch.setattr(crime.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    rate = asyncio.run(crime.fetch_crime_rate(51.52, -0.12))

    # 10 records * default severity(1.0) => monthly weighted=10
    # annual=120; per_1k = 120/100000*1000 = 1.2
    assert rate == pytest.approx(1.2, abs=0.1)


def test_yearly_aggregates_to_5_points(monkeypatch):
    months = []
    for year in [2021, 2022, 2023, 2024, 2025, 2026]:
        for month in range(1, 13):
            if year == 2021 and month < 11:
                continue
            if year == 2026 and month > 10:
                continue
            months.append(f"{year}-{month:02d}")

    async def fake_fetch_month(_client, _lat, _lng, _month):
        return 10.0, 5

    monkeypatch.setattr(crime, "_recent_months", lambda n=2: months[:n])
    monkeypatch.setattr(crime, "_fetch_month", fake_fetch_month)
    monkeypatch.setattr(crime.httpx, "AsyncClient", lambda *args, **kwargs: _FakeClient([]))

    series = asyncio.run(crime.fetch_crime_yearly(51.5, -0.1, years=5))

    assert series is not None
    assert len(series) == 5
    assert [row["year"] for row in series] == [2022, 2023, 2024, 2025, 2026]
    assert series[-1]["months_counted"] == 10
    assert all(row["weighted_per_1k"] == pytest.approx(1.2, abs=0.01) for row in series)


def test_yearly_annualises_partial_year(monkeypatch):
    async def fake_fetch_month(_client, _lat, _lng, _month):
        return 20.0, 7

    monkeypatch.setattr(crime, "_recent_months", lambda n=2: ["2026-01", "2026-02", "2026-03"][:n])
    monkeypatch.setattr(crime, "_fetch_month", fake_fetch_month)
    monkeypatch.setattr(crime.httpx, "AsyncClient", lambda *args, **kwargs: _FakeClient([]))

    series = asyncio.run(crime.fetch_crime_yearly(51.5, -0.1, years=1))

    assert series is not None
    assert len(series) == 1
    assert series[0]["months_counted"] == 3
    # total_weighted=60, annualised=240 -> 2.4 per 1k
    assert series[0]["weighted_per_1k"] == pytest.approx(2.4, abs=0.01)

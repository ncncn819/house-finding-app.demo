import asyncio
from pathlib import Path
import sys

import pytest

pytest.importorskip("httpx")

import httpx

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import amenities


@pytest.fixture(autouse=True)
def _reset_amenities_cache(monkeypatch):
    monkeypatch.setattr(amenities, "_cache", {})


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("GET", "https://x"), response=httpx.Response(self.status_code))

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, response=None, error: Exception | None = None):
        self.response = response
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, *_args, **_kwargs):
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


def test_fetch_amenity_count_parses_overpass_response(monkeypatch):
    payload = {
        "elements": [
            {
                "type": "count",
                "tags": {"nodes": "42", "ways": "0", "relations": "0", "total": "42"},
            }
        ]
    }
    fake = _FakeClient(response=_FakeResponse(status_code=200, payload=payload))
    monkeypatch.setattr(amenities.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    result = asyncio.run(amenities.fetch_amenity_count(51.5, -0.1))

    assert result == 42


def test_fetch_amenity_count_returns_none_on_timeout(monkeypatch):
    fake = _FakeClient(error=httpx.TimeoutException("timeout"))
    monkeypatch.setattr(amenities.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    result = asyncio.run(amenities.fetch_amenity_count(51.5, -0.1))

    assert result is None


def test_batch_amenity_counts_respects_semaphore(monkeypatch):
    in_flight = 0
    peak = 0

    async def _fake_fetch(lat, lng, radius_m=1000):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return int(abs(lat * 10) + abs(lng * 10) + radius_m // 1000)

    monkeypatch.setattr(amenities, "fetch_amenity_count", _fake_fetch)

    locations = [(51.50 + i * 0.001, -0.10 - i * 0.001, f"Loc{i}") for i in range(10)]
    result = asyncio.run(amenities.batch_amenity_counts(locations, max_concurrent=3))

    assert len(result) == 10
    assert peak <= 3

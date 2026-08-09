import asyncio
from pathlib import Path
import sys

import pytest

pytest.importorskip("httpx")

import httpx

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import buildings


@pytest.fixture(autouse=True)
def _reset_cache(monkeypatch):
    monkeypatch.setattr(buildings, "_cache", {})


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error",
                request=httpx.Request("GET", "https://x"),
                response=httpx.Response(self.status_code),
            )

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses=None, error: Exception | None = None):
        self.responses = list(responses or [])
        self.error = error
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, *_args, **_kwargs):
        self.calls += 1
        if self.error is not None:
            raise self.error
        if self.responses:
            return self.responses.pop(0)
        return _FakeResponse(status_code=200, payload={"elements": []})


def test_parses_node_and_way_centroids(monkeypatch):
    payload = {
        "elements": [
            {"type": "node", "lat": 51.5001, "lon": -0.1001},
            {"type": "node", "lat": 51.5002, "lon": -0.1002},
            {"type": "way", "center": {"lat": 51.5003, "lon": -0.1003}},
            {"type": "way", "center": {"lat": 51.5004, "lon": -0.1004}},
        ]
    }
    fake = _FakeClient(responses=[_FakeResponse(status_code=200, payload=payload)])
    monkeypatch.setattr(buildings.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    points = asyncio.run(buildings.fetch_residential_buildings(51.5, -0.1))

    assert points == [
        [51.5001, -0.1001, 1.0],
        [51.5002, -0.1002, 1.0],
        [51.5003, -0.1003, 1.0],
        [51.5004, -0.1004, 1.0],
    ]


def test_returns_none_on_timeout(monkeypatch):
    fake = _FakeClient(error=httpx.TimeoutException("timeout"))
    monkeypatch.setattr(buildings.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    points = asyncio.run(buildings.fetch_residential_buildings(51.5, -0.1))

    assert points is None


def test_caches_repeated_calls(monkeypatch):
    payload = {"elements": [{"type": "node", "lat": 51.5001, "lon": -0.1001}]}
    fake = _FakeClient(responses=[_FakeResponse(status_code=200, payload=payload)])
    monkeypatch.setattr(buildings.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    first = asyncio.run(buildings.fetch_residential_buildings(51.5, -0.1, radius_m=400))
    second = asyncio.run(buildings.fetch_residential_buildings(51.5, -0.1, radius_m=400))

    assert first == second
    assert fake.calls == 1


def test_levels_tag_emits_weighted_triple():
    payload = {
        "elements": [
            {"type": "way", "center": {"lat": 51.501, "lon": -0.101}, "tags": {"building:levels": "8"}},
            {"type": "way", "center": {"lat": 51.502, "lon": -0.102}},
        ]
    }

    points = buildings._extract_points(payload)

    assert points == [
        [51.501, -0.101, 8.0],
        [51.502, -0.102, 1.0],
    ]


def test_invalid_levels_clamps():
    payload = {
        "elements": [
            {"type": "way", "center": {"lat": 51.501, "lon": -0.101}, "tags": {"building:levels": "foo"}},
            {"type": "way", "center": {"lat": 51.502, "lon": -0.102}, "tags": {"building:levels": "999"}},
            {"type": "way", "center": {"lat": 51.503, "lon": -0.103}, "tags": {"building:levels": "0"}},
        ]
    }

    points = buildings._extract_points(payload)

    assert points == [
        [51.501, -0.101, 1.0],
        [51.502, -0.102, 30.0],
        [51.503, -0.103, 1.0],
    ]

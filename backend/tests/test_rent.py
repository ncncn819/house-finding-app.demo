import asyncio
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import sys

import pytest

pytest.importorskip("httpx")
pytest.importorskip("openpyxl")

import httpx
from openpyxl import Workbook

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services import rent


@pytest.fixture(autouse=True)
def _reset_rent_cache(monkeypatch):
    monkeypatch.setattr(rent, "_cache", None)
    monkeypatch.setattr(rent, "_cache_at", None)


def _make_workbook_bytes() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Table2.7"
    ws.append([None] * 11)  # row 1
    for _ in range(6):
        ws.append([None] * 11)  # rows 2..7

    # row shape expected by parser: idx3 area, idx7 median
    ws.append([None, "NA", "E09000000", "Hackney", 100, 0, 0, 1712])
    ws.append([None, "NA", "E09000000", "Southwark", 100, 0, 0, 1700])
    ws.append([None, "NA", "E92000001", "ENGLAND", 100, 0, 0, 800])

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


class _FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "", content: bytes = b""):
        self.status_code = status_code
        self.text = text
        self.content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("GET", "https://x"), response=httpx.Response(self.status_code))


class _FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, *_args, **_kwargs):
        self.calls += 1
        if not self._responses:
            raise AssertionError("No fake response queued")
        return self._responses.pop(0)


def test_fetch_borough_rents_parses_ons_workbook(monkeypatch):
    html = (
        '<a href="/file?uri=/peoplepopulationandcommunity/housing/datasets/'
        'privaterentalmarketsummarystatisticsinengland/october2021toseptember2022/'
        'privaterentalmarketstatistics221214.xlsx">xlsx</a>'
    )
    fake = _FakeClient([
        _FakeResponse(status_code=200, text=html),
        _FakeResponse(status_code=200, content=_make_workbook_bytes()),
    ])
    monkeypatch.setattr(rent.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    result = asyncio.run(rent.fetch_borough_rents())

    assert result is not None
    assert result["Hackney"] == 1712
    assert result["Southwark"] == 1700


def test_fetch_borough_rents_returns_none_on_http_error(monkeypatch):
    fake = _FakeClient([_FakeResponse(status_code=500, text="boom")])
    monkeypatch.setattr(rent.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    result = asyncio.run(rent.fetch_borough_rents())

    assert result is None


def test_fetch_borough_rents_uses_cache(monkeypatch):
    html = (
        '<a href="/file?uri=/peoplepopulationandcommunity/housing/datasets/'
        'privaterentalmarketsummarystatisticsinengland/october2021toseptember2022/'
        'privaterentalmarketstatistics221214.xlsx">xlsx</a>'
    )
    fake = _FakeClient([
        _FakeResponse(status_code=200, text=html),
        _FakeResponse(status_code=200, content=_make_workbook_bytes()),
    ])
    monkeypatch.setattr(rent.httpx, "AsyncClient", lambda *args, **kwargs: fake)

    first = asyncio.run(rent.fetch_borough_rents())
    calls_after_first = fake.calls
    second = asyncio.run(rent.fetch_borough_rents())

    assert first == second
    assert calls_after_first == 2
    assert fake.calls == 2
    assert rent._cache_at is not None
    assert isinstance(rent._cache_at, datetime)
    assert rent._cache_at.tzinfo == timezone.utc

from datetime import datetime, timezone

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")
pytest.importorskip("pydantic")
pytest.importorskip("asyncpg")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import dashboard_routes
from app.models.dashboard import DashboardOpinion, DashboardSession


class _FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeAsyncSession:
    def __init__(self):
        self.sessions = {}
        self._opinion_count = 0

    async def get(self, model, key):
        if model is DashboardSession:
            return self.sessions.get(key)
        return None

    def add(self, obj):
        if isinstance(obj, DashboardSession):
            obj.pins = []
            obj.memos = []
            obj.opinions = []
            self.sessions[obj.code] = obj
            return

        if isinstance(obj, DashboardOpinion):
            self._opinion_count += 1
            if not obj.id:
                obj.id = f"op-{self._opinion_count}"
            if not obj.created_at:
                obj.created_at = datetime.now(timezone.utc)
            session = self.sessions.get(obj.session_code)
            if session:
                session.opinions.append(obj)

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None

    async def execute(self, query):
        code = None
        criteria = getattr(query, "_where_criteria", ())
        if criteria:
            code = getattr(getattr(criteria[0], "right", None), "value", None)
        if code is None:
            session = next(iter(self.sessions.values()), None)
        else:
            session = self.sessions.get(code)
        return _FakeScalarResult(session)


def _build_client(fake_db: _FakeAsyncSession) -> TestClient:
    app = FastAPI()
    app.include_router(dashboard_routes.router, prefix="/api/v1")

    async def _override_get_db():
        yield fake_db

    app.dependency_overrides[dashboard_routes.get_db] = _override_get_db
    return TestClient(app)


def test_post_opinion_persists():
    db = _FakeAsyncSession()
    client = _build_client(db)

    create = client.post("/api/v1/sessions")
    assert create.status_code == 201
    code = create.json()["code"]

    post = client.post(
        f"/api/v1/sessions/{code}/opinions",
        json={"author_name": "Becky", "author_color": "#E76F51", "content": "This app flow is clean."},
    )
    assert post.status_code == 201
    assert post.json()["author_name"] == "Becky"
    assert post.json()["content"] == "This app flow is clean."

    fetched = client.get(f"/api/v1/sessions/{code}")
    assert fetched.status_code == 200
    payload = fetched.json()
    assert len(payload["opinions"]) == 1
    assert payload["opinions"][0]["author_name"] == "Becky"
    assert payload["opinions"][0]["content"] == "This app flow is clean."


def test_opinions_ordered_oldest_first():
    db = _FakeAsyncSession()
    client = _build_client(db)

    code = client.post("/api/v1/sessions").json()["code"]

    r1 = client.post(
        f"/api/v1/sessions/{code}/opinions",
        json={"author_name": "A", "author_color": "#1A3528", "content": "First opinion"},
    )
    r2 = client.post(
        f"/api/v1/sessions/{code}/opinions",
        json={"author_name": "B", "author_color": "#CF142B", "content": "Second opinion"},
    )
    assert r1.status_code == 201
    assert r2.status_code == 201

    fetched = client.get(f"/api/v1/sessions/{code}")
    assert fetched.status_code == 200
    contents = [o["content"] for o in fetched.json()["opinions"]]
    assert contents == ["First opinion", "Second opinion"]


def test_opinion_on_missing_session_404s():
    db = _FakeAsyncSession()
    client = _build_client(db)

    response = client.post(
        "/api/v1/sessions/ZZZZZZ/opinions",
        json={"author_name": "Becky", "author_color": "#E76F51", "content": "Hello"},
    )
    assert response.status_code == 404

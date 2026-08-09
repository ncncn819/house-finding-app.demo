import pytest

fastapi = pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")
pytest.importorskip("pydantic")
pytest.importorskip("asyncpg")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import router


def test_health_endpoint_returns_ok():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    client = TestClient(app)

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

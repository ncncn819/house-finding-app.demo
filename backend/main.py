"""
main.py — FastAPI application entry point.

Run locally:
    uvicorn main:app --reload --port 8000

Swagger docs:
    http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.dashboard_routes import router as dashboard_router
from app.config import get_settings
from app.database import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise DB tables and seed data on startup."""
    await init_db()
    yield


app = FastAPI(
    title="HouseApp API",
    description="Statistical neighbourhood ranking API for the UK House-Finding App.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "HouseApp API is running",
        "docs": "/docs",
        "health": "/api/v1/health",
    }

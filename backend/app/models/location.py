"""
SQLAlchemy ORM model + Pydantic request/response schemas.
"""
import json
import uuid
from typing import Optional

from pydantic import BaseModel, field_validator
from sqlalchemy import Column, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


# ─── ORM model ────────────────────────────────────────────────────────────────

class Location(Base):
    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False, unique=True, index=True)
    borough = Column(String(120), nullable=False)

    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    avg_rent_pcm = Column(Integer, nullable=False)
    crime_incidents_per_1k = Column(Float, nullable=False)
    entertainment_index = Column(Float, nullable=False)

    transport_zone = Column(Integer, nullable=True)

    commute_transit_min = Column(Integer, nullable=False)
    commute_car_min = Column(Integer, nullable=False)

    description = Column(Text, nullable=True)
    highlights = Column(Text, nullable=True)   # JSON array stored as text
    image_url = Column(Text, nullable=True)    # Neighbourhood hero image URL

    def highlights_list(self) -> list[str]:
        try:
            return json.loads(self.highlights or "[]")
        except json.JSONDecodeError:
            return []


# ─── Request schemas ───────────────────────────────────────────────────────────

class Weights(BaseModel):
    safety: float = 50
    convenience: float = 50
    cost: float = 50
    entertainment: float = 50


class SearchRequest(BaseModel):
    workPostcode: str
    commuteMode: str = "transit"
    weights: Weights

    @field_validator("commuteMode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in {"transit", "car"}:
            raise ValueError("commuteMode must be 'transit' or 'car'")
        return v


# ─── Response schemas ──────────────────────────────────────────────────────────

class MetricBars(BaseModel):
    safety: int
    convenience: int
    cost: int
    entertainment: int


class RankedLocation(BaseModel):
    id: str
    name: str
    borough: str
    displayScore: int
    commuteTime: int
    avgRent: int
    crimePenalty: bool
    isRealTime: bool
    metricBars: MetricBars
    description: str
    highlights: list[str]
    imageUrl: Optional[str] = None
    lat: float = 0.0
    lng: float = 0.0
    crimeRate: float = 0.0


class SearchResponse(BaseModel):
    results: list[RankedLocation]
    isRealTime: bool
    isLiveCrime: bool = False
    isLiveRents: bool = False
    isLiveAmenities: bool = False
    postcode: str


class PropertyListing(BaseModel):
    title: str
    price_pcm: Optional[int] = None
    bedrooms: Optional[int] = None
    url: str
    image_url: Optional[str] = None
    source: str


class PropertiesResponse(BaseModel):
    location: str
    listings: list[PropertyListing]

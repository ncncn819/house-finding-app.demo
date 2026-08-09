import random
import string
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


class DashboardSession(Base):
    __tablename__ = "dashboard_sessions"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pins: Mapped[list["DashboardPin"]] = relationship("DashboardPin", back_populates="session", cascade="all, delete-orphan")
    memos: Mapped[list["DashboardMemo"]] = relationship("DashboardMemo", back_populates="session", cascade="all, delete-orphan")
    opinions: Mapped[list["DashboardOpinion"]] = relationship(
        "DashboardOpinion",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="DashboardOpinion.created_at",
    )


class DashboardPin(Base):
    __tablename__ = "dashboard_pins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_code: Mapped[str] = mapped_column(String(6), ForeignKey("dashboard_sessions.code", ondelete="CASCADE"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(50), nullable=False)
    author_color: Mapped[str] = mapped_column(String(7), nullable=False)  # hex e.g. "#E76F51"
    location_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    pos_x: Mapped[float] = mapped_column(Float, default=80.0)
    pos_y: Mapped[float] = mapped_column(Float, default=80.0)
    pinned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped["DashboardSession"] = relationship("DashboardSession", back_populates="pins")
    comments: Mapped[list["DashboardComment"]] = relationship("DashboardComment", back_populates="pin", cascade="all, delete-orphan")


class DashboardMemo(Base):
    __tablename__ = "dashboard_memos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_code: Mapped[str] = mapped_column(String(6), ForeignKey("dashboard_sessions.code", ondelete="CASCADE"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(50), nullable=False)
    author_color: Mapped[str] = mapped_column(String(7), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    pos_x: Mapped[float] = mapped_column(Float, default=300.0)
    pos_y: Mapped[float] = mapped_column(Float, default=120.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    session: Mapped["DashboardSession"] = relationship("DashboardSession", back_populates="memos")


class DashboardComment(Base):
    __tablename__ = "dashboard_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    pin_id: Mapped[str] = mapped_column(String(36), ForeignKey("dashboard_pins.id", ondelete="CASCADE"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(50), nullable=False)
    author_color: Mapped[str] = mapped_column(String(7), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pin: Mapped["DashboardPin"] = relationship("DashboardPin", back_populates="comments")


class DashboardOpinion(Base):
    __tablename__ = "dashboard_opinions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_code: Mapped[str] = mapped_column(String(6), ForeignKey("dashboard_sessions.code", ondelete="CASCADE"), nullable=False, index=True)
    author_name: Mapped[str] = mapped_column(String(50), nullable=False)
    author_color: Mapped[str] = mapped_column(String(7), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped["DashboardSession"] = relationship("DashboardSession", back_populates="opinions")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel


class SessionCreate(BaseModel):
    pass


class SessionOut(BaseModel):
    code: str


class PinCreate(BaseModel):
    author_name: str
    author_color: str
    location_data: str  # JSON string
    pos_x: float = 80.0
    pos_y: float = 80.0


class PinPositionUpdate(BaseModel):
    pos_x: float
    pos_y: float


class PinOut(BaseModel):
    id: str
    session_code: str
    author_name: str
    author_color: str
    location_data: str
    pos_x: float
    pos_y: float
    pinned_at: datetime
    comments: list["CommentOut"] = []

    class Config:
        from_attributes = True


class MemoCreate(BaseModel):
    author_name: str
    author_color: str
    content: str = ""
    pos_x: float = 300.0
    pos_y: float = 120.0


class MemoUpdate(BaseModel):
    content: str | None = None
    pos_x: float | None = None
    pos_y: float | None = None


class MemoOut(BaseModel):
    id: str
    session_code: str
    author_name: str
    author_color: str
    content: str
    pos_x: float
    pos_y: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    author_name: str
    author_color: str
    content: str


class CommentOut(BaseModel):
    id: str
    pin_id: str
    author_name: str
    author_color: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class OpinionCreate(BaseModel):
    author_name: str
    author_color: str
    content: str


class OpinionOut(BaseModel):
    id: str
    author_name: str
    author_color: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class SessionStateOut(BaseModel):
    code: str
    pins: list[PinOut] = []
    memos: list[MemoOut] = []
    opinions: list[OpinionOut] = []


PinOut.model_rebuild()

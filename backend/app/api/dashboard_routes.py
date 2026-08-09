from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.dashboard import (
    CommentCreate,
    CommentOut,
    DashboardComment,
    DashboardMemo,
    DashboardOpinion,
    DashboardPin,
    DashboardSession,
    MemoCreate,
    MemoOut,
    MemoUpdate,
    OpinionCreate,
    OpinionOut,
    PinCreate,
    PinOut,
    PinPositionUpdate,
    SessionOut,
    SessionStateOut,
    generate_code,
)

router = APIRouter(tags=["dashboard"])


# ── Sessions ─────────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(db: AsyncSession = Depends(get_db)):
    # Retry on the tiny chance of a code collision
    for _ in range(5):
        code = generate_code()
        existing = await db.get(DashboardSession, code)
        if not existing:
            break
    session = DashboardSession(code=code)
    db.add(session)
    await db.commit()
    return SessionOut(code=code)


@router.get("/sessions/{code}", response_model=SessionStateOut)
async def get_session(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DashboardSession)
        .where(DashboardSession.code == code)
        .options(
            selectinload(DashboardSession.pins).selectinload(DashboardPin.comments),
            selectinload(DashboardSession.memos),
            selectinload(DashboardSession.opinions),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ── Pins ──────────────────────────────────────────────────────────────────────

@router.post("/sessions/{code}/pins", response_model=PinOut, status_code=201)
async def add_pin(code: str, body: PinCreate, db: AsyncSession = Depends(get_db)):
    session = await _get_session_or_404(code, db)
    pin = DashboardPin(session_code=session.code, **body.model_dump())
    db.add(pin)
    await db.commit()
    await db.refresh(pin)
    # Load comments (empty on creation)
    result = await db.execute(
        select(DashboardPin).where(DashboardPin.id == pin.id).options(selectinload(DashboardPin.comments))
    )
    return result.scalar_one()


@router.patch("/sessions/{code}/pins/{pin_id}", response_model=PinOut)
async def update_pin_position(code: str, pin_id: str, body: PinPositionUpdate, db: AsyncSession = Depends(get_db)):
    pin = await _get_pin_or_404(pin_id, code, db)
    pin.pos_x = body.pos_x
    pin.pos_y = body.pos_y
    await db.commit()
    result = await db.execute(
        select(DashboardPin).where(DashboardPin.id == pin_id).options(selectinload(DashboardPin.comments))
    )
    return result.scalar_one()


@router.delete("/sessions/{code}/pins/{pin_id}", status_code=204)
async def delete_pin(code: str, pin_id: str, db: AsyncSession = Depends(get_db)):
    pin = await _get_pin_or_404(pin_id, code, db)
    await db.delete(pin)
    await db.commit()


# ── Memos ─────────────────────────────────────────────────────────────────────

@router.post("/sessions/{code}/memos", response_model=MemoOut, status_code=201)
async def add_memo(code: str, body: MemoCreate, db: AsyncSession = Depends(get_db)):
    session = await _get_session_or_404(code, db)
    memo = DashboardMemo(session_code=session.code, **body.model_dump())
    db.add(memo)
    await db.commit()
    await db.refresh(memo)
    return memo


@router.patch("/sessions/{code}/memos/{memo_id}", response_model=MemoOut)
async def update_memo(code: str, memo_id: str, body: MemoUpdate, db: AsyncSession = Depends(get_db)):
    memo = await _get_memo_or_404(memo_id, code, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(memo, field, value)
    memo.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(memo)
    return memo


@router.delete("/sessions/{code}/memos/{memo_id}", status_code=204)
async def delete_memo(code: str, memo_id: str, db: AsyncSession = Depends(get_db)):
    memo = await _get_memo_or_404(memo_id, code, db)
    await db.delete(memo)
    await db.commit()


# ── Comments ──────────────────────────────────────────────────────────────────

@router.post("/sessions/{code}/pins/{pin_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(code: str, pin_id: str, body: CommentCreate, db: AsyncSession = Depends(get_db)):
    pin = await _get_pin_or_404(pin_id, code, db)
    comment = DashboardComment(pin_id=pin.id, **body.model_dump())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


# ── Opinions ──────────────────────────────────────────────────────────────────

@router.post("/sessions/{code}/opinions", response_model=OpinionOut, status_code=201)
async def add_opinion(code: str, body: OpinionCreate, db: AsyncSession = Depends(get_db)):
    session = await _get_session_or_404(code, db)
    opinion = DashboardOpinion(
        session_code=session.code,
        author_name=body.author_name,
        author_color=body.author_color,
        content=body.content,
    )
    db.add(opinion)
    await db.commit()
    await db.refresh(opinion)
    return opinion


@router.post("/{code}/opinions", response_model=OpinionOut, status_code=201, include_in_schema=False)
async def add_opinion_legacy_path(code: str, body: OpinionCreate, db: AsyncSession = Depends(get_db)):
    # Backward-compatible alias for older frontend builds that posted to /{code}/opinions.
    return await add_opinion(code, body, db)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_session_or_404(code: str, db: AsyncSession) -> DashboardSession:
    session = await db.get(DashboardSession, code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


async def _get_pin_or_404(pin_id: str, code: str, db: AsyncSession) -> DashboardPin:
    pin = await db.get(DashboardPin, pin_id)
    if not pin or pin.session_code != code:
        raise HTTPException(status_code=404, detail="Pin not found")
    return pin


async def _get_memo_or_404(memo_id: str, code: str, db: AsyncSession) -> DashboardMemo:
    memo = await db.get(DashboardMemo, memo_id)
    if not memo or memo.session_code != code:
        raise HTTPException(status_code=404, detail="Memo not found")
    return memo

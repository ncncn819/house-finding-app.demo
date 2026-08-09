from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create tables and seed initial data on startup."""
    import app.models.dashboard  # noqa: F401 — registers dashboard tables with Base.metadata
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        # With --workers 2, both workers race on CREATE TABLE; the loser hits
        # a duplicate-type error even though IF NOT EXISTS is used. Ignore if
        # the tables already exist by the time this worker retries.
        if "already exists" not in str(e):
            raise

    from app.data.seed import seed_locations
    await seed_locations()


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/houseapp"

    # TfL Journey Planner — key is optional; unauthenticated calls are rate-limited but work for demos
    TFL_APP_KEY: str = ""

    # Playwright timeout in ms
    PLAYWRIGHT_TIMEOUT: int = 15000

    # Comma-separated list of allowed CORS origins
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Pydantic Settings for the KTS Master Control backend.

Loads from .env (or environment). All values have safe defaults for local
development; production must override via real .env values.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://kts:kts_dev_password_change_me@localhost:5432/kts_dev"
    )
    DATABASE_URL_TEST: str = (
        "postgresql+asyncpg://kts_test:kts_test_password_change_me@localhost:5433/kts_test"
    )

    # Auth
    API_TOKEN: str = "changeme_dev_token"
    SECRET_KEY: str = "changeme_dev_secret_key"

    # Backend
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8799

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

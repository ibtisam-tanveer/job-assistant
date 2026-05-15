from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017/jobassistant"
    # Default matches extensions/linkedin popup.js LOCAL_DEV_INGEST and .env.example.
    # Override with a long random value in production (set INGEST_SECRET in the environment).
    ingest_secret: str = "jobassistant-local-dev-ingest"
    # When set, all /jobs routes (except extension ingest) require Authorization: Bearer <WEB_API_SECRET>
    web_api_secret: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    # Comma-separated extra CORS origins (localhost is always allowed)
    cors_extra_origins: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    google_success_redirect: str = "http://localhost:3000/?google=connected"


@lru_cache
def get_settings() -> Settings:
    return Settings()

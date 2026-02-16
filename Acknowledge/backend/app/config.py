import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

# Single .env lives in backend directory
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost/acknowledge_db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALLOWED_ORIGINS: str = os.getenv(
        "ALLOWED_ORIGINS",
        "https://postflow.panscience.ai,http://postflow.panscience.ai,http://localhost:5500,http://127.0.0.1:5500,*"
    )
    
    # Microsoft OAuth Settings
    MICROSOFT_CLIENT_ID: Optional[str] = os.getenv("MICROSOFT_CLIENT_ID", None)
    MICROSOFT_CLIENT_SECRET: Optional[str] = os.getenv("MICROSOFT_CLIENT_SECRET", None)
    MICROSOFT_TENANT_ID: str = os.getenv("MICROSOFT_TENANT_ID", "common")
    
    # Google OAuth Settings
    GOOGLE_CLIENT_ID: Optional[str] = os.getenv("GOOGLE_CLIENT_ID", None)
    GOOGLE_CLIENT_SECRET: Optional[str] = os.getenv("GOOGLE_CLIENT_SECRET", None)

    # Senior signup: only users who provide this key can create a Senior Leadership account
    SENIOR_SIGNUP_KEY: Optional[str] = os.getenv("SENIOR_SIGNUP_KEY", None)

    model_config = {
        "env_file": str(_ENV_FILE) if _ENV_FILE.exists() else None,
        "extra": "ignore"
    }

settings = Settings()


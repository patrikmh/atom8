"""Backend configuration."""
import os
from pathlib import Path

from pydantic_settings import BaseSettings


PROJECT_ROOT = Path(__file__).parent.parent.resolve()


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Pi / LLM
    pi_provider: str = os.getenv("PI_PROVIDER", "fireworks")
    pi_model: str = os.getenv("PI_MODEL", "accounts/fireworks/routers/kimi-k2p6-turbo")
    pi_tools: str = "read,grep,find,bash"

    # Google OAuth
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000")

    # CORS
    cors_origins: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

    # Data paths
    auth_json_path: Path = Path.home() / ".pi" / "agent" / "auth.json"
    dashboard_json_path: Path = PROJECT_ROOT / "dashboard_layout.json"

    # Session limits
    max_chat_sessions: int = 50
    chat_session_ttl: int = 3600  # seconds
    pi_timeout: int = 120  # seconds
    pi_pool_size: int = int(os.getenv("PI_POOL_SIZE", "3"))  # workers per skill

    class Config:
        env_file = PROJECT_ROOT / ".env"
        env_file_encoding = "utf-8"


settings = Settings()

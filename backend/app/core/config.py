"""
Application configuration using Pydantic Settings.
All values from .env file or environment variables.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Environment
    environment: str = "development"

    # Database
    database_url: str
    test_database_url: Optional[str] = None

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    test_redis_url: Optional[str] = None

    # Firebase
    firebase_project_id: str
    firebase_web_api_key: Optional[str] = None
    firebase_service_account_path: Optional[str] = None

    # LLM Providers
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    llm_primary_provider: str = "groq"
    llm_fallback_enabled: bool = True
    llm_max_retries: int = 3

    # GitHub
    github_pat: Optional[str] = None

    # Email (Brevo)
    brevo_api_key: Optional[str] = None
    brevo_sender_email: str = "noreply@vibe.dev"
    brevo_sender_name: str = "Vibe Platform"

    # Storage
    storage_type: str = "local"  # local or gcs
    local_storage_path: str = "./uploads"
    gcs_bucket_name: Optional[str] = None
    gcs_credentials_path: Optional[str] = None

    # API Settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    secret_key: str = "dev-secret-key-change-in-production"
    frontend_url: str = "http://localhost:5173"

    # Rate Limits
    rate_limit_api_default: str = "100/minute"
    rate_limit_submissions: str = "5/hour"
    rate_limit_auth: str = "10/minute"

    # LLM Budget Limits (USD)
    llm_daily_budget_default: float = 10.00
    llm_monthly_budget_default: float = 100.00
    llm_budget_warn_threshold: float = 0.8
    llm_budget_hard_stop_threshold: float = 1.0

    # Worker Settings
    worker_queue_name: str = "scoring"
    clone_timeout_seconds: int = 60
    job_timeout_seconds: int = 180
    stuck_job_threshold_minutes: int = 5

    # Monitoring & Alerts
    slack_webhook_url: Optional[str] = None
    alert_queue_depth_threshold: int = 100
    alert_llm_failure_rate_threshold: float = 0.10

    # SLO Thresholds
    slo_api_p95_ms: int = 400
    slo_job_p95_seconds: int = 180

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience export
settings = get_settings()

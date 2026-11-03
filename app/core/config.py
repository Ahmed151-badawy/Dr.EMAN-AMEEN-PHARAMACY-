from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Dr. Eman Ameen Pharmacy"
    ENV: str = "development"

    DATABASE_URL: str = (
        "postgresql+psycopg2://pharmacy:pharmacy_local_pw@db:5432/pharmacy_db"
    )

    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    CORS_ORIGINS: str = "*"

    # Low stock / expiry thresholds used by the rule-based alert system (Phase 5/6)
    EXPIRY_WARNING_DAYS: int = 60
    EXPIRY_CRITICAL_DAYS: int = 14

    # Forecasting defaults (Phase 7)
    FORECAST_LOOKBACK_DAYS: int = 30
    FORECAST_LEAD_TIME_DAYS: int = 7
    FORECAST_HORIZON_DAYS: int = 30
    STOCKOUT_ALERT_DAYS: int = 7


settings = Settings()

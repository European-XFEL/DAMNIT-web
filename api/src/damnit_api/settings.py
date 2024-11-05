from getpass import getuser
from typing import Annotated

from pydantic import (
    BaseModel,
    HttpUrl,
    SecretStr,
    UrlConstraints,
    field_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseModel):
    client_id: str
    client_secret: SecretStr
    server_metadata_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]


class UvicornSettings(BaseModel):
    host: str = "localhost"
    port: int = 8000
    reload: bool = True
    factory: bool = True

    @field_validator("factory", mode="after")
    @classmethod
    def factory_must_be_true(cls, v, values):
        """Ensure factory is true.

        Validator present as model is configured to allow extra so we want to ensure
        that factory is always true."""
        if not v:
            msg = "factory must be true"
            raise ValueError(msg)
        return v

    model_config = SettingsConfigDict(extra="allow")


class SentrySettings(BaseModel):
    dsn: HttpUrl
    traces_sample_rate: float = 0.0
    profiles_sample_rate: float = 0.0
    environment: str = f"local-dev-{getuser()}"

    model_config = SettingsConfigDict(extra="allow")


class Settings(BaseSettings):
    auth: AuthSettings

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    uvicorn: UvicornSettings = UvicornSettings()

    sentry: SentrySettings | None = None

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore[assignment]

if __name__ == "__main__":
    print(settings.model_dump_json(indent=2))

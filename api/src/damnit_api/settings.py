from pathlib import Path
from typing import Annotated

from pydantic import AnyUrl, BaseModel, HttpUrl, SecretStr, UrlConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseModel):
    client_id: str
    client_secret: SecretStr
    server_metadata_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]


class MTLSSettings(BaseModel):
    client_cert: Path
    client_key: Path
    root_cert: Path


class Settings(BaseSettings):
    auth: AuthSettings

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    address: AnyUrl = AnyUrl("http://127.0.0.1:8000")

    mtls: MTLSSettings | None = None

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore[assignment]

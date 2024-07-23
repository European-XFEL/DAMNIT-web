from typing import Annotated
from pydantic import BaseModel, Field, SecretStr, UrlConstraints, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseModel):
    client_id: str
    client_secret: SecretStr
    server_metadata_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]


class Settings(BaseSettings):
    auth: AuthSettings

    session_secret: SecretStr

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra='ignore',
    )


settings = Settings()  # type: ignore[assignment]

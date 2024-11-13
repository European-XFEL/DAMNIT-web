from datetime import datetime, timezone
from pathlib import Path
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


class MyMdCCredentials(BaseSettings):
    """MyMdC client settings.

    Get from from <https://in.xfel.eu/metadata/oauth/applications>.
    """

    client_id: str
    client_secret: SecretStr
    email: str
    token_url: HttpUrl
    base_url: HttpUrl

    _access_token: str = ""
    _expires_at: datetime = datetime.fromisocalendar(1970, 1, 1).astimezone(timezone.utc)


class Settings(BaseSettings):
    auth: AuthSettings

    proposal_cache: Path = Path(__file__).parents[2] / "damnit_proposals.json"

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    uvicorn: UvicornSettings = UvicornSettings()

    mymdc: MyMdCCredentials

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore[assignment]

if __name__ == "__main__":
    try:
        from rich import print as pprint
    except ImportError:

        def pprint(*args, **kwargs):
            print(args[0].model_dump_json(indent=2))

    pprint(settings)

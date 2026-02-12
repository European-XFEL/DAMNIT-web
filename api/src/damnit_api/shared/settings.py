from pathlib import Path
from typing import Annotated

from pydantic import (
    BaseModel,
    FilePath,
    HttpUrl,
    SecretStr,
    UrlConstraints,
    field_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

from .._mymdc.settings import MyMdCClientSettings, MyMdCMockSettings


class AuthSettings(BaseModel):
    client_id: str
    client_secret: SecretStr
    server_metadata_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]


class UvicornSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True
    factory: bool = True

    ssl_keyfile: FilePath | None = None
    ssl_certfile: FilePath | None = None

    @field_validator("factory", mode="after")
    @classmethod
    def factory_must_be_true(cls, v, values):
        """Ensure factory is true.

        Validator present as model is configured to allow extra so we want to
        ensure that factory is always true."""
        if not v:
            msg = "factory must be true"
            raise ValueError(msg)
        return v

    model_config = SettingsConfigDict(extra="allow")


class Settings(BaseSettings):
    auth: AuthSettings

    db_path: Path = Path(__file__).parents[3] / "dw_api.sqlite"

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    uvicorn: UvicornSettings = UvicornSettings()

    mymdc: MyMdCClientSettings = MyMdCMockSettings(
        mock_responses_file=Path(__file__).parents[3] / "tests" / "mock" / "_mymdc.json"
    )

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore[assignment]

if __name__ == "__main__":
    try:
        from rich import print as pprint  # pyright: ignore[reportMissingImports]
    except ImportError:

        def pprint(*args, **kwargs):
            print(args[0].model_dump_json(indent=2))

    pprint(settings)

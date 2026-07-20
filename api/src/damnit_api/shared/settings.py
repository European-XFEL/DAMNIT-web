from pathlib import Path
from typing import Annotated

from pydantic import (
    BaseModel,
    FilePath,
    HttpUrl,
    SecretStr,
    UrlConstraints,
    field_validator,
    model_validator,
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
    auth: AuthSettings | None = None

    damnit_path: Path | None = None

    db_path: Path = Path(__file__).parents[3] / "dw_api.sqlite"

    # Directory for file-backed Litestar stores (server-side sessions, response
    # cache) outside local mode; each named store gets a subdirectory.
    store_path: Path = Path(__file__).parents[3] / "stores"

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr | None = None

    # Whether the OAuth callback URL may be built from the `x-forwarded-host`
    # header. Only safe behind a reverse proxy that sets (and strips any
    # client-supplied copy of) this header — otherwise a client could spoof
    # it to redirect the OAuth callback. Off by default; a single flag is
    # enough since the app either sits behind one trusted proxy layer or none.
    trust_forwarded_host: bool = False

    uvicorn: UvicornSettings = UvicornSettings()

    @property
    def is_local(self) -> bool:
        return self.damnit_path is not None

    @model_validator(mode="after")
    def _apply_local_mode(self):
        if self.is_local:
            self.auth = None
            if self.session_secret is None:
                self.session_secret = SecretStr("dev-secret")
        elif self.auth is None:
            msg = (
                "auth settings are required when not in local mode"
                " (set damnit_path for local development)"
            )
            raise ValueError(msg)
        elif self.session_secret is None:
            msg = (
                "session_secret is required when not in local mode"
                " (set damnit_path for local development)"
            )
            raise ValueError(msg)
        return self

    mymdc: MyMdCClientSettings = MyMdCMockSettings(
        cassette_file=Path(__file__).parents[3]
        / "tests"
        / "mock"
        / "mymdc"
        / "mymdc.yaml"
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

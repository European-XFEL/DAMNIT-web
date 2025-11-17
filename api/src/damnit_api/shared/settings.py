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

from .._mymdc.settings import MockMyMdCData, MyMdCConfig


class AuthSettings(BaseModel):
    client_id: str
    client_secret: SecretStr
    server_metadata_url: Annotated[HttpUrl, UrlConstraints(allowed_schemes=["https"])]


class UvicornSettings(BaseModel):
    host: str = "localhost"
    port: int = 8000
    reload: bool = True
    factory: bool = True

    ssl_keyfile: FilePath | None = None
    ssl_certfile: FilePath | None = None
    ssl_ca_certs: FilePath | None = None
    ssl_cert_reqs: int | None = None

    @model_validator(mode="after")
    def ssl_all_if_one(self):
        """Ensure all SSL settings are set if one is set."""
        files = [self.ssl_keyfile, self.ssl_certfile, self.ssl_ca_certs]
        if any(files) and not all(files):
            msg = "ssl_keyfile, ssl_certfile, and ssl_ca_certs must all be set"
            raise ValueError(msg)

        if all(files):
            # Default to 2 (require mTLS) if any SSL settings are set
            self.ssl_cert_reqs = self.ssl_cert_reqs or 2

        return self

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

    proposal_cache: Path = Path(__file__).parents[2] / "damnit_proposals.json"

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    uvicorn: UvicornSettings = UvicornSettings()

    mymdc: MyMdCConfig = MockMyMdCData(
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

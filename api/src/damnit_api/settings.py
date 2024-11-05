from typing import Annotated

from pydantic import (
    AnyUrl,
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
    host: str
    port: int
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


class Settings(BaseSettings):
    auth: AuthSettings

    debug: bool = True

    log_level: str = "DEBUG"

    session_secret: SecretStr

    uvicorn: UvicornSettings

    address: AnyUrl = AnyUrl("http://127.0.0.1:8000")

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        env_file=[".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )

    @field_validator("uvicorn", mode="before")
    @classmethod
    def uvicorn_defaults_from_address(cls, v, values):
        """Set uvicorn host and port from main address if not separately provided."""
        address = values.data.get("address", AnyUrl("http://127.0.0.1:8000"))

        v["host"] = v.get("host", address.host)
        v["port"] = v.get("port", address.port)

        # Ensure top level address matches uvicorn address
        uvicorn_address = AnyUrl(f"http://{v['host']}:{v['port']}")
        if address != uvicorn_address:
            msg = f"address {address} does not match uvicorn address {uvicorn_address}"
            raise ValueError(msg)

        return v


settings = Settings()  # type: ignore[assignment]

if __name__ == "__main__":
    print(settings.model_dump_json(indent=2))

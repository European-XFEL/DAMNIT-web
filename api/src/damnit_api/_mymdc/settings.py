"""MyMdC Client Configurations."""

from datetime import UTC, datetime
from pathlib import Path

from pydantic import FilePath, HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings


class MyMdCHTTPSettings(BaseSettings):
    """MyMdC client settings used for authentication.

    Get from from <https://in.xfel.eu/metadata/oauth/applications>.
    """

    client_id: str
    client_secret: SecretStr
    email: str
    token_url: HttpUrl
    base_url: HttpUrl
    scope: str | None = None

    _access_token: str = ""
    _expires_at: datetime = datetime.fromisocalendar(1970, 1, 1).astimezone(UTC)


class MyMdCMockSettings(BaseSettings):
    """Mock MyMdC data for testing and local development.

    The data source is a recorded vcrpy cassette which contains/replays saved
    MyMdC responses (can be refreshed with `tests/mock/record_corpus.py`).
    """

    cassette_file: FilePath | None = None

    @field_validator("cassette_file", mode="before")
    @classmethod
    def allow_missing_file(cls, v: Path | None):
        return v if v and v.is_file() else None


type MyMdCClientSettings = MyMdCHTTPSettings | MyMdCMockSettings

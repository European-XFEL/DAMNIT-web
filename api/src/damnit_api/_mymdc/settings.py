"""MyMdC Client Configurations."""

from datetime import UTC, datetime

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings

from damnit_api._mymdc import models


class MyMdCCredentials(BaseSettings):
    """MyMdC client settings.

    Get from from <https://in.xfel.eu/metadata/oauth/applications>.
    """

    client_id: str
    client_secret: SecretStr
    email: str
    token_url: HttpUrl
    base_url: HttpUrl
    scope: str | None = "public"

    _access_token: str = ""
    _expires_at: datetime = datetime.fromisocalendar(1970, 1, 1).astimezone(UTC)


class MockMyMdCData(BaseSettings):
    """Mock MyMdC data settings for testing and local development."""

    mock_users: dict[int, models.User] = {
        1: models.User(email="foo@bar.com", first_name="Foo", last_name="Bar"),
    }

    mock_proposals: dict[int, models.Proposal] = {
        1234: models.Proposal(
            title="Foo",
            instrument_id=1234,
            instrument_cycle_id=1234,
            principal_investigator_id=1234,
            main_proposer_id=1234,
        )
    }


type MyMdCConfig = MyMdCCredentials | MockMyMdCData

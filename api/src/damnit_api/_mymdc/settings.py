"""MyMdC Client Configurations."""

from datetime import UTC, datetime

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings

from damnit_api._mymdc import models

from .vendor.models import UsersProposal


class MyMdCCredentials(BaseSettings):
    """MyMdC client settings used for authentication.

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
    """Mock MyMdC data for testing and local development."""

    mock_users: dict[str, models.User] = {
        "foo": models.User(email="foo@bar.com", first_name="Foo", last_name="Bar"),
    }

    mock_proposals: dict[int, models.Proposal] = {
        1234: models.Proposal(
            number=1234,
            def_proposal_path="/gpfs/exfel/exp/SCS/202131/p900212/raw",
            beamtime_start_at="2020-01-01T00:00:00+00:00",
            beamtime_end_at="2020-01-01T00:00:00+00:00",
            instrument_identifier="SCS",
            title="Foo",
            instrument_id=1234,
            instrument_cycle_id=1234,
            principal_investigator_id=1234,
            main_proposer_id=1234,
        )
    }

    mock_cycles: dict[int, models.InstrumentCycle] = {
        1234: models.InstrumentCycle(
            identifier="202020",
            instrument_id=1234,
            begin_at="2020-01-01T00:00:00+00:00",
            end_at="2020-01-01T00:00:00+00:00",
        )
    }

    mock_user_proposals: dict[str, models.UserProposals] = {
        "foo": models.UserProposals(
            root=[UsersProposal(proposal_id=1234, proposal_number=1234)],
        )
    }


type MyMdCConfig = MyMdCCredentials | MockMyMdCData

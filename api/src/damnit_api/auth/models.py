"""Authentication and Authorization models."""

from typing import Self

from fastapi.requests import HTTPConnection
from pydantic import BaseModel, ConfigDict, RootModel

from .. import get_logger
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient

logger = get_logger()


class BaseUserInfo(BaseModel):
    email: str
    family_name: str
    given_name: str
    groups: list[str]
    name: str
    preferred_username: str

    # Discarded fields
    # email_verified: bool
    # sub: str
    # roles: list[str]

    model_config = ConfigDict(extra="ignore")


class OAuthUserInfo(BaseUserInfo):
    """Basic user information obtained from the OAuth provider."""

    @classmethod
    def from_connection(cls, connection: HTTPConnection) -> Self:
        """Create an OAuthUserInfo from the request session.

        !!! note

            Dependency on `HTTPConnection` instead of `Request` to support websockets.
        """
        user_dict = connection.session.get("user")
        if user_dict is None:
            msg = "No user info in session"
            raise ValueError(msg)
        return cls.model_validate(user_dict)


class ProposalsByYearHalf(RootModel):
    """Mapping of year half (e.g. 202401, 202402) to list of proposal numbers."""

    root: dict[int, list[int]]


class User(BaseUserInfo):
    """Full user information including list of proposals."""

    _proposals: list[int]
    proposals_by_year_half: ProposalsByYearHalf

    @classmethod
    async def from_connection(
        cls,
        connection: HTTPConnection,
        mymdc: MyMdCClient,
        session: DBSession,
    ) -> Self:
        """Create a `User` from the request session, which contains a list of proposals
        that the is a member of.

        !!! note

            Dependency on `HTTPConnection` instead of `Request` to support websockets.
        """
        from ..metadata.services import _get_proposal_meta_many

        oauth = OAuthUserInfo.from_connection(connection)
        proposals = await mymdc.get_user_proposals(oauth.preferred_username)
        proposal_numbers = [
            p.proposal_number for p in proposals.root if p.proposal_number is not None
        ]

        proposals_meta = await _get_proposal_meta_many(
            mymdc,
            proposal_numbers,
            session,
        )

        proposals_by_year_half = {}
        for meta in proposals_meta:
            if meta.damnit_path is None:
                proposal_numbers.remove(meta.number)
                continue

            if meta.start_date is None:
                continue

            if meta.year_half not in proposals_by_year_half:
                proposals_by_year_half[meta.year_half] = []

            proposals_by_year_half[meta.year_half].append(meta.number)

        res = cls.model_validate({
            **oauth.model_dump(),
            "proposals_by_year_half": proposals_by_year_half,
        })

        res._proposals = proposal_numbers

        return res

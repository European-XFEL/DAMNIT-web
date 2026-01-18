"""Authentication and Authorization models."""

from typing import Self

from fastapi.requests import HTTPConnection
from pydantic import BaseModel, ConfigDict

from .. import get_logger
from .._mymdc.dependencies import MyMdCClient
from .._mymdc.models import UserProposalsByCycle

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


class User(BaseUserInfo):
    """Full user information including list of proposals."""

    proposals: UserProposalsByCycle

    @classmethod
    async def from_connection(
        cls, connection: HTTPConnection, mymdc: MyMdCClient
    ) -> Self:
        """Create a `User` from the request session, which contains a list of proposals
        that the is a member of.

        !!! note

            Dependency on `HTTPConnection` instead of `Request` to support websockets.
        """
        oauth = OAuthUserInfo.from_connection(connection)
        proposals = await mymdc.get_user_proposals(oauth.preferred_username)
        await logger.ainfo("User info", preferred_username=oauth.preferred_username)
        return cls.model_validate({
            **oauth.model_dump(),
            "proposals": proposals,
        })

"""Authentication and Authorization models."""

from typing import Self

from fastapi import Request
from pydantic import BaseModel, ConfigDict

from .._mymdc.dependencies import MyMdCClient
from .._mymdc.models import UserProposals


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
    def from_request(cls, request: Request) -> Self:
        """Create an OAuthUserInfo from the request session."""
        user_dict = request.session.get("user")
        if user_dict is None:
            msg = "No user info in session"
            raise ValueError(msg)
        return cls.model_validate(user_dict)


class User(BaseUserInfo):
    """Full user information including list of proposals."""

    proposals: UserProposals

    @classmethod
    async def from_request(cls, request: Request, mymdc: MyMdCClient) -> Self:
        oauth = OAuthUserInfo.from_request(request)
        proposals = await mymdc.get_user_proposals(oauth.preferred_username)
        return cls.model_validate({
            **oauth.model_dump(),
            "proposals": proposals,
        })

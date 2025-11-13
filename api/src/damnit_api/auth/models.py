"""Authentication and Authorization models."""

from typing import Self

from fastapi import Request
from pydantic import BaseModel

from .._mymdc.dependencies import MyMdCClient
from .._mymdc.models import UserProposals


class BaseUserInfo(BaseModel):
    email: str
    email_verified: bool
    family_name: str
    given_name: str
    groups: list[str]
    name: str
    preferred_username: str
    sub: str


class OAuthUserInfo(BaseUserInfo):
    @classmethod
    def from_request(cls, request: Request) -> Self:
        """Create an OAuthUserInfo from the request session."""
        user_dict = request.session.get("user")
        if user_dict is None:
            msg = "No user info in session"
            raise ValueError(msg)
        return cls.model_validate(user_dict)


class User(BaseUserInfo):
    proposals: UserProposals

    @classmethod
    async def from_request(cls, request: Request, mymdc: MyMdCClient) -> Self:
        oauth = OAuthUserInfo.from_request(request)
        proposals = await mymdc.get_user_proposals(oauth.preferred_username)
        return cls.model_validate({
            **oauth.model_dump(),
            "proposals": proposals,
        })

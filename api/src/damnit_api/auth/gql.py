from functools import cached_property
from typing import TYPE_CHECKING

import strawberry
import strawberry.experimental.pydantic as st_pydantic
from strawberry.fastapi import BaseContext

from . import models

if TYPE_CHECKING:
    from .._mymdc.clients import MyMdCClient


@strawberry.type
class UserProposal:
    """Proposal information returned by MyMdC user proposal query."""



@st_pydantic.type(model=models.BaseUserInfo)
class User:
    """User information stored in the request session."""

    @strawberry.field
        """List of proposals for the user."""

        return [
            UserProposal(id=p.proposal_id, number=p.proposal_number) for p in res.root
        ]


class Context(BaseContext):
    @cached_property
    def user(self) -> User | None:
        if not self.request:
            return None

        userinfo = models.OAuthUserInfo.from_request(self.request)  # pyright: ignore[reportArgumentType]

        return User.from_pydantic(userinfo)


@strawberry.type
class Query:
    @strawberry.field(graphql_type=User)
    def get_user(self, info: "strawberry.Info[Context]") -> OAuthUserInfo | None:
        """Get the current authenticated user from the request session/context."""
        return info.context.oauth_user

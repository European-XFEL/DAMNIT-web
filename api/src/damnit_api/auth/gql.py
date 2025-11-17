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
    id: int | None
    number: int | None


@st_pydantic.type(model=models.BaseUserInfo)
class User:
    email: strawberry.auto
    family_name: strawberry.auto
    given_name: strawberry.auto
    groups: strawberry.auto
    name: strawberry.auto
    preferred_username: strawberry.auto

    @strawberry.field
    async def proposals(self, info: strawberry.Info) -> list[UserProposal]:
        mymdc: MyMdCClient = await info.context.mymdc

        res = await mymdc.get_user_proposals(self.preferred_username)

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
    @strawberry.field
    def get_user(self, info: strawberry.Info[Context]) -> User | None:
        return info.context.user

"""GraphQL types for auth module."""

from typing import TYPE_CHECKING

import strawberry

from .models import OAuthUserInfo

if TYPE_CHECKING:
    from ..shared.gql import Context


@strawberry.type
class UserProposal:
    """Proposal information returned by MyMdC user proposal query."""

    proposal_id: int | None
    proposal_number: int | None


@strawberry.type
class User:
    """User information stored in the request session."""

    email: str
    family_name: str
    given_name: str
    groups: list[str]
    name: str
    preferred_username: str

    @strawberry.field
    async def proposals(self, info: "strawberry.Info[Context]") -> list[UserProposal]:
        """List of proposals for the user."""
        mymdc = info.context.mymdc

        return [
            UserProposal(**p.model_dump())
            for p in (await mymdc.get_user_proposals(self.preferred_username)).root
        ]


@strawberry.type
class Query:
    @strawberry.field(graphql_type=User)
    def get_user(self, info: "strawberry.Info[Context]") -> OAuthUserInfo:
        """Get the current authenticated user from the request session/context."""
        return info.context.oauth_user

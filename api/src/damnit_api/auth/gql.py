"""GraphQL types for auth module."""

from typing import TYPE_CHECKING

import strawberry

from ..metadata.gql import ProposalMeta
from ..metadata.services import _get_proposal_meta_many
from .models import OAuthUserInfo

if TYPE_CHECKING:
    from ..shared.gql import Context


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
    async def proposals(self, info: "strawberry.Info[Context]") -> list[ProposalMeta]:
        """List of proposals for the user."""
        mymdc, session = info.context.mymdc, info.context.session

        proposals = await mymdc.get_user_proposals(self.preferred_username)
        proposal_numbers = [
            p.proposal_number for p in proposals.root if p.proposal_number is not None
        ]

        proposals_meta = await _get_proposal_meta_many(
            mymdc,
            proposal_numbers,
            session,
        )

        return [ProposalMeta.from_pydantic(p) for p in proposals_meta]


@strawberry.type
class Query:
    @strawberry.field(graphql_type=User)
    def get_user(self, info: "strawberry.Info[Context]") -> OAuthUserInfo:
        """Get the current authenticated user from the request session/context."""
        return info.context.oauth_user

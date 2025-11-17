"""GraphQL router for metadata."""

from __future__ import annotations

from typing import TYPE_CHECKING

import strawberry
import strawberry.experimental.pydantic as st_pydantic

from . import models, services

if TYPE_CHECKING:
    from ..shared.gql import Context


@st_pydantic.type(
    model=models.ProposalMeta,
    fields=["instrument", "title", "start_date", "end_date"],
)
class ProposalMeta:
    """Proposal metadata."""

    no: int
    cycle: str
    path: str
    damnit_path: str | None


@strawberry.type
class Query:
    @strawberry.field
    async def proposal_metadata(
        self, proposal_no: int, info: strawberry.Info[Context]
    ) -> ProposalMeta:
        """Fetch metadata for the provided proposal number."""
        user, mymdc = info.context.oauth_user, info.context.mymdc

        allowed_proposals = {
            p.proposal_number
            for p in (await mymdc.get_user_proposals(user.preferred_username)).root
        }

        if proposal_no not in allowed_proposals:
            msg = (
                "User "
                f"{user.preferred_username} "
                f"not authorized for proposal {proposal_no}"
            )
            raise PermissionError(msg)

        return ProposalMeta.from_pydantic(
            await services.get_proposal_meta(mymdc, proposal_no)
        )

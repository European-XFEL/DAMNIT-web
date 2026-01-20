"""GraphQL router for metadata."""

from __future__ import annotations

from typing import TYPE_CHECKING

import strawberry
import strawberry.experimental.pydantic as st_pydantic

from ..auth.models import User
from . import models, services

if TYPE_CHECKING:
    from ..shared.gql import Context


@st_pydantic.type(model=models.ProposalMeta, all_fields=True)
class ProposalMeta:
    """Proposal metadata."""

    # NOTE: pydantic computed fields not included by default
    @strawberry.field
    def year_half(self) -> str | None:
        if self.start_date is None:  # pyright: ignore[reportAttributeAccessIssue]
            return None

        year_month = self.start_date.strftime("%Y%m")  # pyright: ignore[reportAttributeAccessIssue]
        return str(year_month[:4] + ("01" if year_month[4] < "07" else "02"))


@strawberry.type
class Query:
    @strawberry.field
    async def proposal_metadata(
        self, proposal_number: int, info: strawberry.Info[Context]
    ) -> ProposalMeta | None:
        """Fetch metadata for the provided proposal number."""
        oauth_user, mymdc = info.context.oauth_user, info.context.mymdc

        user = User(
            **oauth_user.model_dump(),
            proposals=await mymdc.get_user_proposals(oauth_user.preferred_username),
        )

        return ProposalMeta.from_pydantic(
            await services.get_proposal_meta(mymdc, proposal_number, user)
        )

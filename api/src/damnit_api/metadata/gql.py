"""GraphQL router for metadata."""

from __future__ import annotations

from typing import TYPE_CHECKING

import strawberry
import strawberry.experimental.pydantic as st_pydantic

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
        self,
        info: strawberry.Info[Context],
        proposal_numbers: list[int],
    ) -> list[ProposalMeta] | None:
        """Fetch metadata for the provided proposal number."""
        if info.context.request is None:
            return None

        mymdc, session = info.context.mymdc, info.context.session

        proposals_meta = await services._get_proposal_meta_many(
            mymdc,
            proposal_numbers,
            session,
        )

        return [ProposalMeta.from_pydantic(p) for p in proposals_meta]

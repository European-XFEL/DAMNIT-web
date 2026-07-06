"""GraphQL router for metadata."""

from __future__ import annotations

from typing import TYPE_CHECKING

import strawberry
import strawberry.experimental.pydantic as st_pydantic

from .. import get_logger
from ..auth.models import User
from ..auth.permissions import IsAuthenticated
from . import models, services

if TYPE_CHECKING:
    from ..shared.gql import Context

logger = get_logger()


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
    @strawberry.field(permission_classes=[IsAuthenticated])
    async def proposal_metadata(
        self,
        info: strawberry.Info[Context],
        proposal_numbers: list[int],
    ) -> list[ProposalMeta] | None:
        """Fetch metadata for the given proposal numbers.

        !!! warning

            Proposals the user is not a member of are silently dropped from the result
            rather than raising an error.
        """
        from ..shared.settings import settings

        if info.context.request is None:
            return None

        if settings.is_local:
            return [
                ProposalMeta.from_pydantic(services._local_proposal_meta(n))
                for n in proposal_numbers
            ]

        mymdc, session = info.context.mymdc, info.context.session

        user = await User.from_oauth_user(mymdc, session, info.context.oauth_user)
        allowed_proposal_numbers = [n for n in proposal_numbers if n in user.proposals]
        if dropped := set(proposal_numbers) - set(allowed_proposal_numbers):
            await logger.ainfo(
                "Dropping proposals the user is not a member of",
                proposals=sorted(dropped),
                user=user.preferred_username,
            )

        proposals_meta = await services._get_proposal_meta_many(
            mymdc,
            allowed_proposal_numbers,
            session,
        )

        return [ProposalMeta.from_pydantic(p) for p in proposals_meta]

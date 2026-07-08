"""Metadata routers."""

from litestar import Router, get
from litestar.di import Provide
from sqlalchemy.ext.asyncio import AsyncSession

from .._mymdc.dependencies import MyMdCClient
from ..shared.models import ProposalNumber
from . import services
from .models import ProposalMeta


async def get_proposal_meta(
    proposal_number: ProposalNumber,
    mymdc: MyMdCClient,
    session: AsyncSession,
) -> ProposalMeta:
    """Dependency: resolve ProposalMeta from path/query parameter."""
    return await services.get_proposal_meta(mymdc, proposal_number, session)


@get("/proposal/{proposal_number:int}", sync_to_thread=False)
def get_proposal(proposal_meta: ProposalMeta) -> ProposalMeta:
    return proposal_meta


router = Router(
    path="/metadata",
    route_handlers=[get_proposal],
    dependencies={"proposal_meta": Provide(get_proposal_meta)},
    tags=["metadata"],
)

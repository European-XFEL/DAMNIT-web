"""Metadata routers."""

from fastapi import APIRouter

from .._mymdc.dependencies import MyMdCClient
from ..auth.dependencies import User
from ..shared.models import ProposalNumber
from . import services
from .models import ProposalMeta

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.get("/proposal/{proposal_number}")
async def get_proposal_meta(
    proposal_number: ProposalNumber, mymdc: MyMdCClient, user: User
) -> ProposalMeta:
    """Get proposal metadata by proposal number."""
    return await services.get_proposal_meta(mymdc, proposal_number, user)

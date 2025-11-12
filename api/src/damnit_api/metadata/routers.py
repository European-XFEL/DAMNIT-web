"""Metadata routers."""

from typing import Annotated

from fastapi import APIRouter, Depends

from .._mymdc import get_client_mymdc
from .._mymdc.clients import MyMdCClient
from ..models import ProposalNo
from . import services
from .models import ProposalMeta

router = APIRouter(prefix="/metadata")


# TODO: depend on user object for authentication/authorization
@router.get("/proposal/{proposal_no}")
async def get_proposal_meta(
    proposal_no: ProposalNo, client: Annotated[MyMdCClient, Depends(get_client_mymdc)]
) -> ProposalMeta:
    """Get proposal metadata by proposal number."""
    return await services.get_proposal_meta(client, proposal_no)

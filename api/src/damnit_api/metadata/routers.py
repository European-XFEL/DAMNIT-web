from fastapi import APIRouter
from .proposals import get_proposal_info


router = APIRouter(prefix="/metadata", include_in_schema=False)


@router.get("/proposal/{proposal_num}")
async def proposal_info(proposal_num):
    # TODO: Use authentication
    return await get_proposal_info(proposal_num)

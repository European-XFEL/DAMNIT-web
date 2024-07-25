from fastapi import APIRouter, HTTPException
from .proposals import get_proposal_info


router = APIRouter(prefix="/metadata", include_in_schema=False)


@router.get("/proposal/{proposal_num}")
async def proposal_info(proposal_num):
    # TODO: Use authentication
    info = await get_proposal_info(proposal_num)
    if not info:
        raise HTTPException(
            status_code=404, detail=f"Proposal `p{proposal_num}` not found."
        )

    return info

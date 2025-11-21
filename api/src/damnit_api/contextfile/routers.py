from typing import Annotated

from anyio import Path as APath
from fastapi import APIRouter, Depends

from ..metadata.models import ProposalMeta
from ..metadata.routers import get_proposal_meta
from . import models

router = APIRouter(prefix="/contextfile")


@router.get("/content")
async def get_content(
    proposal: Annotated[ProposalMeta, Depends(get_proposal_meta)],
) -> models.ContextFile | None:
    if proposal.damnit_path is None:
        return None

    return await models.ContextFile.from_file(
        APath(proposal.damnit_path) / "context.py"
    )


@router.get("/last_modified")
async def get_modified(
    proposal: Annotated[ProposalMeta, Depends(get_proposal_meta)],
) -> models.ModifiedTime | None:
    if proposal.damnit_path is None:
        return None

    return await models.ModifiedTime.from_file(
        APath(proposal.damnit_path) / "context.py"
    )

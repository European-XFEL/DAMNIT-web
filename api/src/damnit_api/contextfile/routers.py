from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..metadata.proposals import get_proposal_info
from . import mtime_cache

router = APIRouter(prefix="/contextfile", include_in_schema=True)


async def fetch_file_data(file_path: Path) -> str:
    async with aiofiles.open(file_path, encoding="utf-8") as f:
        return await f.read()


async def get_file_path(proposal_num, filename):
    info = await get_proposal_info(proposal_num)

    if not info:
        raise HTTPException(
            status_code=404, detail=f"Proposal `p{proposal_num}` not found."
        )

    file_path = Path(info["damnit_path"]) / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                f"File {filename} not found in proposal path {info['damnit_path']}."
            ),
        )

    return str(file_path)


@router.get("/content")
async def fetch_current_file(proposal_num):
    file_path = await get_file_path(proposal_num, "context.py")

    file_data = await fetch_file_data(file_path)
    last_modified = mtime_cache.get(file_path)

    return JSONResponse({
        "fileContent": file_data,
        "lastModified": last_modified,
    })


@router.get("/last_modified")
async def last_modified(
    proposal_num: str,
):
    file_path = await get_file_path(proposal_num, "context.py")
    last_modified = mtime_cache.get(file_path)
    return JSONResponse(content={"lastModified": last_modified})

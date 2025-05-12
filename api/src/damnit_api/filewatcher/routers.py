from fastapi import APIRouter, HTTPException, Depends, Request
import os
from pathlib import Path
from ..metadata.proposals import get_proposal_info
from .utils import fetch_file_data
from .cache import get
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/file", include_in_schema=False)


async def get_file_path(proposal_num, filename):
    info = await get_proposal_info(proposal_num)

    if not info:
        raise HTTPException(
            status_code=404, detail=f"Proposal `p{proposal_num}` not found.")

    file_path = Path(info['damnit_path']) / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404, detail=f"File {filename} not found in proposal path {info["damnit_path"]}."
        )

    return str(file_path)

@router.get("/current")
async def fetch_current_file(proposal_num, filename):

    file_path = await get_file_path(proposal_num, filename)

    file_data = await fetch_file_data(file_path, with_content=True)

    return JSONResponse({"fileContent": file_data})


@router.get("/last_modified")
async def last_modified(proposal_num: str,
                        file_name: str,
                        ):

    file_path = await get_file_path(proposal_num, file_name)
    last_modified = get(file_path)
    return JSONResponse(content={"lastModified": last_modified})

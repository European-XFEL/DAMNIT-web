from fastapi import APIRouter, HTTPException, Depends, Request
import os
from pathlib import Path
from ..metadata.proposals import get_proposal_info
from .utils import fetch_file_data
from .file_watcher import FileWatcherManager
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/file", include_in_schema=False)
watcher_manager = FileWatcherManager()

def get_watcher_manager():
    return watcher_manager

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

@router.get("/health")
async def health():
    return {"message":"OK"}

@router.get("/current")
async def fetch_current_file(proposal_num, filename):
    
    file_path = await get_file_path(proposal_num, filename)
    
    file_data = await fetch_file_data(file_path, with_content=True)
    
    return JSONResponse({"fileContent": file_data})
    
@router.get("/last_modified")
async def last_modified(proposal_num: str,
                        file_name: str,
                        request: Request,
                        watcher_manager: FileWatcherManager = Depends(get_watcher_manager),
                        ):
    
    file_path = await get_file_path(proposal_num, file_name)
    client_ip = request.client.host
    last_modified = await watcher_manager.last_modified(file_path, client_ip)
    return JSONResponse(content={"lastModified": last_modified})
    
@router.get("/watcher_status")
async def watcher_status(proposal_num: str,
                        file_name: str,
                        manager: FileWatcherManager = Depends(get_watcher_manager)):
    
    file_path = await get_file_path(proposal_num, file_name)
    status = watcher_manager.watcher_status(file_path)
    return JSONResponse(content={"status": status})

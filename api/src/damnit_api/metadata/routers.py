"""Metadata routers."""

from fastapi import APIRouter

from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth.dependencies import User
from ..shared.models import ProposalNumber
from ..shared.settings import settings
from . import services
from .hzdr_sources import (
    HZDRDatasetPreview,
    HZDRShot,
    HZDRShotDetail,
    HZDRSource,
    HZDRSourceProvider,
)
from .models import ProposalMeta

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.get("/proposal/{proposal_number}")
async def get_proposal_meta(
    proposal_number: ProposalNumber, mymdc: MyMdCClient, user: User, session: DBSession
) -> ProposalMeta:
    """Get proposal metadata by proposal number."""
    return await services.get_proposal_meta(mymdc, proposal_number, user, session)


@router.get("/hzdr/sources")
async def list_hzdr_sources() -> list[HZDRSource]:
    """List configured HZDR sources from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).list_sources()


@router.get("/hzdr/sources/{source_key}")
async def get_hzdr_source(source_key: str) -> HZDRSource | None:
    """Get one HZDR source from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).get_source(source_key)


@router.get("/hzdr/sources/{source_key}/shots")
async def list_hzdr_shots(source_key: str) -> list[HZDRShot]:
    """List shot records for one HZDR source."""
    return HZDRSourceProvider(settings.metadata).list_shots(source_key)


@router.get("/hzdr/sources/{source_key}/shots/{shot_number}")
async def get_hzdr_shot_detail(
    source_key: str, shot_number: int
) -> HZDRShotDetail | None:
    """Get one shot with basic HDF5 structure metadata."""
    return HZDRSourceProvider(settings.metadata).get_shot_detail(
        source_key, shot_number
    )


@router.get("/hzdr/sources/{source_key}/shots/{shot_number}/datasets/{dataset_name:path}")
async def preview_hzdr_dataset(
    source_key: str, shot_number: int, dataset_name: str
) -> HZDRDatasetPreview | None:
    """Preview one HDF5 dataset for a selected HZDR shot."""
    return HZDRSourceProvider(settings.metadata).get_dataset_preview(
        source_key, shot_number, dataset_name
    )

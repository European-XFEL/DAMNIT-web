"""Shared API routes for runtime application configuration."""

from fastapi import APIRouter
from pydantic import BaseModel

from .settings import settings

router = APIRouter(prefix="/config", tags=["config"])


class TerminologyConfig(BaseModel):
    identity_name: str
    identity_name_plural: str
    identity_label: str
    identity_label_plural: str
    collection_label: str
    uses_proposals: bool
    uses_mymdc: bool


class RuntimeConfig(BaseModel):
    profile: str
    auth_mode: str
    metadata_provider: str
    terminology: TerminologyConfig


@router.get("/runtime")
async def get_runtime_config() -> RuntimeConfig:
    """Return deployment terms so clients can avoid hard-coded proposal wording."""
    terminology = settings.deployment.terminology.model_copy(
        update={
            "uses_mymdc": settings.metadata.provider == "mymdc",
        }
    )
    return RuntimeConfig(
        profile=settings.deployment.profile,
        auth_mode=settings.auth.mode,
        metadata_provider=settings.metadata.provider,
        terminology=TerminologyConfig.model_validate(terminology.model_dump()),
    )

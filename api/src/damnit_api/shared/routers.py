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


class FlowMonitorReceiversConfig(BaseModel):
    laser_data: bool
    watchdog: bool
    mongo: bool


class FlowMonitorOptionConfig(BaseModel):
    value: str
    label: str
    description: str = ""


class ShotcounterProducerConfig(BaseModel):
    enabled: bool
    tkeys: list[FlowMonitorOptionConfig]


class LaserDataProducerConfig(BaseModel):
    enabled: bool


class WatchdogProducerConfig(BaseModel):
    enabled: bool
    watchers: list[FlowMonitorOptionConfig]


class MongoProducerConfig(BaseModel):
    enabled: bool
    updates_damnit_sqlite: bool


class FlowMonitorProducersConfig(BaseModel):
    shotcounter: ShotcounterProducerConfig
    laser_data: LaserDataProducerConfig
    watchdog: WatchdogProducerConfig
    mongo: MongoProducerConfig


class FlowMonitorConfig(BaseModel):
    receivers: FlowMonitorReceiversConfig
    producers: FlowMonitorProducersConfig


class RuntimeConfig(BaseModel):
    profile: str
    auth_mode: str
    ldap_form_enabled: bool
    metadata_provider: str
    flow_monitor: FlowMonitorConfig
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
        ldap_form_enabled=bool(settings.auth.ldap.server_url),
        metadata_provider=settings.metadata.provider,
        flow_monitor=FlowMonitorConfig.model_validate(
            settings.flow_monitor.model_dump()
        ),
        terminology=TerminologyConfig.model_validate(terminology.model_dump()),
    )

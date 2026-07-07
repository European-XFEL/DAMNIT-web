"""Shared API routes for runtime application configuration."""

import asyncio
import time
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from .flow_activity import FlowActivity, collect_flow_activity
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


class ServiceHealth(BaseModel):
    reachable: bool
    latency_ms: int | None = None
    detail: str | None = None


class FlowMonitorHealth(BaseModel):
    asapo: ServiceHealth
    kafka: ServiceHealth
    mongo: ServiceHealth


async def _probe_asapo(url: str, probe_timeout: float) -> ServiceHealth:
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=probe_timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        ms = int((time.monotonic() - t0) * 1000)
        return ServiceHealth(reachable=True, latency_ms=ms)
    except Exception as exc:
        return ServiceHealth(reachable=False, detail=str(exc)[:120])


async def _probe_kafka(bootstrap: str, probe_timeout: float) -> ServiceHealth:
    host, _, port_str = bootstrap.partition(":")
    port = int(port_str) if port_str.isdigit() else 9092
    t0 = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=probe_timeout,
        )
        writer.close()
        await writer.wait_closed()
        ms = int((time.monotonic() - t0) * 1000)
        return ServiceHealth(reachable=True, latency_ms=ms)
    except Exception as exc:
        return ServiceHealth(reachable=False, detail=str(exc)[:120])


async def _probe_mongo(uri: str, probe_timeout: float) -> ServiceHealth:
    t0 = time.monotonic()
    try:
        import motor.motor_asyncio as motor  # type: ignore[import-untyped]

        timeout_ms = int(probe_timeout * 1000)
        client: Any = motor.AsyncIOMotorClient(uri, serverSelectionTimeoutMS=timeout_ms)
        await client.admin.command("ping")
        client.close()
        ms = int((time.monotonic() - t0) * 1000)
        return ServiceHealth(reachable=True, latency_ms=ms)
    except ImportError:
        return ServiceHealth(reachable=False, detail="motor not installed")
    except Exception as exc:
        return ServiceHealth(reachable=False, detail=str(exc)[:120])


@router.get("/health")
async def get_flow_monitor_health() -> FlowMonitorHealth:
    """Live liveness probes for ASAPO, Kafka, and Mongo.

    Each probe is non-blocking with an independent timeout.  A failed probe
    sets reachable=false and does not raise an HTTP error; callers can always
    get a response.
    """
    h = settings.hzdr_health
    asapo, kafka, mongo = await asyncio.gather(
        _probe_asapo(h.asapo_status_url, h.timeout),
        _probe_kafka(h.kafka_bootstrap, h.timeout),
        _probe_mongo(h.mongo_uri, h.timeout),
    )
    return FlowMonitorHealth(asapo=asapo, kafka=kafka, mongo=mongo)


@router.get("/flow-activity")
async def get_flow_activity() -> FlowActivity:
    """Real data-flow activity for the flow monitor's Live mode.

    Read-only: Kafka offset counts (no consumer group joined), spool-file line
    counts, and optional ASAPO stream sizes.  Each broker that is down or
    unconfigured yields ``available=false`` rather than failing the request.
    """
    return await asyncio.to_thread(collect_flow_activity)


@router.get("/runtime")
async def get_runtime_config() -> RuntimeConfig:
    """Return deployment terms so clients can avoid hard-coded proposal wording.

    settings.auth is None in true local/offline mode (damnit_path set, no
    DW_API_AUTH__* env at all - see Settings._apply_local_mode) - the local
    HZDR acceptance script and hzdr/scripts/test.ps1 both run this way, so this
    must not assume settings.auth is always an object.
    """
    terminology = settings.deployment.terminology.model_copy(
        update={
            "uses_mymdc": settings.metadata.provider == "mymdc",
        }
    )
    return RuntimeConfig(
        profile=settings.deployment.profile,
        auth_mode=settings.auth.mode if settings.auth is not None else "none",
        ldap_form_enabled=bool(
            settings.auth is not None and settings.auth.ldap.server_url
        ),
        metadata_provider=settings.metadata.provider,
        flow_monitor=FlowMonitorConfig.model_validate(
            settings.flow_monitor.model_dump()
        ),
        terminology=TerminologyConfig.model_validate(terminology.model_dump()),
    )

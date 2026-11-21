"""Shared API routes for runtime application configuration."""

import asyncio
import subprocess  # noqa: S404 -- git rev-parse, fixed arguments
import time
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from .flow_activity import FlowActivity, collect_flow_activity
from .settings import settings

router = APIRouter(prefix="/config", tags=["config"])


def _checkout_commit() -> str | None:
    """The git commit of the checkout this code runs from, or None.

    None for an install without a git checkout (a wheel under /opt) or
    without git on the PATH.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],  # noqa: S607
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() or None


def _package_version() -> str | None:
    try:
        return package_version("damnit-api")
    except PackageNotFoundError:
        return None


# Read once, when the process starts: the commit of the code that is
# running, even after a later `git pull` that has not been restarted onto.
_RUNNING_COMMIT = _checkout_commit()
_RUNNING_VERSION = _package_version()


class VersionInfo(BaseModel):
    """What the API process runs, so a frontend can tell it is out of step."""

    version: str | None
    commit: str | None


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
    # True when a spool consumer (ASAPO or Kafka) is enabled, so real traffic
    # reaches this deployment; the flow monitor then opens in Live mode.
    live_traffic: bool = False


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


def _make_mongo_client(uri: str, timeout_ms: int) -> Any:
    import motor.motor_asyncio as motor  # type: ignore[import-untyped]

    return motor.AsyncIOMotorClient(uri, serverSelectionTimeoutMS=timeout_ms)


async def _probe_mongo(uri: str, probe_timeout: float) -> ServiceHealth:
    t0 = time.monotonic()
    try:
        # The first call imports motor/pymongo and builds a client, both
        # synchronous. Run on the event loop, that blocked the concurrent
        # Kafka and ASAPO probes past their own timeouts, so the first
        # /config/health after a restart reported Kafka unreachable. The
        # client binds to the event loop only on first use, so building it
        # in a worker thread is safe; close() is synchronous too.
        timeout_ms = int(probe_timeout * 1000)
        client: Any = await asyncio.to_thread(_make_mongo_client, uri, timeout_ms)
        await client.admin.command("ping")
        await asyncio.to_thread(client.close)
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


@router.get("/version")
async def get_version() -> VersionInfo:
    """The damnit-api package version and the checkout's commit at start-up."""
    return VersionInfo(version=_RUNNING_VERSION, commit=_RUNNING_COMMIT)


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
        flow_monitor=FlowMonitorConfig.model_validate({
            **settings.flow_monitor.model_dump(),
            "live_traffic": bool(
                settings.hzdr_spool.enabled or settings.hzdr_kafka_spool.enabled
            ),
        }),
        terminology=TerminologyConfig.model_validate(terminology.model_dump()),
    )

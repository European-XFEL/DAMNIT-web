"""HZDR-fork-only Pydantic settings.

These configuration models are specific to the HZDR integration (durable
ASAPO/Kafka spool consumers, the auto-builder trigger, SciCat registration,
MediaWiki links, the flow monitor, and the health/activity probes). They live
apart from ``shared/settings.py`` so that module's diff against upstream
DAMNIT-web stays limited to the generic settings (auth, damnit paths, metadata
provider, terminology). ``shared/settings.py`` imports the top-level classes
here to wire them onto the ``Settings`` model.

Nothing in this module imports from ``settings.py`` — the dependency is one-way
(``settings`` → ``hzdr_settings``) so there is no import cycle.
"""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, model_validator


class FlowMonitorReceiversSettings(BaseModel):
    laser_data: bool = True
    watchdog: bool = True
    mongo: bool = True


class FlowMonitorOption(BaseModel):
    """One selectable rule/topic/TKEY offered inside a producer's flow box."""

    value: str
    label: str
    description: str = ""


def _default_shotcounter_tkeys() -> list[FlowMonitorOption]:
    return [
        FlowMonitorOption(
            value="draco01", label="Draco01", description="primary shot notice TKEY"
        ),
        FlowMonitorOption(
            value="draco02", label="Draco02", description="LLI watcher fanout TKEY"
        ),
        FlowMonitorOption(
            value="draco04", label="Draco04", description="LLI watcher fanout TKEY"
        ),
        FlowMonitorOption(
            value="draco07",
            label="Draco07",
            description="PNG original attachment TKEY",
        ),
        FlowMonitorOption(
            value="draco08", label="Draco08", description="LLI watcher fanout TKEY"
        ),
    ]


def _default_watchdog_watchers() -> list[FlowMonitorOption]:
    return [
        FlowMonitorOption(
            value="png-originals",
            label="PNG originals",
            description="set1_*_original.png with Draco01/Draco07 ZMQ attachment",
        ),
        FlowMonitorOption(
            value="dummy-analysis",
            label="Dummy analysis",
            description="script parser rule for generic dummy analysis files",
        ),
        FlowMonitorOption(
            value="lli-parser",
            label="LLI parser",
            description="LLI ToolResult CSV parser with Draco02/04/08 topics",
        ),
        FlowMonitorOption(
            value="tps-quick",
            label="TPS quick",
            description="simple TPS parser for particle spectrum text output",
        ),
    ]


class ShotcounterProducerSettings(BaseModel):
    enabled: bool = True
    tkeys: list[FlowMonitorOption] = Field(default_factory=_default_shotcounter_tkeys)


class LaserDataProducerSettings(BaseModel):
    enabled: bool = True


class WatchdogProducerSettings(BaseModel):
    enabled: bool = True
    watchers: list[FlowMonitorOption] = Field(
        default_factory=_default_watchdog_watchers
    )


class MongoProducerSettings(BaseModel):
    enabled: bool = True
    updates_damnit_sqlite: bool = False


class FlowMonitorProducersSettings(BaseModel):
    """Per-producer-box settings: what each flow box offers, not its selection.

    The frontend's flow monitor renders one box per producer and lets an
    operator choose among the options listed here (e.g. which Shotcounter
    TKEYs or Watchdog watcher rules are available at all); the operator's
    current choice among them stays client-side UI state, not config.
    """

    shotcounter: ShotcounterProducerSettings = Field(
        default_factory=ShotcounterProducerSettings
    )
    laser_data: LaserDataProducerSettings = Field(
        default_factory=LaserDataProducerSettings
    )
    watchdog: WatchdogProducerSettings = Field(default_factory=WatchdogProducerSettings)
    mongo: MongoProducerSettings = Field(default_factory=MongoProducerSettings)


class FlowMonitorSettings(BaseModel):
    receivers: FlowMonitorReceiversSettings = Field(
        default_factory=FlowMonitorReceiversSettings
    )
    producers: FlowMonitorProducersSettings = Field(
        default_factory=FlowMonitorProducersSettings
    )


class HZDRSpoolSettings(BaseModel):
    """Config for the durable per-campaign ASAPO spool consumer.

    Activated by setting DW_API_HZDR_SPOOL__ENABLED=true.
    The consumer runs as a background asyncio task inside the FastAPI lifespan.

    ``broker_url`` is required when ``enabled=True``; there is no default because
    the old localhost:8765 default silently connected to the local test harness
    instead of the real broker, masking misconfiguration on production deployments.
    """

    enabled: bool = False
    broker_kind: Literal["http", "asapo"] = "http"
    broker_url: str | None = None
    campaign: str = ""
    consumer_group: str = "damnit"
    spool_dir: Path = Path("spool/asapo")
    poll_interval: float = 2.0
    batch_size: int = 10
    asapo_endpoint: str = ""
    asapo_beamtime: str = ""
    asapo_data_source: str = ""
    asapo_token: SecretStr = SecretStr("")
    asapo_stream: str = "default"
    asapo_source_path: str = "auto"
    asapo_has_filesystem: bool = False
    asapo_timeout_ms: int = 5000

    @model_validator(mode="after")
    def _require_transport_config_when_enabled(self) -> "HZDRSpoolSettings":
        if self.enabled and self.broker_kind == "http" and not self.broker_url:
            msg = (
                "DW_API_HZDR_SPOOL__BROKER_URL must be set when "
                "DW_API_HZDR_SPOOL__ENABLED=true and "
                "DW_API_HZDR_SPOOL__BROKER_KIND=http. "
                "For the local test harness use http://127.0.0.1:8765; "
                "for real ASAPO set DW_API_HZDR_SPOOL__BROKER_KIND=asapo "
                "and configure DW_API_HZDR_SPOOL__ASAPO_*."
            )
            raise ValueError(msg)
        if self.enabled and self.broker_kind == "asapo":
            missing = [
                name
                for name, value in {
                    "ASAPO_ENDPOINT": self.asapo_endpoint,
                    "ASAPO_BEAMTIME": self.asapo_beamtime,
                    "ASAPO_DATA_SOURCE": self.asapo_data_source,
                    "ASAPO_TOKEN": self.asapo_token.get_secret_value(),
                }.items()
                if not value
            ]
            if missing:
                msg = (
                    "DW_API_HZDR_SPOOL__BROKER_KIND=asapo requires "
                    + ", ".join(f"DW_API_HZDR_SPOOL__{name}" for name in missing)
                    + "."
                )
                raise ValueError(msg)
        return self


class HZDRKafkaSpoolSettings(BaseModel):
    """Config for the durable Kafka trigger spool consumer.

    Activated by setting DW_API_HZDR_KAFKA_SPOOL__ENABLED=true.  Consumes the
    DAQ File Watchdog / shotcounter ``hzdr-event-v1`` envelope from a Kafka
    consumer group (manual offset commit) and spools it next to the ASAPO
    events; runs as a background asyncio task inside the FastAPI lifespan.
    """

    enabled: bool = False
    bootstrap_servers: str = "localhost:9092"
    topics: list[str] = Field(default_factory=list)
    campaign: str = ""
    consumer_group: str = "damnit-kafka"
    spool_dir: Path = Path("spool/kafka")
    filename: str = "trigger.jsonl"
    poll_interval: float = 2.0
    poll_timeout_ms: int = 1000
    batch_size: int = 10


class HZDRBuilderSettings(BaseModel):
    """Auto-trigger the canonical NeXus/catalog builder after new spool events.

    Activated by setting DW_API_HZDR_BUILDER__ENABLED=true.  When enabled, each
    durable spool consumer (ASAPO/Kafka) signals a shared, debounced trigger that
    reruns ``hzdr-hdf5-builder.py`` as a subprocess so the single-writer PID lock
    and full isolation are preserved.  Without this (the default), ingested events
    land in the spool but the catalog is only rebuilt when the builder is run by
    hand.

    ``output_nexus`` is required when ``enabled=True``.  Event/trigger JSONL inputs
    are derived from the running consumers' spool paths, not configured here.

    **Multi-campaign mode** (readiness plan C2) replaces ``output_nexus`` with
    ``output_root``: each run builds every campaign with spool data, every
    entry of ``campaigns``, every campaign an ``unassigned`` event resolves
    to, and the ``_unassigned`` bucket, each to
    ``<output_root>/<campaign>/<campaign>.nxs`` with its LabFrog export found
    as ``<curated_root>/<campaign>/<campaign>.sqlite``. All of them share one
    catalog, ``sources_file`` or ``<output_root>/hzdr_sources.json``, which
    ``DW_API_METADATA__SOURCES_FILE`` should name so the API serves every
    campaign and its rulings reach every build. The per-campaign settings
    (``output_nexus``, ``experiment_id``, ``labfrog_*``) do not apply there and
    are refused alongside it.
    """

    enabled: bool = False
    debounce_seconds: float = 10.0
    # A LabFrog export refreshed outside the spool (a scheduled export) changes
    # the build's input without any event. Every this many seconds the trigger
    # checks the exports the builds read (``labfrog_sqlite``/``labfrog_nexus``,
    # or ``<curated_root>/*/*.sqlite``) and rebuilds when one changed. 0: off.
    labfrog_poll_seconds: float = Field(default=60.0, ge=0)
    output_nexus: Path | None = None
    # Multi-campaign mode; all three default off (single-campaign mode).
    output_root: Path | None = None
    curated_root: Path | None = None
    # Campaigns taking shots now: built before any event names them, and the
    # only exports (with those of campaigns that have spool folders) whose
    # LabFrog records may claim "unassigned" triggers. LabFrog numbers repeat
    # across campaigns, so old exports must not take part.
    campaigns: list[str] = Field(default_factory=list)
    experiment_id: str = ""
    source_key: str = "hzdr-labfrog"
    campaign_timezone: str = "UTC"
    labfrog_nexus: Path | None = None
    labfrog_sqlite: Path | None = None
    sources_file: Path | None = None
    match_tolerance_s: float = 120.0
    # False (the default since ruling A7, 2026-09-30, once the shot authority
    # made shot numbers unique): the time-based match ranks stop attaching
    # events and produce review candidates instead, and an authoritative
    # shot_number naming exactly one shot attaches on the number alone
    # (automatic shot assembly plan W6.2). With it true, a trigger numbered 1
    # with no LabFrog shot 1 was attached by nearest time to LabFrog shot 2.
    # True restores the pre-A7 ladder exactly.
    time_match_autoassign: bool = False
    # LabFrog labfrog-campaign-schedule-v1 export whose windows route
    # "unassigned" events (plan W1, decision D4).
    campaign_schedule: Path | None = None
    python_executable: str = ""
    script_path: Path | None = None
    extra_args: list[str] = Field(default_factory=list)
    # Shot containers (campaign output plan phase 3): start
    # ``hzdr-container-worker.py`` before and after each build, outside the
    # campaign lock, to write <campaign folder>/shots/<date>_<number>.nxs.
    # Off by default, so a deployment is unchanged until it opts in.
    containers_enabled: bool = False
    # Multi-campaign mode: also convert the _unassigned bucket. Off: its shots
    # are converted again once a campaign claims them.
    containers_include_unassigned: bool = False
    container_worker_script: Path | None = None
    # NeXus validation gate (campaign output plan phase 5): a Python that has
    # nexus-design-studio and pynxtools (NDS's own environment, e.g.
    # <nexus-design-studio>/.venv/bin/python). Set, the trigger runs
    # hzdr-nexus-validate.py after each build's container worker (or after the
    # build, without containers), writing <campaign folder>/.validation.json
    # and logging to .hzdr-validation.log. Empty (default): off.
    validation_python: str = ""
    validation_script: Path | None = None

    @property
    def multi_campaign(self) -> bool:
        return self.output_root is not None

    @property
    def catalog_file(self) -> Path | None:
        """The catalog the builds write (multi-campaign mode's shared one)."""
        if self.sources_file is not None or self.output_root is None:
            return self.sources_file
        return self.output_root / "hzdr_sources.json"

    @model_validator(mode="after")
    def _require_output_when_enabled(self) -> "HZDRBuilderSettings":
        if self.output_root is not None:
            single = [
                f"DW_API_HZDR_BUILDER__{name.upper()}"
                for name in (
                    "output_nexus",
                    "experiment_id",
                    "labfrog_nexus",
                    "labfrog_sqlite",
                )
                if getattr(self, name)
            ]
            if single:
                msg = (
                    "DW_API_HZDR_BUILDER__OUTPUT_ROOT builds every campaign and "
                    "derives each one's inputs; remove " + ", ".join(single) + "."
                )
                raise ValueError(msg)
        elif self.curated_root is not None or self.campaigns:
            msg = (
                "DW_API_HZDR_BUILDER__CURATED_ROOT and __CAMPAIGNS only apply "
                "with DW_API_HZDR_BUILDER__OUTPUT_ROOT."
            )
            raise ValueError(msg)
        if self.enabled and self.output_nexus is None and self.output_root is None:
            msg = (
                "DW_API_HZDR_BUILDER__OUTPUT_NEXUS (one campaign) or "
                "DW_API_HZDR_BUILDER__OUTPUT_ROOT (every campaign) must be set "
                "when DW_API_HZDR_BUILDER__ENABLED=true."
            )
            raise ValueError(msg)
        return self


class HZDRHealthSettings(BaseModel):
    """Broker/DB URLs and timeouts for the /config/health liveness probes.

    Each probe is non-blocking and times out independently; a failure sets
    reachable=false without raising an exception to the caller.
    """

    asapo_status_url: str = "http://127.0.0.1:8765/api/status"
    kafka_bootstrap: str = "localhost:9092"
    mongo_uri: str = "mongodb://localhost:27017"
    timeout: float = 2.0


class HZDRAsapoActivitySettings(BaseModel):
    """Optional config to surface real ASAPO stream activity in the flow monitor.

    The ASAPO broker query needs the optional ``asapo_consumer`` client
    (``uv sync --extra asapo`` / ``pip install 'damnit-api[asapo]'``).  When the
    client or any required field below is missing, ``GET /config/flow-activity``
    degrades gracefully: ASAPO falls back to reachability-only (still reported by
    ``GET /config/health``) and the activity block reports ``available=false``
    with a reason, never raising.

    The token is a SecretStr so it is never serialized into responses or logs.
    """

    endpoint: str = ""
    beamtime: str = ""
    data_source: str = ""
    token: SecretStr = SecretStr("")
    source_path: str = ""
    has_filesystem: bool = False
    timeout_ms: int = 3000

    @property
    def configured(self) -> bool:
        """True only when every field needed to open an ASAPO consumer is set."""
        return bool(
            self.endpoint
            and self.beamtime
            and self.data_source
            and self.token.get_secret_value()
        )


class HZDRScicatSettings(BaseModel):
    """SciCat registration of the canonical campaign NeXus file.

    Activated by DW_API_HZDR_SCICAT__ENABLED=true.  DAMNIT's builder posts the
    built NeXus file *path* + assembled scientificMetadata to the ``scicat_plugin``
    HTTP service (Flask); the SciCat URL/token live in that plugin's own env,
    never here — DAMNIT only knows the plugin's HTTP address (secrets boundary in
    CLAUDE.md).  Registration is best-effort: a failure never fails the build.

    ``endpoint`` selects the plugin route: ``from-json`` (simplest, one file) or
    ``push`` (returns a deterministic ``version_hash`` for rebuild detection).
    ``frontend_url`` is the public SciCat web UI base used only to build a
    human-clickable dataset link; leave unset to omit the link.
    """

    enabled: bool = False
    plugin_url: str = ""
    endpoint: Literal["from-json", "push", "publish"] = "from-json"
    api_key: SecretStr = SecretStr("")
    publisher: str = "damnit"
    catalogue_instrument_id: str = ""
    catalogue_proposal_id: str = ""
    catalogue_sample_id: str = ""
    preview_path: Path | None = None
    preview_caption: str = Field(
        default="Campaign overview", min_length=1, max_length=512
    )
    instrument_id: str = ""
    owner_group: str = ""
    access_groups: list[str] = Field(default_factory=list)
    dataset_type: str = "raw"
    frontend_url: str = ""
    timeout: float = 10.0

    @model_validator(mode="after")
    def _require_plugin_url_when_enabled(self) -> "HZDRScicatSettings":
        if self.enabled and not self.plugin_url:
            msg = (
                "DW_API_HZDR_SCICAT__PLUGIN_URL must be set when "
                "DW_API_HZDR_SCICAT__ENABLED=true."
            )
            raise ValueError(msg)
        if self.enabled and self.endpoint == "publish":
            if not self.api_key.get_secret_value() or not self.publisher.strip():
                msg = (
                    "Managed SciCat publishing requires API_KEY and a stable PUBLISHER."
                )
                raise ValueError(msg)
            if self.dataset_type != "raw":
                msg = (
                    "Managed campaign publishing currently supports raw datasets only."
                )
                raise ValueError(msg)
        return self


class HZDRLaserSettings(BaseModel):
    """Fixed laser-system constants for the campaign NeXus file.

    Closes the "add to source catalog" half of the standards-alignment gap
    summary (hzdr/docs/standards-alignment.md §3.10): central wavelength,
    repetition rate, polarization, and laser system name are properties of the
    *system*, not of a shot, so no producer event naturally carries them.  A
    deployment states them once here and the builder fills them into
    ``/entry/instrument/laser`` for every campaign it writes.

    Keys are the registry's bare ``metadata.laser.*`` names with the canonical
    units of the registry (CLAUDE.md "Metadata key registry"): ``wavelength``
    in nm, ``repetition_rate`` in Hz.  Producer-supplied values always win —
    this block only fills what no event carried — and every value it does fill
    is stamped ``damnit_source="config"`` in the NeXus file so a configured
    constant is never mistaken for a measured one (nexus-semantic-maps.md §2).

    Unset fields (the default) are simply not written: an unconfigured
    deployment builds exactly the file it built before.  For DRACO the values
    are ``SYSTEM=DRACO``, ``WAVELENGTH=800``, ``POLARIZATION=p``.
    """

    system: str = ""
    wavelength: float | None = Field(default=None, gt=0)
    repetition_rate: float | None = Field(default=None, ge=0)
    polarization: str = ""

    def as_metadata(self) -> dict[str, object]:
        """Configured constants as a ``metadata.laser.*`` block (bare keys).

        Raises ``ValueError`` for a polarization label outside the registry's
        string enum.  Deployment config is under local control, so a typo is
        rejected rather than written into a certified file — unlike producer
        metadata, which the envelope keeps open and ``lint_metadata_keys()``
        only warns about.  The check lives here rather than in a validator
        because ``metadata.hzdr_event`` cannot be imported while ``Settings()``
        is still being constructed (``metadata/__init__`` imports back into
        this package); by the time a builder asks for the block, it can.
        """
        self._check_polarization()
        configured: dict[str, object] = {}
        if self.system:
            configured["system"] = self.system
        if self.wavelength is not None:
            configured["wavelength"] = self.wavelength
        if self.repetition_rate is not None:
            configured["repetition_rate"] = self.repetition_rate
        if self.polarization:
            configured["polarization"] = self.polarization
        return configured

    def _check_polarization(self) -> None:
        from ..metadata.hzdr_event import LASER_POLARIZATION_VALUES

        if not self.polarization:
            return
        if self.polarization.strip().lower() in LASER_POLARIZATION_VALUES:
            return
        accepted = ", ".join(sorted(LASER_POLARIZATION_VALUES))
        msg = (
            f"DW_API_HZDR_LASER__POLARIZATION={self.polarization!r} is not an "
            f"accepted polarization label ({accepted}). Extend "
            "LASER_POLARIZATION_VALUES in metadata/hzdr_event.py if the "
            "facility really uses a new one."
        )
        raise ValueError(msg)


class HZDRWikiSettings(BaseModel):
    """MediaWiki link configuration for campaign pages.

    Set DW_API_HZDR_WIKI__BASE_URL to the root of the MediaWiki installation
    (e.g. https://athene.fz-rossendorf.de/fwk).  When unset, the wiki endpoint
    returns configured=false and no URL — safe for offline/local environments.

    Set DW_API_HZDR_WIKI__NAMESPACE (e.g. ``FWKT``) when campaign pages live in
    a MediaWiki namespace: an ``experiment_id`` without a namespace prefix then
    resolves to ``{namespace}:{experiment_id}``. Identifiers that already carry
    a namespace prefix (contain ``:``), or source metadata with an explicit
    ``wiki_page_title``, are used as full titles.

    The page URL uses the query form, with the title percent-encoded (real page
    titles contain ``%``, commas and dots — path-style concatenation breaks):
        {base_url}/index.php?title={page_title}
    and the Action API is queried at:
        {base_url}/api.php

    Optional authenticated live probes can be enabled with:
        DW_API_HZDR_WIKI__COOKIE_HEADER="wiki_session=..."
        DW_API_HZDR_WIKI__AUTHORIZATION_HEADER="Bearer ..."
    Both are SecretStr values, used only as outbound HTTP headers, and never
    serialized in API responses.
    """

    base_url: str = ""
    namespace: str = ""
    fetch_timeout: float = 5.0
    cookie_header: SecretStr = SecretStr("")
    authorization_header: SecretStr = SecretStr("")

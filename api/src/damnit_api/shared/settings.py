from pathlib import Path
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    Field,
    FilePath,
    HttpUrl,
    SecretStr,
    UrlConstraints,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

from .._mymdc.settings import MyMdCClientSettings, MyMdCMockSettings
from .const import DEFAULT_PROPOSAL


class LDAPSettings(BaseModel):
    server_url: str = ""
    bind_dn_template: str | None = None
    user_search_base: str | None = None
    user_search_filter: str = "(uid={username})"
    display_name_attribute: str = "displayName"
    email_attribute: str = "mail"
    family_name_attribute: str = "sn"
    given_name_attribute: str = "givenName"
    groups_attribute: str = "memberOf"
    timeout: int = 5
    # TLS/CA verification. Defaults are secure-by-default (validate against the
    # system trust store); ca_cert_file only needs to be set when the dept LDAP
    # server's cert chains to an internal CA that isn't already trusted system-wide.
    validate_cert: bool = True
    ca_cert_file: FilePath | None = None
    # For deployments that keep ldap:// on 389 and rely on StartTLS instead of
    # ldaps:// on 636 (see .env.production.example for the dept's 2026 migration note).
    start_tls: bool = False


# Auth modes that disable OAuth entirely and serve the local DEV_USER. Use these
# to debug before an OIDC certificate/IdP is available.
NOAUTH_MODES = frozenset({"none", "noauth", "disabled"})


class AuthSettings(BaseModel):
    mode: str = "ldap"
    client_id: str = ""
    client_secret: SecretStr = SecretStr("")
    server_metadata_url: Annotated[
        HttpUrl, UrlConstraints(allowed_schemes=["https"])
    ] = "https://localhost/.well-known/openid-configuration"  # pyright: ignore[reportAssignmentType]
    ldap: LDAPSettings = Field(default_factory=LDAPSettings)

    @property
    def is_disabled(self) -> bool:
        """True when `mode` turns auth off and the API serves the local DEV_USER."""
        return self.mode in NOAUTH_MODES

    @property
    def uses_oauth(self) -> bool:
        """True only for OAuth/OIDC backends that need server-metadata discovery."""
        return self.mode != "ldap" and not self.is_disabled


class DamnitSettings(BaseModel):
    default_proposal: str = DEFAULT_PROPOSAL
    default_path: Path | None = None
    damnit_directory_name: str = "usr/Shared/amore"
    paths_by_proposal: dict[str, Path] = Field(default_factory=dict)

    def path_for(
        self, proposal: str | None = None, path: str | Path | None = None
    ) -> Path:
        """Resolve a DAMNIT database folder from explicit path or configured key."""
        if path:
            return Path(path)

        proposal = proposal or self.default_proposal
        if proposal in self.paths_by_proposal:
            return self.paths_by_proposal[proposal]

        if self.default_path is not None:
            return self.default_path

        msg = f"No configured DAMNIT database path for {proposal!r}."
        raise RuntimeError(msg)


class MetadataSettings(BaseModel):
    provider: str = "local"
    sources_file: Path | None = None
    labfrog_curated_dir: Path | None = None
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_database: str = "damnit_web_test"
    mongo_collection: str = "hzdr_sources"
    mongo_default_source_key: str = "hzdr"
    mongo_default_source_title: str = "HZDR shots"
    mongo_default_damnit_path: Path = Path()
    mongo_shots_database: str | None = None
    mongo_shots_collection: str | None = None
    mongo_shots_source_field: str = "source_key"
    mongo_shots_number_field: str = "shot_number"
    mongo_shots_fired_at_field: str = "fired_at"


class TerminologySettings(BaseModel):
    identity_name: str = "source"
    identity_name_plural: str = "sources"
    identity_label: str = "Source"
    identity_label_plural: str = "Sources"
    collection_label: str = "HZDR sources"
    uses_proposals: bool = False
    uses_mymdc: bool = False


class DeploymentSettings(BaseModel):
    profile: str = "hzdr"
    terminology: TerminologySettings = Field(default_factory=TerminologySettings)


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


class ContextWorkspaceSettings(BaseModel):
    root: Path = Path("../.generated/context-workspaces")
    storage: str = "local"
    write_enabled: bool = True


class UvicornSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True
    factory: bool = True

    ssl_keyfile: FilePath | None = None
    ssl_certfile: FilePath | None = None

    @field_validator("factory", mode="after")
    @classmethod
    def factory_must_be_true(cls, v, values):
        """Ensure factory is true.

        Validator present as model is configured to allow extra so we want to
        ensure that factory is always true."""
        if not v:
            msg = "factory must be true"
            raise ValueError(msg)
        return v

    model_config = SettingsConfigDict(extra="allow")


class Settings(BaseSettings):
    auth: AuthSettings | None = None

    damnit_path: Path | None = None

    db_path: Path = Path(__file__).parents[3] / "dw_api.sqlite"

    damnit: DamnitSettings = DamnitSettings()

    metadata: MetadataSettings = MetadataSettings()

    debug: bool = True

    deployment: DeploymentSettings = DeploymentSettings()

    flow_monitor: FlowMonitorSettings = FlowMonitorSettings()

    hzdr_spool: HZDRSpoolSettings = Field(default_factory=HZDRSpoolSettings)

    hzdr_kafka_spool: HZDRKafkaSpoolSettings = Field(
        default_factory=HZDRKafkaSpoolSettings
    )

    hzdr_health: HZDRHealthSettings = Field(default_factory=HZDRHealthSettings)

    hzdr_asapo_activity: HZDRAsapoActivitySettings = Field(
        default_factory=HZDRAsapoActivitySettings
    )

    hzdr_wiki: HZDRWikiSettings = Field(default_factory=HZDRWikiSettings)

    context_workspace: ContextWorkspaceSettings = ContextWorkspaceSettings()

    log_level: str = "DEBUG"

    session_secret: SecretStr = SecretStr("dev-session-secret")

    uvicorn: UvicornSettings = UvicornSettings()

    @property
    def is_local(self) -> bool:
        return self.damnit_path is not None

    @model_validator(mode="after")
    def _apply_local_mode(self):
        if self.is_local:
            # Upstream/local DAMNIT behavior: if no auth config is provided,
            # stay in auth-disabled local mode.
            #
            # HZDR/local behavior: if auth config *is* provided, preserve it so
            # LDAP/debug-session routes and runtime config still work.
            if self.session_secret is None:
                self.session_secret = SecretStr("dev-secret")
        elif self.auth is None:
            msg = (
                "auth settings are required when not in local mode"
                " (set damnit_path for local development)"
            )
            raise ValueError(msg)
        elif self.session_secret is None:
            msg = (
                "session_secret is required when not in local mode"
                " (set damnit_path for local development)"
            )
            raise ValueError(msg)
        return self

    mymdc: MyMdCClientSettings = MyMdCMockSettings(
        mock_responses_file=Path(__file__).parents[3] / "tests" / "mock" / "_mymdc.json"
    )

    model_config = SettingsConfigDict(
        env_prefix="DW_API_",
        # Anchored on the `api/` directory (not cwd) so `Settings()` finds
        # api/.env regardless of where `uv run`/pytest is invoked from.
        env_file=[Path(__file__).parents[3] / ".env"],
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()  # type: ignore[assignment]

if __name__ == "__main__":
    try:
        from rich import print as pprint  # pyright: ignore[reportMissingImports]
    except ImportError:

        def pprint(*args, **kwargs):
            print(args[0].model_dump_json(indent=2))

    pprint(settings)

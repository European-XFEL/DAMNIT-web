from pathlib import Path
from typing import Annotated

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


class AuthSettings(BaseModel):
    mode: str = "ldap"
    client_id: str = ""
    client_secret: SecretStr = SecretStr("")
    server_metadata_url: Annotated[
        HttpUrl, UrlConstraints(allowed_schemes=["https"])
    ] = "https://localhost/.well-known/openid-configuration"
    ldap: LDAPSettings = Field(default_factory=LDAPSettings)


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
    watchdog: WatchdogProducerSettings = Field(
        default_factory=WatchdogProducerSettings
    )
    mongo: MongoProducerSettings = Field(default_factory=MongoProducerSettings)


class FlowMonitorSettings(BaseModel):
    receivers: FlowMonitorReceiversSettings = Field(
        default_factory=FlowMonitorReceiversSettings
    )
    producers: FlowMonitorProducersSettings = Field(
        default_factory=FlowMonitorProducersSettings
    )


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
        env_file=[".env"],
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

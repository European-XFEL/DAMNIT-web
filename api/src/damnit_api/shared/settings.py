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
    mongo_default_damnit_path: Path = Path(".")
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
    auth: AuthSettings = AuthSettings()

    db_path: Path = Path(__file__).parents[3] / "dw_api.sqlite"

    damnit: DamnitSettings = DamnitSettings()

    metadata: MetadataSettings = MetadataSettings()

    debug: bool = True

    deployment: DeploymentSettings = DeploymentSettings()

    context_workspace: ContextWorkspaceSettings = ContextWorkspaceSettings()

    log_level: str = "DEBUG"

    session_secret: SecretStr = SecretStr("dev-session-secret")

    uvicorn: UvicornSettings = UvicornSettings()

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

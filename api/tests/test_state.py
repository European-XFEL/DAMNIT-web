"""Tests for the AppState container and its DI surface (ADR-002/ADR-003)."""

import ast
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from damnit_api.auth.oauth import create_oauth_client
from damnit_api.runs.repository import DamnitRepositoryRegistry
from damnit_api.shared.models import ProposalNumber
from damnit_api.shared.settings import Settings
from damnit_api.state import create_mymdc_client


def test_appstate_only_imported_by_composition_root():
    """Handlers and dependencies must depend on specific objects, never the
    whole `AppState`; only the composition root may import it (ADR-002)."""
    src_root = Path("src/damnit_api")
    allowed = {src_root / "state.py", src_root / "main.py"}

    def imports_app_state(path: Path) -> bool:
        tree = ast.parse(path.read_text())
        return any(
            isinstance(node, ast.ImportFrom)
            and any(alias.name == "AppState" for alias in node.names)
            for node in ast.walk(tree)
        )

    offenders = [
        str(path)
        for path in src_root.rglob("*.py")
        if path not in allowed and imports_app_state(path)
    ]

    assert offenders == []


def test_create_oauth_client_returns_none_when_auth_disabled(tmp_path):
    settings = Settings(damnit_path=tmp_path)  # local mode: auth is None
    assert settings.auth is None
    assert create_oauth_client(settings) is None


def test_create_oauth_client_returns_populated_client_when_auth_set():
    # The repo's `.env` provides valid auth settings; non-local mode requires them.
    settings = Settings()
    assert settings.auth is not None
    client = create_oauth_client(settings)
    assert client is not None
    assert client.client_id == settings.auth.client_id
    assert client.scope == "openid email groups"


def test_create_mymdc_client_raises_on_unsupported_config(tmp_path):
    settings = Settings(damnit_path=tmp_path)
    # Neither MyMdCHTTPSettings nor MyMdCMockSettings.
    object.__setattr__(settings, "mymdc", MagicMock())
    with pytest.raises(ValueError, match="Invalid MyMdC configuration"):
        create_mymdc_client(settings)


def test_create_mymdc_client_builds_mock_client(tmp_path):
    settings = Settings(damnit_path=tmp_path)  # default mymdc is the mock backend
    assert create_mymdc_client(settings) is not None


def test_repository_registry_memoizes_per_proposal():
    created = []

    class DummyRepo:
        def __init__(self, proposal):
            self.proposal = proposal
            created.append(proposal)

    registry = DamnitRepositoryRegistry(DummyRepo)  # ty: ignore[invalid-argument-type]
    first = registry.get(ProposalNumber(1234))
    assert registry.get(ProposalNumber(1234)) is first
    assert registry.get(ProposalNumber(5678)) is not first
    assert created == [ProposalNumber(1234), ProposalNumber(5678)]

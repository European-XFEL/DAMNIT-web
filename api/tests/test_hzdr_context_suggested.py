"""A campaign's suggested starter columns, from its LabFrog records."""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from damnit_api.contextfile.suggested import (
    MAX_COLUMNS,
    suggested_columns,
    suggested_context,
)
from damnit_api.main import create_app
from damnit_api.shared.settings import AuthSettings, settings


def _variables(index: int) -> dict:
    """One shot's labfrog_variables, shaped as the builder writes them."""
    return {
        # varies, has a unit, decimal comma on some shots
        "ICT integrated charge": {
            "value": f"{index},5" if index % 2 else str(index),
            "unit": "nC",
            "kind": "dynamic_field",
        },
        "gvd": {"value": str(1000 * (index % 3)), "unit": "fs^2", "kind": "parameter"},
        # a varying number without a unit ranks after those with one
        "proton_energy_tps45": {"value": str(index), "kind": "dynamic_field"},
        # a varying text with few values
        "shot_group": {
            "value": "A" if index < 5 else "B",
            "kind": "dynamic_field",
        },
        # left out: constant, a diagnostic setting, shown elsewhere, too rare
        "plasma_mirror": {"value": "True", "kind": "dynamic_field"},
        "TPS 45": {"value": f"2026_04_{index:02d}", "kind": "diagnostic"},
        "laser_energy": {"value": str(index), "unit": "J", "kind": "parameter"},
        **(
            {"rare": {"value": str(index), "kind": "dynamic_field"}}
            if index == 0
            else {}
        ),
    }


def _shots(count: int = 10):
    return [
        SimpleNamespace(
            shot_number=index + 1, metadata={"labfrog_variables": _variables(index)}
        )
        for index in range(count)
    ]


def test_picks_varying_values_numbers_with_units_first():
    columns = suggested_columns(_shots())
    assert [column["title"] for column in columns] == [
        "GVD (fs^2)",
        "ICT integrated charge (nC)",
        "Proton energy TPS45",
        "Shot group",
    ]
    assert [column["type"] for column in columns] == [
        "number",
        "number",
        "number",
        "text",
    ]


def test_is_a_short_starter_not_an_inventory():
    shots = [
        SimpleNamespace(
            shot_number=index,
            metadata={
                "labfrog_variables": {
                    f"value_{n}": {"value": str(index * n), "unit": "V"}
                    for n in range(1, 20)
                }
            },
        )
        for index in range(1, 11)
    ]
    assert len(suggested_columns(shots)) == MAX_COLUMNS


def test_the_generated_file_runs_and_reads_decimal_commas(tmp_path):
    from damnit_api.contextfile import routers

    shots = _shots()
    path = tmp_path / "context.py"
    path.write_text(suggested_context("Campaign_1", shots), encoding="utf-8")
    variables = routers._load_context_variables(path, shots)
    charge = next(
        function
        for function in variables.values()
        if function._damnit_title == "ICT integrated charge (nC)"
    )
    assert routers._call_context_variable(charge, shots[1]) == pytest.approx(1.5)
    assert routers._call_context_variable(charge, shots[2]) == pytest.approx(2.0)
    missing = SimpleNamespace(shot_number=99, metadata={})
    with pytest.raises(routers.ContextSkip, match=r"^No value"):
        routers._call_context_variable(charge, missing)


def test_a_campaign_without_records_gets_an_empty_starter():
    source = suggested_context("Empty", [])
    compile(source, "context.py", "exec")
    assert "\n@Variable" not in source


@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_endpoint_returns_the_suggestion_and_new_workspaces_start_with_it(
    tmp_path, monkeypatch
):
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(
        json.dumps({
            "sources": [
                {
                    "key": "radbio",
                    "title": "radbio",
                    "damnit_path": ".",
                    "metadata": {},
                    "shots": [
                        {
                            "source_key": "radbio",
                            "shot_number": shot.shot_number,
                            "fired_at": "2026-05-05T10:00:00Z",
                            "metadata": shot.metadata,
                        }
                        for shot in _shots()
                    ],
                }
            ]
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path / "contexts")
    monkeypatch.setattr(settings.context_workspace, "write_enabled", True)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    app = create_app()

    with TestClient(app) as client:
        client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
        suggested = client.get("/contextfile/campaign/radbio/suggested")
        starter = client.get("/contextfile/campaign/radbio/me")
        results = client.get("/contextfile/campaign/radbio/me/results")

    assert suggested.status_code == 200
    assert "ICT integrated charge (nC)" in suggested.json()["fileContent"]
    assert starter.json()["fileContent"] == suggested.json()["fileContent"]
    titles = [column["title"] for column in results.json()["columns"]]
    assert "ICT integrated charge (nC)" in titles


@pytest.mark.parametrize(
    ("raw", "shown"),
    [
        ("um", "\u00b5m"),
        ("uSv", "\u00b5Sv"),
        ("\u00b5Sv", "\u00b5Sv"),
        ("\u03bcSv", "\u00b5Sv"),
        ("\u00c2\u00b5Sv", "\u00b5Sv"),
        ("\ufffdSv", "\u00b5Sv"),
        ("mV", "mV"),
        ("fs^2", "fs^2"),
        ("deg", "deg"),
    ],
)
def test_every_micro_form_reads_as_the_micro_sign(raw, shown):
    from damnit_api.contextfile.suggested import _unit

    assert _unit(raw) == shown

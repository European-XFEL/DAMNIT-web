"""Context Builder's "Help me": ranked column suggestions with reasons."""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from damnit_api.contextfile.assist import column_suggestions
from damnit_api.contextfile.suggested import suggested_columns
from damnit_api.main import create_app
from damnit_api.shared.settings import AuthSettings, settings
from tests.test_hzdr_context_suggested import _shots as _namespace_shots


def _shots() -> list[Any]:
    """Shots as the catalog would hold them (duck-typed stand-ins)."""
    return list(_namespace_shots())


def _with_metadata(shots: list[Any]) -> list[Any]:
    for index, shot in enumerate(shots):
        shot.metadata.update({
            "laser": {"pulse_duration": 30 + index, "pulse_energy": index},
            "trigger": {
                "adc_value": 0.5 * index,
                "adc_unit": "V",
                # a device counter is never offered: it is not a shot number
                "channel_trigger_count": 1000 + index,
            },
            "target": {"thickness": 100 + index, "temperature": 20 + index},
        })
    return shots


def test_starter_columns_come_first_and_are_marked():
    shots = _shots()
    suggestions = column_suggestions(shots)
    starter = [column["title"] for column in suggested_columns(shots)]
    assert [s["title"] for s in suggestions if s["starter"]] == starter
    assert [s["title"] for s in suggestions[: len(starter)]] == starter


def test_each_suggestion_says_why_and_what_it_does():
    by_title = {s["title"]: s for s in column_suggestions(_shots())}

    charge = by_title["ICT integrated charge (nC)"]
    assert charge["origin"] == "labfrog"
    assert charge["display"] == "number"
    assert (charge["count"], charge["total"]) == (10, 10)
    assert charge["reason"].startswith("Recorded on 10 of 10 shots, from 0 to 9.5 nC")
    assert charge["path"] == "meta#labfrog_variables.ICT integrated charge.value"

    group = by_title["Shot group"]
    assert group["display"] == "text"
    assert "2 labels: A (5), B (5)" in group["reason"]

    titles = set(by_title)
    assert not titles & {"Plasma mirror", "TPS 45", "Laser energy (J)", "Rare"}


def test_only_registered_metadata_and_the_trigger_adc_are_offered():
    by_id = {s["id"]: s for s in column_suggestions(_with_metadata(_shots()))}
    assert by_id["metadata:laser.pulse_duration"]["title"] == (
        "Laser pulse duration (fs)"
    )
    assert by_id["metadata:trigger.adc_value"]["unit"] == "V"
    # the registry's degC (for unit-aware tools) reads as a degree sign
    assert by_id["metadata:target.temperature"]["title"] == (
        "Target temperature (\u00b0C)"
    )
    # shown by the table's fixed columns already
    assert "metadata:laser.pulse_energy" not in by_id
    assert "metadata:target.thickness" not in by_id
    assert not any("counter" in key or "count" in key.split(".")[-1] for key in by_id)


def test_every_block_runs_on_its_own(tmp_path):
    from damnit_api.contextfile import routers

    shots = _with_metadata(_shots())
    for suggestion in column_suggestions(shots):
        path = tmp_path / f"{suggestion['function']}.py"
        path.write_text(suggestion["block"], encoding="utf-8")
        variables = routers._load_context_variables(path, shots)
        assert len(variables) == 1, suggestion["id"]
        function = next(iter(variables.values()))
        value = routers._call_context_variable(function, shots[3])
        assert value is not None, suggestion["id"]
        with pytest.raises(routers.ContextSkip):
            routers._call_context_variable(function, _missing_shot())


def _missing_shot() -> Any:
    return SimpleNamespace(shot_number=99, metadata={})


def test_a_name_with_quotes_still_compiles():
    shots: list[Any] = [
        SimpleNamespace(
            shot_number=index,
            metadata={
                "labfrog_variables": {
                    'odd """ name\\': {"value": str(index), "unit": "V"}
                }
            },
        )
        for index in range(5)
    ]
    (suggestion,) = column_suggestions(shots)
    compile(suggestion["block"], "context.py", "exec")


def test_no_records_no_suggestions():
    assert column_suggestions([]) == []


@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_endpoint_lists_the_suggestions(tmp_path, monkeypatch):
    shots = _with_metadata(_shots())
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
                        for shot in shots
                    ],
                }
            ]
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path / "contexts")
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)

    with TestClient(create_app()) as client:
        client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
        response = client.get("/contextfile/campaign/radbio/assist")
        unknown = client.get("/contextfile/campaign/nope/assist")

    assert response.status_code == 200
    ids = [s["id"] for s in response.json()["suggestions"]]
    assert "labfrog:ICT integrated charge" in ids
    assert "metadata:laser.pulse_duration" in ids
    assert unknown.json()["suggestions"] == []


#: LabFrog names a campaign really could hold, each one a past way to break a
#: generated file: keywords, builtins, the file's own globals, a dot (``meta#``
#: paths split on dots), quotes and a backslash.
AWKWARD_NAMES = (
    "class",
    "lambda",
    "str",
    "float",
    "np",
    "Skip",
    "E. field",
    'it\'s "quoted"\\',
    "ä energy",
)


def _awkward_shots(count: int = 6) -> list[Any]:
    return [
        SimpleNamespace(
            shot_number=index + 1,
            metadata={
                "labfrog_variables": {
                    name: {"value": f"{index},5", "unit": "V"} for name in AWKWARD_NAMES
                },
                "laser": {"contrast_ratio": 1e9 * (index + 1)},
                "attribution": {"delta_s": 0.1 * index},
                "acquisition": {"laserdata_counter": 100 + index},
                "diagnostic": {"xray_counts": "nan" if index == 0 else index},
            },
        )
        for index in range(count)
    ]


def test_every_suggestion_together_still_runs(tmp_path):
    """All suggestions in one file: none breaks the file or another column."""
    from damnit_api.contextfile import routers

    shots = _awkward_shots()
    suggestions = column_suggestions(shots)
    labfrog = [s for s in suggestions if s["origin"] == "labfrog"]
    assert len(labfrog) == len(AWKWARD_NAMES)
    functions = [s["function"] for s in suggestions]
    assert len(set(functions)) == len(functions)
    assert {"class_column", "lambda_column", "str_column", "float_column"} <= set(
        functions
    )
    assert "np_column" in functions
    assert "skip_column" in functions

    bodies = []
    for suggestion in suggestions:
        imports, _, body = suggestion["block"].partition("\n\n\n")
        assert imports == "from damnit_ctx import Skip, Variable"
        bodies.append(body)
    path = tmp_path / "context.py"
    path.write_text(
        "import numpy as np\nfrom damnit_ctx import Skip, Variable\n\n\n"
        + "\n\n".join(bodies),
        encoding="utf-8",
    )
    variables = routers._load_context_variables(path, shots)
    assert len(variables) == len(suggestions)
    functions_by_title: dict[str, Any] = {}
    for function in variables.values():
        annotated: Any = function
        functions_by_title[annotated._damnit_title] = function
    by_title = functions_by_title
    for suggestion in labfrog:
        value = routers._call_context_variable(by_title[suggestion["title"]], shots[2])
        assert value == pytest.approx(2.5), suggestion["id"]


def test_a_dotted_name_is_read_by_name_not_by_path():
    shots = _awkward_shots()
    (dotted,) = [s for s in column_suggestions(shots) if s["id"] == "labfrog:E. field"]
    assert "meta#labfrog_variables'" in dotted["block"]
    assert "'E. field'" in dotted["block"]
    # the browser finds it in a file by its quoted name
    assert dotted["path"] == "E. field"


def test_metadata_by_namespace_not_by_unit():
    by_id = {s["id"]: s for s in column_suggestions(_awkward_shots())}
    # dimensionless, but a number that varies: offered
    assert "metadata:laser.contrast_ratio" in by_id
    # audit and provenance namespaces: never, though numeric and varying
    assert "metadata:attribution.delta_s" not in by_id
    assert "metadata:acquisition.laserdata_counter" not in by_id
    # "nan" is not a number to show
    assert "nan" not in by_id["metadata:diagnostic.xray_counts"]["reason"]


def test_the_starter_file_runs_with_awkward_names(tmp_path):
    from damnit_api.contextfile import routers
    from damnit_api.contextfile.suggested import suggested_context

    shots = _awkward_shots()
    path = tmp_path / "context.py"
    path.write_text(suggested_context("Odd", shots), encoding="utf-8")
    variables = routers._load_context_variables(path, shots)
    assert variables
    for function in variables.values():
        assert routers._call_context_variable(function, shots[2]) == pytest.approx(2.5)

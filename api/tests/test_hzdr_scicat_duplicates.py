"""The duplicate SciCat dataset clean-up, against a fake SciCat.

It may delete only provable replicates: older registrations DAMNIT made of the
very file the catalog's dataset names. Most tests here are about what it must
keep.
"""

from __future__ import annotations

import importlib.util
import json
from datetime import UTC, datetime, timedelta
from operator import itemgetter
from pathlib import Path
from urllib.parse import unquote

import httpx
import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "hzdr-scicat-duplicates.py"
_spec = importlib.util.spec_from_file_location("hzdr_scicat_duplicates", SCRIPT)
assert _spec is not None
assert _spec.loader is not None
dupes = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dupes)

CAMPAIGN = "radbio"
NAME = "HZDR canonical campaign (radbio)"
FOLDER = "/bigdata/HPLexp/nexus/radbio"
ACCOUNT = "ingestor"
NOW = datetime(2026, 11, 11, 12, tzinfo=UTC)


def _stamp(i: int) -> str:
    """A unique, ordered creation time per index: 100 per day."""
    n = i % 100
    return f"2026-11-{1 + i // 100:02d}T00:{n // 60:02d}:{n % 60:02d}Z"


def _ds(pid: str, when: str, **over) -> dict:
    dataset = {
        "pid": pid,
        "datasetName": NAME,
        "creationTime": when,
        "isPublished": False,
        "sourceFolder": FOLDER,
        "createdBy": ACCOUNT,
        "updatedBy": ACCOUNT,
        "scientificMetadata": {"experiment_id": CAMPAIGN, "shot_count": 210},
    }
    dataset.update(over)
    return dataset


def _datasets(n: int) -> list[dict]:
    return [_ds(f"HZDR/{i:04d}", _stamp(i)) for i in range(n)]


class FakeSciCat:
    """Answers like the deployed SciCat: at most 100, oldest first, where honoured."""

    def __init__(self, datasets: list[dict], delete_status: int = 200) -> None:
        self.datasets = {d["pid"]: d for d in datasets}
        self.delete_status = delete_status
        self.deleted: list[str] = []
        self.before_delete = None  # hook: change a dataset before the deletes

    @staticmethod
    def _pid(request: httpx.Request) -> str:
        raw = request.url.raw_path.decode().split("?")[0]
        return unquote(raw.rsplit("/", 1)[-1])

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/auth/login"):
            return httpx.Response(200, json={"access_token": "tok"})
        assert request.headers["Authorization"] == "Bearer tok"
        if request.method == "GET" and path.endswith("/datasets"):
            where = json.loads(request.url.params["filter"])["where"]
            after = (where.get("creationTime") or {}).get("gt", "")
            hits = [
                d
                for d in sorted(self.datasets.values(), key=itemgetter("creationTime"))
                if d["datasetName"] == where["datasetName"]
                and d["creationTime"] > after
            ]
            return httpx.Response(200, json=hits[:100])
        pid = self._pid(request)
        if request.method == "GET":
            if self.before_delete:
                self.before_delete(self.datasets)
                self.before_delete = None
            if pid not in self.datasets:
                return httpx.Response(404)
            return httpx.Response(200, json=self.datasets[pid])
        if request.method == "DELETE":
            if self.delete_status < 400:
                self.deleted.append(pid)
                self.datasets.pop(pid, None)
            return httpx.Response(self.delete_status)
        return httpx.Response(404)

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))


def _files(tmp_path: Path, current: str) -> list[str]:
    env = tmp_path / "plugin.env"
    env.write_text(
        "# plugin\nSCICAT_URL=https://scicat.example/api/v3\n"
        "SCICAT_USERNAME=svc\nexport SCICAT_PASSWORD='secret'\n"
    )
    sources = tmp_path / "hzdr_sources.json"
    sources.write_text(
        json.dumps({
            "sources": [
                {
                    "key": CAMPAIGN,
                    "metadata": {"experiment_id": CAMPAIGN, "scicat_pid": current},
                },
                {"key": "never", "metadata": {"experiment_id": "never"}},
            ]
        })
    )
    return ["--env-file", str(env), "--sources-file", str(sources)]


# --- the plan: what counts as a replicate ------------------------------------

CURRENT = _ds("cur", "2026-11-11T10:00:00Z")


def _plan(datasets, current="cur"):
    return {
        r["pid"]: (r["action"], r["why"])
        for r in dupes.plan(datasets, current, CAMPAIGN, now=NOW)
    }


def test_an_old_registration_of_the_same_file_is_a_replicate():
    rows = _plan([_ds("old", "2026-11-01T00:00:00Z"), CURRENT])
    assert rows["old"] == ("delete", "replicate")
    assert rows["cur"] == ("keep", "current")


@pytest.mark.parametrize(
    ("change", "why"),
    [
        ({"datasetName": "HZDR canonical campaign (other)"}, "another name"),
        ({"isPublished": True}, "published"),
        ({"scientificMetadata": {}}, "its metadata does not name this campaign"),
        (
            {"scientificMetadata": {"experiment_id": "other"}},
            "its metadata does not name this campaign",
        ),
        ({"createdBy": "a.person"}, "created by another account"),
        ({"createdBy": None}, "created by another account"),
        ({"updatedBy": "a.person"}, "edited by someone since"),
        (
            {"sourceFolder": "/bigdata/other"},
            "another source folder (not DAMNIT's file)",
        ),
        ({"sourceFolder": None}, "another source folder (not DAMNIT's file)"),
        ({"creationTime": "yesterday"}, "no readable creation time"),
        (
            {"creationTime": "2026-11-11T11:00:00Z"},
            "newer than the catalog's dataset (not in DAMNIT yet)",
        ),
        ({"creationTime": "2026-11-11T09:00:00Z"}, "younger than 1 day, 0:00:00"),
    ],
)
def test_anything_not_proven_a_replicate_is_kept(change, why):
    rows = _plan([_ds("x", "2026-11-01T00:00:00Z", **change), CURRENT])
    assert rows["x"] == ("keep", why)


def test_value_unit_metadata_is_read():
    meta = {"experiment_id": {"value": CAMPAIGN, "unit": ""}}
    rows = _plan([_ds("old", "2026-11-01T00:00:00Z", scientificMetadata=meta), CURRENT])
    assert rows["old"] == ("delete", "replicate")


def test_nothing_is_deleted_without_a_trustworthy_reference():
    old = _ds("old", "2026-11-01T00:00:00Z")
    gone = _plan([old], current="missing")
    assert gone["old"][0] == "keep"
    assert "not in SciCat" in gone["old"][1]
    unmarked = {**CURRENT, "scientificMetadata": {}}
    rows = _plan([old, unmarked])
    assert {action for action, _ in rows.values()} == {"keep"}
    assert "lacks DAMNIT's marks" in rows["old"][1]


def test_min_age_is_respected():
    young = (NOW - timedelta(hours=2)).isoformat()
    rows = dupes.plan(
        [_ds("young", young), {**CURRENT, "creationTime": NOW.isoformat()}],
        "cur",
        CAMPAIGN,
        now=NOW,
        min_age=timedelta(hours=24),
    )
    assert rows[0]["action"] == "keep"


# --- the run: look first, --expect, re-check before each delete --------------


def test_look_only_pages_past_100_and_deletes_nothing(tmp_path, capsys):
    fake = FakeSciCat(_datasets(230))
    assert dupes.main(_files(tmp_path, "HZDR/0150"), client=fake.client()) == 0
    assert fake.deleted == []
    out = capsys.readouterr().out
    assert "radbio: 230 datasets, catalog's HZDR/0150" in out
    assert "79 newer than the catalog's dataset" in out
    assert "150 replicate(s) to delete" in out
    assert "--apply --expect 150" in out
    assert "secret" not in out


def test_apply_needs_the_expected_count(tmp_path, capsys):
    fake = FakeSciCat(_datasets(20))
    args = [*_files(tmp_path, "HZDR/0010"), "--apply"]
    assert dupes.main(args, client=fake.client()) == 2
    assert dupes.main([*args, "--expect", "9"], client=fake.client()) == 2
    assert fake.deleted == []
    assert "Nothing deleted" in capsys.readouterr().err


def test_apply_deletes_only_replicates(tmp_path):
    datasets = _datasets(30)
    datasets[3]["isPublished"] = True
    datasets[4]["createdBy"] = "a.person"
    datasets[5]["sourceFolder"] = "/bigdata/elsewhere"
    fake = FakeSciCat(datasets)
    report = tmp_path / "report.json"
    args = [*_files(tmp_path, "HZDR/0020"), "--apply", "--expect", "17"]
    assert dupes.main([*args, "--report", str(report)], client=fake.client()) == 0
    assert sorted(fake.deleted) == [
        f"HZDR/{i:04d}" for i in range(20) if i not in {3, 4, 5}
    ]
    rows = json.loads(report.read_text())
    assert sum(r["action"] == "delete" for r in rows) == 17


def test_a_dataset_changed_after_the_plan_is_kept(tmp_path, capsys):
    fake = FakeSciCat(_datasets(5))

    def publish_one(datasets):
        datasets["HZDR/0001"]["isPublished"] = True

    fake.before_delete = publish_one
    args = [*_files(tmp_path, "HZDR/0004"), "--apply", "--expect", "4"]
    assert dupes.main(args, client=fake.client()) == 0
    assert "HZDR/0001" not in fake.deleted
    assert sorted(fake.deleted) == ["HZDR/0000", "HZDR/0002", "HZDR/0003"]
    assert "changed since the plan (published)" in capsys.readouterr().out


def test_forbidden_delete_stops_and_reports(tmp_path, capsys):
    fake = FakeSciCat(_datasets(10), delete_status=403)
    report = tmp_path / "report.json"
    args = [*_files(tmp_path, "HZDR/0009"), "--apply", "--expect", "9"]
    assert dupes.main([*args, "--report", str(report)], client=fake.client()) == 1
    assert "may not delete" in capsys.readouterr().err
    assert report.exists()


def test_env_file_parsing(tmp_path):
    env = tmp_path / "e.env"
    env.write_text('A=1\n# c\nexport B="two words"\nbad line\nC=\n')
    assert dupes.read_env_file(env) == {"A": "1", "B": "two words", "C": ""}

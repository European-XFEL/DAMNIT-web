"""The duplicate SciCat dataset clean-up, against a fake SciCat."""

from __future__ import annotations

import importlib.util
import json
from operator import itemgetter
from pathlib import Path
from urllib.parse import unquote

import httpx

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "hzdr-scicat-duplicates.py"
_spec = importlib.util.spec_from_file_location("hzdr_scicat_duplicates", SCRIPT)
assert _spec is not None
assert _spec.loader is not None
dupes = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dupes)

NAME = "HZDR canonical campaign (radbio)"


class FakeSciCat:
    """Answers like the deployed SciCat: at most 100, oldest first, where honoured."""

    def __init__(self, datasets: list[dict], delete_status: int = 200) -> None:
        self.datasets = datasets
        self.delete_status = delete_status
        self.deleted: list[str] = []
        self.logins = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/login"):
            self.logins += 1
            return httpx.Response(200, json={"access_token": "tok"})
        assert request.headers["Authorization"] == "Bearer tok"
        if request.method == "GET":
            where = json.loads(request.url.params["filter"])["where"]
            after = (where.get("creationTime") or {}).get("gt", "")
            hits = [
                d
                for d in sorted(self.datasets, key=itemgetter("creationTime"))
                if d["datasetName"] == where["datasetName"]
                and d["creationTime"] > after
                and d["pid"] not in self.deleted
            ]
            return httpx.Response(200, json=hits[:100])
        if request.method == "DELETE":
            pid = unquote(request.url.raw_path.decode().rsplit("/", 1)[-1])
            if self.delete_status < 400:
                self.deleted.append(pid)
            return httpx.Response(self.delete_status)
        return httpx.Response(404)

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handler))


def _stamp(i: int) -> str:
    return f"2026-11-{1 + i // 100:02d}T00:{(i % 100) // 60:02d}:{i % 60:02d}Z"


def _datasets(n: int, published: set[int] = frozenset()) -> list[dict]:
    return [
        {
            "pid": f"HZDR/{i:04d}",
            "datasetName": NAME,
            "creationTime": _stamp(i),
            "isPublished": i in published,
        }
        for i in range(n)
    ] + [
        {
            "pid": "HZDR/other",
            "datasetName": "Autoingest from PC X",
            "creationTime": "2026-11-01T00:00:00Z",
        }
    ]


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
                    "key": "radbio",
                    "metadata": {"experiment_id": "radbio", "scicat_pid": current},
                },
                {"key": "never", "metadata": {"experiment_id": "never"}},
            ]
        })
    )
    return ["--env-file", str(env), "--sources-file", str(sources)]


def test_dry_run_pages_past_100_and_deletes_nothing(tmp_path, capsys):
    fake = FakeSciCat(_datasets(230))
    rc = dupes.main(_files(tmp_path, "HZDR/0150"), client=fake.client())
    assert rc == 0
    assert fake.deleted == []
    out = capsys.readouterr().out
    assert "radbio: 230 datasets; keep HZDR/0150 (current); 229 duplicate(s)" in out
    assert "secret" not in out


def test_apply_keeps_current_and_published(tmp_path):
    fake = FakeSciCat(_datasets(120, published={3}))
    report = tmp_path / "report.json"
    args = [*_files(tmp_path, "HZDR/0119"), "--apply", "--report", str(report)]
    assert dupes.main(args, client=fake.client()) == 0
    assert len(fake.deleted) == 118
    assert "HZDR/0119" not in fake.deleted
    assert "HZDR/0003" not in fake.deleted
    assert "HZDR/other" not in fake.deleted
    rows = json.loads(report.read_text())
    assert {r["why"] for r in rows if r["action"] == "keep"} == {"current", "published"}


def test_catalog_pid_missing_keeps_the_newest(tmp_path):
    fake = FakeSciCat(_datasets(5))
    args = [*_files(tmp_path, "HZDR/gone"), "--apply"]
    assert dupes.main(args, client=fake.client()) == 0
    assert sorted(fake.deleted) == [f"HZDR/{i:04d}" for i in range(4)]


def test_forbidden_delete_stops_and_reports(tmp_path, capsys):
    fake = FakeSciCat(_datasets(10), delete_status=403)
    report = tmp_path / "report.json"
    args = [*_files(tmp_path, "HZDR/0009"), "--apply", "--report", str(report)]
    assert dupes.main(args, client=fake.client()) == 1
    assert "may not delete" in capsys.readouterr().err
    assert report.exists()


def test_env_file_parsing(tmp_path):
    env = tmp_path / "e.env"
    env.write_text('A=1\n# c\nexport B="two words"\nbad line\nC=\n')
    assert dupes.read_env_file(env) == {"A": "1", "B": "two words", "C": ""}

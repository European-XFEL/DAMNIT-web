"""Create p6996 `runs.sqlite` from the raw one.

Retained data is based on what is kept in the frontend demo
(`frontend/apps/demo/public/examples/xpcs/`). The demo's `runs.json` defines the
published subset and is used as the spec here:

- only the runs shown in the demo are kept, renumbered to the demo's 1-13
- only the variables shown in the demo are kept, renamed where the demo renamed
  them (`pulses` -> `n_pulses`, `sample` -> `sample_type`)
- tags and variable-tag assignments are taken from `runs.json` (the raw database
  has none)
- `metameta` is reduced to the keys needed to read the database, dropping
  facility internals (GPFS paths, SLURM settings)
- rows belonging to any other proposal are dropped

Regenerate with:

```bash
uv run python \
  tests/mock/data/gpfs/exfel/exp/MID/202401/p006996/usr/Shared/amore/make_runs_db.py
```
"""

import json
import sqlite3
from pathlib import Path

HERE = Path(__file__).parent
RAW = Path("/gpfs/exfel/exp/MID/202401/p006996/usr/Shared/amore/runs.sqlite")
OUT = HERE / "runs.sqlite"
RUNS_JSON = (
    HERE.parents[12]
    / "frontend"
    / "apps"
    / "demo"
    / "public"
    / "examples"
    / "xpcs"
    / "runs.json"
)

PROPOSAL = 6996

# Demo variable name -> raw database variable name
RENAMED = {
    "n_pulses": "pulses",
    "sample_type": "sample",
}

METAMETA_KEEP = ("db_id", "data_format_version", "proposal")


def main():
    spec = json.loads(RUNS_JSON.read_text())
    meta = spec["meta"]

    # Demo `run` is implicit in the database - every other variable maps to a row
    demo_names = [name for name in meta["variables"] if name != "run"]
    raw_names = {name: RENAMED.get(name, name) for name in demo_names}

    # source.run_number is the real run; variables.run.value the demo number
    run_map = {
        entry["source"]["run_number"]: entry["variables"]["run"]["value"]
        for entry in spec["data"]
    }

    OUT.unlink(missing_ok=True)
    raw = sqlite3.connect(RAW)
    out = sqlite3.connect(OUT)

    for (sql,) in raw.execute(
        "SELECT sql FROM sqlite_master"
        " WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
    ):
        out.execute(sql)

    out.executemany(
        "INSERT INTO metameta VALUES (?, ?)",
        (
            row
            for row in raw.execute("SELECT key, value FROM metameta")
            if row[0] in METAMETA_KEEP
        ),
    )

    out.executemany(
        "INSERT INTO variables VALUES (?, ?, ?, ?, ?)",
        (
            (demo_name, *row)
            for demo_name, raw_name in raw_names.items()
            for row in raw.execute(
                "SELECT type, title, description, attributes"
                " FROM variables WHERE name = ?",
                (raw_name,),
            )
        ),
    )

    out.executemany(
        "INSERT INTO run_info VALUES (?, ?, ?, ?)",
        (
            (PROPOSAL, run_map[run], start_time, added_at)
            for run, start_time, added_at in raw.execute(
                f"SELECT run, start_time, added_at FROM run_info"  # noqa: S608
                f" WHERE proposal = ? AND run IN ({','.join('?' * len(run_map))})",
                (PROPOSAL, *run_map),
            )
        ),
    )

    for demo_name, raw_name in raw_names.items():
        out.executemany(
            "INSERT INTO run_variables VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                (PROPOSAL, run_map[run], demo_name, *rest)
                for run, *rest in raw.execute(
                    f"SELECT run, version, value, timestamp, max_diff, provenance,"  # noqa: S608
                    f" summary_type, summary_method, attributes FROM run_variables"
                    f" WHERE proposal = ? AND name = ?"
                    f" AND run IN ({','.join('?' * len(run_map))})",
                    (PROPOSAL, raw_name, *run_map),
                )
            ),
        )

    out.executemany(
        "INSERT INTO time_comments VALUES (?, ?)",
        raw.execute("SELECT timestamp, comment FROM time_comments"),
    )

    for tag in meta["tags"].values():
        out.execute(
            "INSERT INTO tags (id, name) VALUES (?, ?)", (tag["id"], tag["name"])
        )
        out.executemany(
            "INSERT INTO variable_tags VALUES (?, ?)",
            ((name, tag["id"]) for name in tag["variables"]),
        )

    out.commit()

    counts = {
        table: out.execute(f"SELECT count(*) FROM {table}").fetchone()[0]  # noqa: S608
        for (table,) in out.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    print(f"Created {OUT}: {counts}")


if __name__ == "__main__":
    main()

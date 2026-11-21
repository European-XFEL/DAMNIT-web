"""Build the mock proposals that the API tests serve.

Each mock proposal is a DAMNIT folder here, named for the case it holds, with a
hand-written `context.py`. DAMNIT runs that file on the mock runs that `RUNS`
lists for the case. The script then pins every time DAMNIT stamped, so a
rebuild writes the same database rows.

It writes only `runs.sqlite` and `extracted_data/` into each case: the process
logs DAMNIT also writes name the host and the build folder.

Regenerate with:

```bash
uv run --group damnit-backend api/tests/mock/proposals/build_proposals.py
```

The `damnit-backend` group adds DAMNIT's backend, which the API itself never
runs. `uv.lock` fixes every library's version, which the files record.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import h5py
from damnit.backend.db import DamnitDB, initialize_proposal

HERE = Path(__file__).parent

PROPOSAL = 999001
RUNS = {"all-value-types": (1, 2, 3, 5), "no-runs": ()}

FIRST_RUN_START = datetime(2026, 1, 1, 9, tzinfo=UTC).timestamp()
RUN_SPACING = 10 * 60  # s
COMPUTE_DELAY = 60  # s


def main():
    out = parse_args().out

    for case, runs in RUNS.items():
        with tempfile.TemporaryDirectory() as tmp:
            damnit_dir = Path(tmp) / case
            create_proposal(damnit_dir, HERE / case / "context.py")
            run_damnit(damnit_dir, "read-context")

            if runs:
                extract_runs(damnit_dir, runs)
                pin_times(damnit_dir, runs)

            write_built_files(damnit_dir, out / case, runs)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out",
        type=Path,
        default=HERE,
        help=(
            "folder to write each case's built files into, such as a temporary"
            " one to compare a rebuild with the committed files"
        ),
    )

    return parser.parse_args()


def create_proposal(damnit_dir, context_file):
    """Create the proposal, storing nothing that would differ between builds.

    DAMNIT stores the facility's python and the one it runs under, both paths on
    the build's machine, and a random `db_id`. With no python stored, DAMNIT runs
    the context file with its own.
    """
    initialize_proposal(damnit_dir, PROPOSAL, context_file_src=context_file)

    with DamnitDB.from_dir(damnit_dir) as db:
        db.metameta["context_python"] = ""
        db.metameta["damnit_python"] = ""
        db.metameta["db_id"] = "0" * 40


def run_damnit(damnit_dir, *args):
    # The stub broker keeps DAMNIT from sending updates to the facility's Kafka.
    # DAMNIT orders its views' columns by a set, so the hash seed fixes them.
    env = {**os.environ, "AMORE_BROKER": "none", "PYTHONHASHSEED": "0"}
    subprocess.run(
        [sys.executable, "-m", "damnit.cli", *args],
        cwd=damnit_dir,
        env=env,
        check=True,
    )


def extract_runs(damnit_dir, runs):
    run_numbers = [str(run) for run in runs]
    run_damnit(damnit_dir, "reprocess", "--mock", "--direct", *run_numbers)

    # DAMNIT 0.4.0 writes fragments that only the combiner adds to runs.sqlite
    run_damnit(damnit_dir, "combiner", "now", ".")


def pin_times(damnit_dir, runs):
    """Replace DAMNIT's clock times with a fixed morning, 10 minutes per run."""
    with DamnitDB.from_dir(damnit_dir) as db, db.conn:
        for run in runs:
            start = FIRST_RUN_START + (run - 1) * RUN_SPACING
            db.conn.execute(
                "UPDATE run_info SET start_time = ?, added_at = ? WHERE run = ?",
                (start, start, run),
            )
            db.conn.execute(
                "UPDATE run_variables SET timestamp = ? WHERE run = ?",
                (start + COMPUTE_DELAY, run),
            )

            with h5py.File(damnit_dir / extracted_file(run), "r+") as f:
                f[".reduced/start_time"][()] = start
                f["start_time/data"][()] = start


def write_built_files(damnit_dir, case_dir, runs):
    """Replace a case's database and extracted data, leaving its context file."""
    case_dir.mkdir(parents=True, exist_ok=True)

    # VACUUM INTO refuses a file that exists. A plain copy would keep the
    # overwritten python paths in unused space.
    database = case_dir / "runs.sqlite"
    database.unlink(missing_ok=True)
    with DamnitDB.from_dir(damnit_dir) as db:
        db.conn.execute("VACUUM INTO ?", (str(database),))

    # DAMNIT makes extracted_data/ with the first run, so a case with no runs has none
    shutil.rmtree(case_dir / "extracted_data", ignore_errors=True)
    for run in runs:
        name = extracted_file(run)
        (case_dir / name).parent.mkdir(exist_ok=True)
        shutil.copyfile(damnit_dir / name, case_dir / name)


def extracted_file(run):
    return Path("extracted_data") / f"p{PROPOSAL}_r{run}.h5"


if __name__ == "__main__":
    main()

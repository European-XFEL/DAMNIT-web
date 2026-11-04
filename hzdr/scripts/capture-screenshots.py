"""Capture the six HZDR frontend documentation views from a local fixture stack.

Run from the repository root:

    uv run python hzdr/scripts/capture-screenshots.py

The command builds two disposable campaigns in a temporary directory -
normalized `hzdr-event-v1` packages for a multi-day run and a shorter one, a
curated LabFrog snapshot per campaign, and a seeded context.py workspace - then
runs the real package emulator, API, and Vite frontend on ephemeral localhost
ports, drives each page with headless Chromium, writes a SHA-256 receipt, and
stops every child process. No broker, database, or production service is used.

The campaigns are authored here rather than expanded by the emulator so the
capture controls shot days, statuses, targets, and per-shot arrays directly.
Everything it writes lives under the temporary directory and is deleted on exit.
The values are synthetic; they are shaped like a DRACO run, but no shot in them
was ever fired.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING, Any, NamedTuple
from urllib.error import URLError
from urllib.request import urlopen

if TYPE_CHECKING:
    from playwright.sync_api import Page

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "hzdr" / "docs" / "screenshots"
RECEIPT_PATH = OUT_DIR / "capture-receipt.json"
VIEWPORT = {"width": 1920, "height": 1080}

# auth mode "none" resolves every request to damnit_api.auth.models.DEV_USER,
# whose preferred_username is the workspace slug the context routes use.
CONTEXT_USER_SLUG = "hzdr-dev"
SHOT_INTERVAL = timedelta(minutes=4)
FIRST_SHOT_TIME = timedelta(hours=9, minutes=12)


class Campaign(NamedTuple):
    """One emulated campaign: its identity, its shot days, and its noise seed."""

    experiment_id: str
    source_key: str
    # (shot date, shots fired that day).
    shot_plan: tuple[tuple[str, int], ...]
    seed: int
    base_energy: float


# Two sources, so the source picker, the home page list, and the Review matches
# catalog picker all have something to choose between. The first runs over two
# days, which is what gives the Day column and the per-day shot keys content.
CAMPAIGNS = (
    Campaign(
        experiment_id="Pilot_Screenshot_Automation_07.2026",
        source_key="hzdr-emulator",
        shot_plan=(("2026-07-01", 9), ("2026-07-02", 7)),
        seed=20260701,
        base_energy=12.1,
    ),
    Campaign(
        experiment_id="Target_Alignment_Checks_06.2026",
        source_key="hzdr-emulator-alignment",
        shot_plan=(("2026-06-24", 6),),
        seed=20260624,
        base_energy=8.4,
    ),
)
# The campaign the shot-table and context-builder captures are taken from.
PRIMARY = CAMPAIGNS[0]

TARGETS = (
    {"type": "foil", "name": "Cu foil 12 um", "thickness": 12000.0},
    {"type": "foil", "name": "Ti foil 5 um", "thickness": 5000.0},
    {"type": "wire", "name": "W wire 25 um", "diameter": 0.025},
    {"type": "gas_jet", "name": "He gas jet", "gas_pressure": 18.0},
)
# One row per shot, cycled: enough review states that the status column shows
# all three badge colours instead of a single repeated value.
STATUSES = (
    "processed",
    "processed",
    "processed",
    "needs-review",
    "processed",
    "processed",
    "revision-needed",
    "processed",
)
OPERATORS = ("a.krause", "s.mehl", "l.dorn")
WATCHDOG_HOSTS = ("draco-daq01", "draco-daq02")


class Shot(NamedTuple):
    filename: str
    path: str
    ready_kind: str
    ready_value: str
    prepare: Callable[[Page], None] | None = None


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _fixture_shots(campaign: Campaign) -> tuple[dict[str, Any], ...]:
    """Describe every fixture shot: identity, timing, and per-shot metadata."""
    rng = random.Random(campaign.seed)
    shots: list[dict[str, Any]] = []
    index = 0
    for shot_date, shot_count in campaign.shot_plan:
        day_start = datetime.fromisoformat(f"{shot_date}T00:00:00+00:00")
        for shot_of_day in range(shot_count):
            fired_at = day_start + FIRST_SHOT_TIME + SHOT_INTERVAL * shot_of_day
            # Shot numbers run continuously across both days. The real counter
            # can restart daily - that is what shot_key exists for - but a
            # continuous run keeps the documentation table unambiguous.
            shot_number = index + 1
            target = dict(TARGETS[index % len(TARGETS)])
            target["provenance"] = "labfrog"
            target["temperature"] = round(21.4 + rng.uniform(-0.4, 0.9), 2)
            energy = round(
                campaign.base_energy + index * 0.31 + rng.uniform(-0.18, 0.18), 3
            )
            shots.append({
                "index": index,
                "shot_number": shot_number,
                "shot_id": f"shot-{shot_number:06d}",
                "shot_date": shot_date,
                "day_shot_number": shot_of_day + 1,
                "fired_at": fired_at,
                "status": STATUSES[index % len(STATUSES)],
                "operator": OPERATORS[index % len(OPERATORS)],
                "target": target,
                "laser": {
                    "pulse_energy": energy,
                    "pulse_duration": round(38.0 + rng.uniform(-1.5, 2.5), 2),
                    "wavelength": 800.0,
                    "repetition_rate": 1.0,
                    "polarization": "p",
                    "beam_pos_x": round(-0.32 + index * 0.014, 4),
                    "beam_pos_y": round(0.21 - index * 0.011, 4),
                },
                "vacuum": {
                    "chamber_pressure": round(
                        2.4e-5 * (1 + index * 0.05) + rng.uniform(-1e-6, 1e-6), 9
                    )
                },
                "diagnostic": {
                    "xray_counts": int(1460 + index * 41 + rng.randint(-25, 25)),
                    "detector_signal_mean": round(
                        2.2 + index * 0.19 + rng.uniform(-0.05, 0.05), 4
                    ),
                    # A slow decline with noise, not a cycle: this is the
                    # default key in the shot-sets trend picker, so a sawtooth
                    # here is the first chart anyone sees.
                    "alignment_score": round(
                        0.93 - index * 0.007 + rng.uniform(-0.012, 0.012), 4
                    ),
                    "radiation_dose": round(41.0 + index * 6.5 + rng.uniform(-3, 3), 1),
                },
            })
            index += 1
    return tuple(shots)


def _waveform(
    shot: dict[str, Any], campaign: Campaign, samples: int = 128
) -> list[float]:
    """Synthesize one laser diagnostic trace for a shot."""
    index = int(shot["index"])
    energy = float(shot["laser"]["pulse_energy"])
    rng = random.Random(campaign.seed + index)
    trace = []
    for sample in range(samples):
        position = sample / (samples - 1)
        envelope = math.exp(-(((position - 0.42 - index * 0.004) / 0.16) ** 2))
        ripple = 0.06 * math.sin(position * math.pi * (6 + index % 5))
        trace.append(round(energy * envelope + ripple + rng.uniform(-0.015, 0.015), 5))
    return trace


def _utc(moment: datetime) -> str:
    """Render one event timestamp as the schema's UTC ISO-8601 string."""
    return moment.isoformat().replace("+00:00", "Z")


def _fixture_events(campaign: Campaign) -> tuple[dict[str, Any], ...]:
    """Build the normalized `hzdr-event-v1` packages for the whole campaign.

    Five events per shot across the three Kafka-pilot producers, so the shot
    table, the event lists, the producer-status view, and the context-builder
    dataset picker all have real content to show.
    """
    events: list[dict[str, Any]] = []
    experiment_id = campaign.experiment_id
    for shot in _fixture_shots(campaign):
        index = int(shot["index"])
        shot_id = str(shot["shot_id"])
        shot_number = int(shot["shot_number"])
        fired_at = shot["fired_at"]
        common = {
            "schema_version": "hzdr-event-v1",
            "experiment_id": experiment_id,
            "shot_id": shot_id,
            "shot_number": shot_number,
        }
        watchdog_host = WATCHDOG_HOSTS[index % len(WATCHDOG_HOSTS)]
        shot_metadata = {
            "status": shot["status"],
            "operator": shot["operator"],
            "target": shot["target"],
            "laser": shot["laser"],
            "vacuum": shot["vacuum"],
            "diagnostic": shot["diagnostic"],
        }

        events.append({
            **common,
            "event_id": f"shotcounter-{experiment_id}-{shot_id}",
            "source": "Shotcounter",
            "kind": "shot_counter_event",
            "timestamp": _utc(fired_at),
            "transport": "zmq+kafka",
            "payload_ref": {
                "topic": "hzdr.shotcounter.shots",
                "partition": 0,
                "offset": 4100 + index,
                "channel_id": "draco01",
            },
            "metadata": {
                "tkey": "draco01",
                "trigger": {"role": "main"},
                "producer": {
                    "instance_id": "shotcounter-draco01",
                    "host": "draco-tango01",
                },
            },
        })
        events.append({
            **common,
            "event_id": f"laserdata-{experiment_id}-{shot_id}-energy",
            "source": "LaserData",
            "kind": "pulse_energy_j",
            "timestamp": _utc(fired_at + timedelta(seconds=1)),
            "transport": "asapo",
            "payload_ref": {
                "endpoint": "local-fixture:8400",
                "beamtime": "asapo_docs_capture",
                "data_source": "hzdr-damnit",
                "stream": "laser",
                "message_id": 1 + index,
            },
            "values": [shot["laser"]["pulse_energy"]],
            "metadata": {**shot_metadata, "diagnostic_channel": "main beam"},
        })
        events.append({
            **common,
            "event_id": f"laserdata-{experiment_id}-{shot_id}-waveform",
            "source": "LaserData",
            "kind": "waveform",
            "timestamp": _utc(fired_at + timedelta(seconds=2)),
            "transport": "asapo",
            "payload_ref": {
                "endpoint": "local-fixture:8400",
                "beamtime": "asapo_docs_capture",
                "data_source": "hzdr-damnit",
                "stream": "default",
                "message_id": 5001 + index,
            },
            "values": _waveform(shot, campaign),
            "metadata": {"diagnostic_channel": "photodiode", "unit": "J"},
        })
        events.append({
            **common,
            "event_id": f"watchdog-{experiment_id}-{shot_id}-file",
            "source": "DAQ-File-Watchdog",
            "kind": "file_created",
            "timestamp": _utc(fired_at + timedelta(seconds=4)),
            "transport": "kafka",
            "payload_ref": {
                # payload_ref is extra="allow", and producer_status derives the
                # watchdog computer from `host` before falling back to topic.
                "host": watchdog_host,
                "topic": "planet.watchdog.events",
                "partition": 0,
                "offset": 8800 + index,
                "path": f"raw/{shot['shot_date']}/{shot_id}-camera.h5",
            },
            "metadata": {
                "watch_name": "camera_raw",
                "producer": {
                    "instance_id": f"watchdog-{watchdog_host}",
                    "host": watchdog_host,
                },
            },
        })
        events.append({
            **common,
            "event_id": f"watchdog-{experiment_id}-{shot_id}-shotsheet",
            "source": "DAQ-File-Watchdog",
            "kind": "mongodb_shotsheet",
            "timestamp": _utc(fired_at + timedelta(seconds=6)),
            "transport": "kafka",
            "payload_ref": {
                "host": watchdog_host,
                "topic": "planet.watchdog.shotsheet",
                "partition": 0,
                "offset": 9400 + index,
                "record_id": f"{shot['shot_date']}-{shot['day_shot_number']:03d}",
            },
            "metadata": {
                "watch_name": "mongodb_shotsheet",
                "comments": f"Day {shot['shot_date'][-2:]} shot "
                f"{shot['day_shot_number']}, {shot['target']['name']}",
            },
        })
    return tuple(events)


def _write_fixture_events(directory: Path, campaign: Campaign) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for index, event in enumerate(_fixture_events(campaign), start=1):
        path = directory / f"event-{index:04d}.json"
        path.write_text(
            json.dumps(event, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def _write_curated_campaign(curated_dir: Path, campaign: Campaign) -> Path:
    """Write the curated LabFrog snapshot the campaign endpoints read.

    Mirrors the `shot_summary` / `export_metadata` shape that
    labfrog-sqlite-tools exports and that `labfrog_sqlite.list_campaigns`
    reads, with one row per fixture shot so the curated reference and the
    emulated source describe the same run. The `campaign` column carries the
    same MediaWiki-derived identifier as `experiment_id`, which is what lets
    the page match a curated campaign to a source DAMNIT-web already sees.
    """
    folder = curated_dir / campaign.experiment_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{campaign.experiment_id}.sqlite"
    shots = _fixture_shots(campaign)
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE export_metadata (key TEXT, value TEXT);
            CREATE TABLE shot_summary (
                shot_id TEXT, day_shot_key TEXT, shot_number INTEGER,
                date_time TEXT, shot_date TEXT, campaign TEXT,
                target TEXT, status TEXT
            );
            """
        )
        connection.executemany(
            "INSERT INTO export_metadata (key, value) VALUES (?, ?)",
            [
                ("row_count", str(len(shots))),
                ("exported_at", f"{shots[-1]['shot_date']}T18:20:00+00:00"),
                ("database", "fwktExperiments"),
                ("collection", "shots"),
            ],
        )
        connection.executemany(
            "INSERT INTO shot_summary "
            "(shot_id, day_shot_key, shot_number, date_time, shot_date, "
            "campaign, target, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    shot["shot_id"],
                    f"{shot['shot_date']} - Shot {shot['day_shot_number']}",
                    shot["shot_number"],
                    shot["fired_at"].strftime("%Y-%m-%d %H:%M:%S"),
                    shot["shot_date"],
                    campaign.experiment_id,
                    shot["target"]["name"],
                    shot["status"],
                )
                for shot in shots
            ],
        )
        connection.commit()
    finally:
        connection.close()
    return path


CONTEXT_FILE = '''"""Documentation-capture context for the emulated HZDR campaign.

Seeded by hzdr/scripts/capture-screenshots.py so the shot table shows the
column kinds DAMNIT-web renders: image thumbnails, per-shot lineouts, a
numeric column with its campaign trend, and a plain label.
"""

import h5py
import numpy as np
from damnit_ctx import Cell, Skip, Variable

IMAGE_PREVIEW_SIZE = 24
LINEOUT_PREVIEW_SAMPLES = 48


def _read_shot_dataset(hdf5_path, shot_id, dataset):
    """Read one per-shot emulator fixture dataset, or None when absent."""
    if not hdf5_path or not shot_id:
        return None
    with h5py.File(hdf5_path, "r") as handle:
        node = handle.get(f"fixtures/by_shot/{shot_id}/{dataset}")
        return None if node is None else np.asarray(node)


@Variable(title="HZDR/Camera image")
def hzdr_camera_image(run, hdf5_path=None, shot_id=None):
    """Thumbnail the raw camera frame and summarise it by its peak value."""
    image = _read_shot_dataset(hdf5_path, shot_id, "images/camera_raw")
    if image is None:
        raise Skip("No camera frame for this shot")
    step = max(1, image.shape[0] // IMAGE_PREVIEW_SIZE)
    thumbnail = image[::step, ::step][:IMAGE_PREVIEW_SIZE, :IMAGE_PREVIEW_SIZE]
    return Cell(round(float(np.nanmax(image)), 4), preview=thumbnail.tolist())


@Variable(title="HZDR/Spectrum lineout")
def hzdr_spectrum_lineout(run, hdf5_path=None, shot_id=None):
    """Show the pulse-energy lineout as a sparkline, valued by its mean."""
    lineout = _read_shot_dataset(hdf5_path, shot_id, "lineouts/pulse_energy_j")
    if lineout is None:
        raise Skip("No lineout for this shot")
    step = max(1, lineout.shape[0] // LINEOUT_PREVIEW_SAMPLES)
    return Cell(
        round(float(np.nanmean(lineout)), 4),
        preview=lineout[::step].tolist(),
    )


@Variable(title="HZDR/X-ray counts")
def hzdr_xray_counts(run, diagnostic=None):
    """Plot the campaign trend of the per-shot x-ray counter."""
    counts = (diagnostic or {}).get("xray_counts")
    if counts is None:
        raise Skip("No diagnostic.xray_counts for this shot")
    return int(counts)


@Variable(title="HZDR/Target batch")
def hzdr_target_batch(run, target=None):
    """Label each shot with the target type and name recorded by LabFrog."""
    if not target:
        raise Skip("No target metadata for this shot")
    return f"{target.get('type', 'unknown')} / {target.get('name', 'unnamed')}"
'''


def _seed_context_workspace(workspace_root: Path, campaign: Campaign) -> Path:
    """Write the capture's context.py into the campaign/user workspace."""
    workspace = workspace_root / campaign.source_key / CONTEXT_USER_SLUG
    workspace.mkdir(parents=True, exist_ok=True)
    context_path = workspace / "context.py"
    context_path.write_text(CONTEXT_FILE, encoding="utf-8")
    return context_path


def _merge_sources_catalogs(catalogs: list[Path], combined_path: Path) -> None:
    """Join the per-campaign emulator catalogs into one file for the API.

    The emulator writes one source per run; DAMNIT-web's local provider reads a
    `{"sources": [...]}` list, so more than one emulated campaign can be served
    from a single file.
    """
    sources = []
    for catalog in catalogs:
        payload = json.loads(catalog.read_text(encoding="utf-8"))
        sources.extend(payload["sources"])
    combined_path.write_text(
        json.dumps({"sources": sources}, indent=2) + "\n",
        encoding="utf-8",
    )


def _process_options() -> dict[str, object]:
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def _start_process(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stderr=subprocess.STDOUT,
        **_process_options(),
    )


def _wait_for_url(
    url: str,
    process: subprocess.Popen[bytes],
    *,
    timeout: int = 60,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"Process exited with code {process.returncode} "
                f"before {url} became ready."
            )
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            time.sleep(0.15)
    raise TimeoutError(f"Timed out waiting for {url}.")


def _stop_process_tree(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        taskkill = shutil.which("taskkill")
        if taskkill:
            subprocess.run(
                [taskkill, "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        process.kill()
        process.wait(timeout=5)


def _frontend_environment() -> dict[str, str]:
    env = os.environ.copy()
    required_major = int((ROOT / ".nvmrc").read_text().strip())
    node = shutil.which("node")
    if node:
        version = subprocess.check_output([node, "--version"], text=True).strip()
        if int(version.lstrip("v").split(".")[0]) >= required_major:
            return env

    # Non-interactive shells (including PowerShell) may not load nvm's PATH.
    nvm_dir = Path(env.get("NVM_DIR", str(Path.home() / ".nvm")))
    candidates = []
    for binary in (nvm_dir / "versions" / "node").glob(
        f"v{required_major}.*.*/bin/node"
    ):
        parts = binary.parents[1].name.lstrip("v").split(".")
        if len(parts) == 3 and all(part.isdigit() for part in parts):
            candidates.append((tuple(map(int, parts)), binary.parent))
    if candidates:
        _, bin_dir = max(candidates)
        env["PATH"] = str(bin_dir) + os.pathsep + env.get("PATH", "")
        print(f"Using Node from {bin_dir}", flush=True)
        return env
    raise SystemExit(
        f"Node >= {required_major} is required. Activate the version in .nvmrc "
        "in your shell before running the capture."
    )


def _frontend_command(env: dict[str, str]) -> list[str]:
    pnpm = shutil.which("pnpm", path=env.get("PATH"))
    if pnpm is None:
        raise SystemExit("pnpm is required to start the HZDR frontend.")
    arguments = [
        pnpm,
        "--filter",
        "@damnit-frontend/app",
        "dev",
    ]
    if os.name != "nt":
        return arguments
    command_shell = shutil.which("cmd")
    if command_shell is None:
        raise SystemExit("cmd.exe is required to start pnpm on Windows.")
    return [command_shell, "/d", "/c", *arguments]


def _pin_fixed_chrome(page: Page) -> None:
    """Move the viewport-fixed footer and contact button to the page bottom.

    Mantine pins `AppShell.Footer` and the `Affix` contact button to the
    viewport. A full-page capture of a page taller than the viewport therefore
    paints both of them across the middle of the image, over real content.
    Anchoring them to the document instead puts them where a reader scrolling
    to the end would see them.
    """
    page.add_style_tag(
        content=(
            "body { position: relative; }"
            ".mantine-AppShell-footer, .mantine-Affix-root {"
            " position: absolute !important; top: auto !important; }"
        )
    )


def _select_camera_image_cell(page: Page) -> None:
    """Open the camera-image cell of a mid-run shot in the selected-cell panel.

    Shows what a context image column does on click - the full preview and the
    column trend - instead of the empty "click a cell" placeholder. The Shot
    detail panel below it stays folded: its HDF5 dataset list is thousands of
    rows long, and a full-page capture would be mostly that list.
    """
    column_index = _context_column_index(page, "HZDR/Camera image")
    if column_index is None:
        return
    row = page.locator("table tbody tr").nth(6)
    row.locator("td").nth(column_index).locator("button").first.click()
    page.get_by_text("Image preview").first.wait_for()


def _context_column_index(page: Page, title: str) -> int | None:
    """Find a context column's cell index by its header title."""
    headers = page.locator("table thead th")
    for index in range(headers.count()):
        if title in (headers.nth(index).inner_text() or ""):
            return index
    print(f"warning: context column {title!r} was not rendered", file=sys.stderr)
    return None


def _open_details_section(page: Page, title: str) -> None:
    """Unfold one collapsed <details> panel by its summary text."""
    summary = page.locator("summary", has_text=title).first
    if summary.count() == 0:
        print(f"warning: no details section titled {title!r}", file=sys.stderr)
        return
    if not summary.evaluate("node => node.parentElement.open"):
        summary.click()


def _prepare_context_builder(page: Page) -> None:
    """Build one image column so the page shows a real recipe, not empty slots.

    Picks the per-shot camera frame, chooses the image-preview action, and
    renders the preview, with the target/example-shot and generated-Python
    panels unfolded around it.
    """
    _open_details_section(page, "Target and example shot")
    data_picker = page.get_by_role("textbox", name="Data to use")
    data_picker.click()
    data_picker.fill("camera_raw")
    page.get_by_role("option").first.click()
    page.get_by_role("textbox", name="What should this column do?").click()
    page.get_by_role("option", name="Image with reduced preview").click()
    page.get_by_role("button", name="Preview example data").click()
    page.get_by_text("Image preview").first.wait_for()
    _open_details_section(page, "Generated variable")


def _prepare_docs(page: Page) -> None:
    """Unfold every section of the in-app docs page.

    The page is a reference: folded, the capture shows nine section titles
    and nothing a reader can use.
    """
    page.evaluate(
        "document.querySelectorAll('details').forEach(node => { node.open = true })"
    )
    page.wait_for_timeout(300)


def _prepare_review_matches(page: Page) -> None:
    """Wait for the first catalog's review lists to load.

    The page selects the first campaign catalog itself; the cards appear only
    once its review list and shots have arrived.
    """
    page.get_by_text("Ambiguous matches").first.wait_for()


def _prepare_flow_monitor(page: Page) -> None:
    """Run one emulated shot through the diagram so the traffic log is real.

    Captured last, because these buttons append and enrich events in the
    fixture stack the earlier pages were photographed against.
    """
    # The diagram animates a packet along a lane after every action, so these
    # buttons are never "stable" in Playwright's sense; click through the
    # animation and give each step time to land in the log.
    for button in (
        page.get_by_role("button", name="New shot"),
        page.get_by_role("button", name="Enrich latest").first,
        page.get_by_role("button", name="Enrich latest").last,
        page.get_by_role("button", name="Poll live"),
        page.get_by_role("button", name="Build HDF5"),
    ):
        button.click(force=True)
        page.wait_for_timeout(900)
    page.get_by_text("Build HDF5 from staged events").first.wait_for()
    # Let the last packet finish so the capture is not a half-drawn frame.
    page.wait_for_timeout(2500)


# Capture order matters: the flow monitor's demo actions mutate the fixture
# stack, so it runs after every page that photographs the unmodified campaign.
SHOTS = (
    Shot("home.png", "/home", "heading", "DAMNIT! HZDR workspace"),
    Shot(
        "shot-table.png",
        f"/source/{PRIMARY.source_key}",
        "selector",
        "table",
        _select_camera_image_cell,
    ),
    Shot(
        "context-builder.png",
        f"/source/{PRIMARY.source_key}/context-builder",
        "heading",
        "Context builder",
        _prepare_context_builder,
    ),
    # The file keeps its old name until the screenshot revamp recaptures it.
    Shot(
        "link-shot-records.png",
        "/review-matches",
        "heading",
        "Review matches",
        _prepare_review_matches,
    ),
    Shot(
        "docs.png",
        "/docs",
        "heading",
        "DAMNIT-web HZDR workflow",
        _prepare_docs,
    ),
    Shot(
        "flow-monitor.png",
        "/flow-monitor",
        "heading",
        "HZDR flow monitor",
        _prepare_flow_monitor,
    ),
)


def _write_receipt() -> None:
    receipt = {
        "schemaVersion": 1,
        "capturedAtUtc": datetime.now(UTC).isoformat(),
        "files": {
            shot.filename: hashlib.sha256(
                (OUT_DIR / shot.filename).read_bytes()
            ).hexdigest()
            for shot in SHOTS
        },
    }
    RECEIPT_PATH.write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _hide_capture_folder(page: Page, folder: Path) -> None:
    """Show the throwaway emulator folder as ``<capture folder>`` in the picture.

    Sources print their full DAMNIT folder, which here is a temporary one under
    the maintainer's user profile: their account name in a published image, and
    a random name that makes every capture differ. Runs just before the
    screenshot, because the page's own refresh would put the real text back.
    """
    page.evaluate(
        """folders => {
          const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const folder of folders) {
              node.nodeValue = node.nodeValue.replaceAll(folder, '<capture folder>')
            }
          }
          for (const field of document.querySelectorAll('input, textarea')) {
            for (const folder of folders) {
              field.value = field.value.replaceAll(folder, '<capture folder>')
            }
          }
        }""",
        [str(folder), folder.as_posix()],
    )


def capture() -> None:
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "Playwright is required. Run this command through `uv run`."
        ) from exc

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frontend_env = _frontend_environment()
    frontend_command = _frontend_command(frontend_env)
    api_process: subprocess.Popen[bytes] | None = None
    frontend_process: subprocess.Popen[bytes] | None = None

    with TemporaryDirectory(prefix="damnit-doc-capture-") as temp_dir:
        temp_root = Path(temp_dir)
        curated_dir = temp_root / "curated_files"
        workspace_root = temp_root / "context-workspaces"
        sources_file = temp_root / "hzdr_sources.json"
        catalogs = []
        for campaign in CAMPAIGNS:
            events_dir = temp_root / "events" / campaign.source_key
            emulator_dir = temp_root / "emulator" / campaign.source_key
            _write_fixture_events(events_dir, campaign)
            _write_curated_campaign(curated_dir, campaign)
            _seed_context_workspace(workspace_root, campaign)
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "api" / "scripts" / "hzdr-package-emulator.py"),
                    "--events-dir",
                    str(events_dir),
                    "--output-dir",
                    str(emulator_dir),
                    "--source-key",
                    campaign.source_key,
                    # The fixture events above already describe every shot, so
                    # the emulator packages them as written rather than
                    # expanding one event set across a run.
                    "--shot-count",
                    "1",
                ],
                cwd=ROOT / "api",
                check=True,
            )
            catalogs.append(emulator_dir / "hzdr_sources.json")
        _merge_sources_catalogs(catalogs, sources_file)

        api_port = _free_port()
        frontend_port = _free_port()
        api_url = f"http://127.0.0.1:{api_port}"
        frontend_url = f"http://127.0.0.1:{frontend_port}"
        api_env = os.environ.copy()
        api_env.update({
            "DW_API_AUTH__MODE": "none",
            "DW_API_CONTEXT_WORKSPACE__ROOT": str(workspace_root),
            "DW_API_DEBUG": "false",
            "DW_API_LOG_LEVEL": "WARNING",
            "DW_API_METADATA__LABFROG_CURATED_DIR": str(curated_dir),
            "DW_API_METADATA__PROVIDER": "local",
            "DW_API_METADATA__SOURCES_FILE": str(sources_file),
            "DW_API_UVICORN__HOST": "127.0.0.1",
            "DW_API_UVICORN__PORT": str(api_port),
            "DW_API_UVICORN__RELOAD": "false",
        })
        frontend_env.update({
            "VITE_API": api_url,
            "VITE_PORT": str(frontend_port),
        })

        try:
            api_process = _start_process(
                [sys.executable, "-m", "damnit_api.main"],
                cwd=ROOT / "api",
                env=api_env,
            )
            _wait_for_url(f"{api_url}/config/runtime", api_process)

            frontend_process = _start_process(
                frontend_command,
                cwd=ROOT / "frontend",
                env=frontend_env,
            )
            _wait_for_url(f"{frontend_url}/home", frontend_process)

            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(headless=True)
                except PlaywrightError as exc:
                    raise SystemExit(
                        "Playwright Chromium is not installed. Run "
                        "`uv run playwright install chromium` "
                        "once, then retry."
                    ) from exc
                try:
                    page = browser.new_page(viewport=VIEWPORT)
                    page.on(
                        "pageerror",
                        lambda error: print(f"Browser error: {error}", file=sys.stderr),
                    )
                    page.on(
                        "console",
                        lambda message: (
                            print(f"Browser console: {message.text}", file=sys.stderr)
                            if message.type == "error"
                            else None
                        ),
                    )
                    page.emulate_media(color_scheme="light", reduced_motion="reduce")
                    for shot in SHOTS:
                        page.goto(
                            f"{frontend_url}{shot.path}",
                            wait_until="networkidle",
                        )
                        if shot.ready_kind == "heading":
                            page.get_by_role(
                                "heading",
                                name=shot.ready_value,
                                exact=True,
                            ).wait_for()
                        else:
                            page.locator(shot.ready_value).first.wait_for()
                        if shot.prepare is not None:
                            shot.prepare(page)
                        # Unfolding a panel scrolls it into view, and a
                        # full-page capture taken while scrolled paints the
                        # sticky header and footer partway down the image.
                        page.evaluate("window.scrollTo(0, 0)")
                        _pin_fixed_chrome(page)
                        page.wait_for_timeout(250)
                        _hide_capture_folder(page, Path(temp_dir).resolve())
                        page.screenshot(
                            path=OUT_DIR / shot.filename,
                            full_page=True,
                        )
                        print(f"wrote {OUT_DIR / shot.filename}")
                finally:
                    browser.close()
            _write_receipt()
            print(f"wrote {RECEIPT_PATH}")
        finally:
            _stop_process_tree(frontend_process)
            _stop_process_tree(api_process)


def main() -> None:
    capture()


if __name__ == "__main__":
    main()

"""Which campaigns one multi-campaign builder run covers (readiness plan C2).

With ``DW_API_HZDR_BUILDER__OUTPUT_ROOT`` set, one builder run builds every
campaign that receives events, plus the ``_unassigned`` bucket, instead of the
one configured campaign. This module holds the layout rules that run follows;
``api/scripts/hzdr-hdf5-builder.py --output-root`` does the building.

Layout, all derived from a campaign's ``experiment_id``:

- its spool files: ``<spool_dir>/<campaign>/<filename>`` (``spool.py``);
- its LabFrog export: ``<curated_root>/<campaign>/<campaign>.sqlite``, the
  layout labfrog-sqlite-tools writes; a campaign without one builds from its
  events alone (trigger-only shots, plan W6.1);
- its output: ``<output_root>/<campaign>/<campaign>.nxs``, and the bucket's
  ``<output_root>/_unassigned/unassigned.nxs``;
- one shared catalog, ``<output_root>/hzdr_sources.json`` by default, where
  each build replaces only its own entry (source key = ``experiment_id``), so
  the API serves them all and its rulings sidecar is the one every build reads.

The campaigns a run builds are the configured ``campaigns`` (those taking
shots now), every campaign with a spool folder, and every campaign the
resolution chain routes an ``unassigned`` event to. The LabFrog step of that
chain reads the exports of the first two groups only, the same records in
every build of the run: LabFrog numbers repeat from campaign to campaign (an
old export holds shots 1..N too), so reading every export under the curated
root would make each authoritative number ambiguous.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..metadata.hzdr_event import UNASSIGNED_EXPERIMENT_ID
from ..metadata.hzdr_nexus import resolve_event_experiments
from .spool import UNASSIGNED_SPOOL_DIR, _campaign_slug

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence
    from pathlib import Path

logger = logging.getLogger(__name__)

CATALOG_FILENAME = "hzdr_sources.json"
UNASSIGNED_SOURCE_TITLE = "Unassigned shots (no campaign yet)"

# _campaign_slug's name for "no usable campaign": a folder of messages that
# named none, which no campaign build can claim.
_NO_CAMPAIGN_DIR = "default"


@dataclass(frozen=True)
class SpoolRoot:
    """One consumer's spool: ``<directory>/<campaign>/<filename>``."""

    directory: Path
    filename: str

    @property
    def unassigned_file(self) -> Path:
        return self.directory / UNASSIGNED_SPOOL_DIR / self.filename


@dataclass
class CampaignInputs:
    """One campaign's own spool files (the ``unassigned`` ones come on top)."""

    experiment_id: str
    events_jsonl: list[Path] = field(default_factory=list)
    trigger_jsonl: list[Path] = field(default_factory=list)


def campaign_dir_name(experiment_id: str) -> str:
    """The folder name for a campaign, as the spool consumers spell it."""
    if experiment_id == UNASSIGNED_EXPERIMENT_ID:
        return UNASSIGNED_SPOOL_DIR
    return _campaign_slug(experiment_id)


def campaign_output_nexus(output_root: Path, experiment_id: str) -> Path:
    """``<output_root>/<campaign>/<campaign>.nxs`` (the bucket: ``unassigned.nxs``)."""
    folder = campaign_dir_name(experiment_id)
    stem = (
        UNASSIGNED_EXPERIMENT_ID
        if experiment_id == UNASSIGNED_EXPERIMENT_ID
        else folder
    )
    return output_root / folder / f"{stem}.nxs"


def campaign_labfrog_export(
    curated_root: Path | None, experiment_id: str
) -> Path | None:
    """The campaign's ``<curated_root>/<campaign>/<campaign>.sqlite``, if present."""
    if curated_root is None or experiment_id == UNASSIGNED_EXPERIMENT_ID:
        return None
    name = campaign_dir_name(experiment_id)
    path = curated_root / name / f"{name}.sqlite"
    return path if path.is_file() else None


def _spool_experiment_id(path: Path, fallback: str) -> str:
    """The campaign a spool file's messages name (folder names are slugs)."""
    try:
        with path.open("r", encoding="utf-8") as handle:
            for raw in handle:
                try:
                    record = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                experiment_id = (
                    record.get("experiment_id") if isinstance(record, dict) else None
                )
                if (
                    isinstance(experiment_id, str)
                    and experiment_id.strip()
                    and experiment_id != UNASSIGNED_EXPERIMENT_ID
                ):
                    return experiment_id
    except OSError as exc:
        logger.warning("Could not read spool file %s: %s", path, exc)
    return fallback


def discover_spool_campaigns(
    events_spools: Sequence[SpoolRoot] = (),
    trigger_spools: Sequence[SpoolRoot] = (),
) -> dict[str, CampaignInputs]:
    """Every campaign with a spool folder, and its files, by ``experiment_id``."""
    found: dict[str, CampaignInputs] = {}
    for is_trigger, spools in ((False, events_spools), (True, trigger_spools)):
        for spool in spools:
            if not spool.directory.is_dir():
                continue
            for folder in sorted(spool.directory.iterdir()):
                path = folder / spool.filename
                if folder.name == UNASSIGNED_SPOOL_DIR or not path.is_file():
                    continue
                if folder.name == _NO_CAMPAIGN_DIR:
                    logger.warning(
                        "Not building %s: its messages name no campaign", path
                    )
                    continue
                experiment_id = _spool_experiment_id(path, folder.name)
                inputs = found.setdefault(experiment_id, CampaignInputs(experiment_id))
                (inputs.trigger_jsonl if is_trigger else inputs.events_jsonl).append(
                    path
                )
    return found


def unassigned_spool_files(spools: Iterable[SpoolRoot]) -> list[Path]:
    """The shared ``_unassigned`` spool files that exist so far."""
    return [
        spool.unassigned_file for spool in spools if spool.unassigned_file.is_file()
    ]


def _record_experiment_id(record: Mapping[str, Any]) -> str | None:
    metadata = record.get("metadata")
    for value in (
        record.get("experiment_id"),
        metadata.get("experiment_id") if isinstance(metadata, dict) else None,
    ):
        if isinstance(value, str) and value.strip():
            return value
    return None


def stamp_campaign(
    records: Iterable[dict[str, Any]], experiment_id: str
) -> list[dict[str, Any]]:
    """Copies of one export's LabFrog records, each naming its campaign.

    In a single-campaign build a record without its own ``experiment_id``
    belongs to the build's campaign; across campaigns it must say which.
    """
    return [
        record
        if _record_experiment_id(record)
        else {**record, "experiment_id": experiment_id}
        for record in records
    ]


def foreign_experiment_ids(
    records: Iterable[Mapping[str, Any]], experiment_id: str
) -> set[str]:
    """Campaigns other than ``experiment_id`` that an export's records name."""
    return {
        named
        for record in records
        if (named := _record_experiment_id(record)) and named != experiment_id
    }


def campaigns_for_unassigned(
    events: Iterable[dict[str, Any]],
    *,
    labfrog_shots: Iterable[dict[str, Any]],
    campaign_schedule: Iterable[Mapping[str, Any]] = (),
    experiment_rulings: Mapping[int, str] | None = None,
    campaign_timezone: str = "Europe/Berlin",
) -> set[str]:
    """The campaigns the resolution chain routes ``unassigned`` events to.

    The same ``resolve_event_experiments`` every build runs, over the same
    inputs, so a campaign is built exactly when some build would route an
    event to it.
    """
    resolved = resolve_event_experiments(
        events,
        labfrog_shots=labfrog_shots,
        labfrog_experiment_id=UNASSIGNED_EXPERIMENT_ID,
        campaign_schedule=campaign_schedule,
        experiment_rulings=experiment_rulings,
        campaign_timezone=campaign_timezone,
    )
    return {str(event["experiment_id"]) for event in resolved} - {
        UNASSIGNED_EXPERIMENT_ID
    }

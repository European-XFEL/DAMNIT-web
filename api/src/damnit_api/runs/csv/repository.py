"""CSV-backed DamnitRepository for local development and testing."""

from __future__ import annotations

import asyncio
import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from ... import get_logger
from ...shared.models import ProposalNumber
from ..models import (
    KNOWN_VARIABLES,
    MetadataSnapshot,
    RunRecord,
    TagInfo,
    VariableInfo,
    VariableValue,
)
from ..repository import DamnitRepository

logger = get_logger()


class CsvDamnitRepository(DamnitRepository):
    """CSV-backed DamnitRepository for local development and testing.

    Reads from three CSV files in *csv_dir*:

    - ``runs.csv`` — one row per run: ``run,start_time,added_at``
    - ``run_variables.csv`` — one row per variable value:
      ``run,name,value,summary_type,timestamp``
    - ``variables.csv`` (optional) — variable metadata: ``name,title,tags``
      where ``tags`` is a semicolon-separated list of tag names.

    ``get_extracted_data`` always returns ``None``; there is no binary preview
    data in the CSV format.
    """

    def __init__(self, proposal_number: ProposalNumber, csv_dir: Path | str) -> None:
        self._proposal = ProposalNumber(proposal_number)
        self._csv_dir = Path(csv_dir)

    @property
    def proposal(self) -> ProposalNumber:
        return self._proposal

    def _path(self, filename: str) -> Path:
        return self._csv_dir / filename

    def _load_run_info(self) -> dict[int, dict[str, float | None]]:
        path = self._path("runs.csv")
        if not path.exists():
            return {}
        result: dict[int, dict[str, float | None]] = {}
        with Path(path).open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    run = int(row["run"])
                    result[run] = {
                        "start_time": float(row["start_time"])
                        if row.get("start_time")
                        else None,
                        "added_at": float(row["added_at"])
                        if row.get("added_at")
                        else None,
                    }
                except (ValueError, KeyError):
                    logger.warning(
                        "Invalid row in runs.csv; skipping",
                        csv_dir=self._csv_dir,
                        row=dict(row),
                    )
        return result

    def _load_run_variables(self) -> dict[int, dict[str, VariableValue]]:
        """Load run_variables.csv, keeping only the latest value per (run, name)."""
        path = self._path("run_variables.csv")
        if not path.exists():
            return {}
        result: dict[int, dict[str, VariableValue]] = defaultdict(dict)
        with Path(path).open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    run = int(row["run"])
                    ts = float(row.get("timestamp") or 0.0)
                except (ValueError, KeyError):
                    logger.warning(
                        "Invalid row in run_variables.csv; skipping",
                        csv_dir=self._csv_dir,
                        row=dict(row),
                    )
                    continue
                name = row["name"]
                value: Any = row.get("value") or None
                summary_type = row.get("summary_type") or None
                existing = result[run].get(name)
                if existing is None or ts > existing.timestamp:
                    result[run][name] = VariableValue(
                        value=value,
                        summary_type=summary_type,
                        timestamp=ts,
                    )
        return dict(result)

    def _load_latest_run_variables(
        self, start_at: float
    ) -> dict[int, dict[str, VariableValue]]:
        """Load run_variables.csv, keeping only rows newer than start_at."""
        path = self._path("run_variables.csv")
        if not path.exists():
            return {}
        result: dict[int, dict[str, VariableValue]] = defaultdict(dict)
        with Path(path).open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    ts = float(row.get("timestamp") or 0.0)
                    if ts <= start_at:
                        continue
                    run = int(row["run"])
                except (ValueError, KeyError):
                    logger.warning(
                        "Invalid row in run_variables.csv; skipping",
                        csv_dir=self._csv_dir,
                        row=dict(row),
                    )
                    continue
                name = row["name"]
                existing = result[run].get(name)
                if existing is None or ts > existing.timestamp:
                    result[run][name] = VariableValue(
                        value=row.get("value") or None,
                        summary_type=row.get("summary_type") or None,
                        timestamp=ts,
                    )
        return dict(result)

    def _load_variables_meta(self) -> dict[str, VariableInfo]:
        """Load variables.csv; returns an empty dict if the file is absent."""
        path = self._path("variables.csv")
        if not path.exists():
            return {}
        result: dict[str, VariableInfo] = {}
        with Path(path).open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name = row["name"]
                title: str | None = row.get("title") or None
                tags_raw = row.get("tags") or ""
                tags = [t.strip() for t in tags_raw.split(";") if t.strip()]
                result[name] = VariableInfo(name=name, title=title, tags=tags)
        return result

    async def get_runs(
        self,
        *,
        limit: int,
        offset: int,
        variable_names: list[str] | None = None,
    ) -> list[RunRecord]:
        loop = asyncio.get_running_loop()
        run_vars = await loop.run_in_executor(None, self._load_run_variables)
        run_info = await loop.run_in_executor(None, self._load_run_info)

        page_run_ids = sorted(run_vars.keys())[offset : offset + limit]
        records = []
        for run in page_run_ids:
            variables = run_vars[run]
            if variable_names is not None:
                variables = {k: v for k, v in variables.items() if k in variable_names}
            info = run_info.get(run, {})
            records.append(
                RunRecord(
                    proposal=self._proposal,
                    run=run,
                    start_time=info.get("start_time"),
                    added_at=info.get("added_at"),
                    variables=variables,
                )
            )
        return records

    async def get_latest_runs(
        self,
        *,
        start_at: float | None = None,
    ) -> list[RunRecord]:
        if start_at is None:
            start_at = datetime.now().astimezone().timestamp()

        loop = asyncio.get_running_loop()
        run_vars = await loop.run_in_executor(
            None, self._load_latest_run_variables, start_at
        )
        if not run_vars:
            return []

        run_info = await loop.run_in_executor(None, self._load_run_info)
        return [
            RunRecord(
                proposal=self._proposal,
                run=run,
                start_time=run_info.get(run, {}).get("start_time"),
                added_at=run_info.get(run, {}).get("added_at"),
                variables=run_vars[run],
            )
            for run in sorted(run_vars.keys())
        ]

    async def get_metadata(self) -> MetadataSnapshot:
        loop = asyncio.get_running_loop()
        run_info = await loop.run_in_executor(None, self._load_run_info)
        db_variables = await loop.run_in_executor(None, self._load_variables_meta)

        # Known variables first; db variables take precedence (they carry titles/tags)
        variables: dict[str, VariableInfo] = {
            v.name: VariableInfo(name=v.name, title=v.title)
            for v in KNOWN_VARIABLES
        }
        variables.update(db_variables)

        # Build tags from variable metadata
        tag_to_vars: dict[str, list[str]] = defaultdict(list)
        for name, vi in db_variables.items():
            for tag in vi.tags:
                tag_to_vars[tag].append(name)

        untagged = [n for n, v in variables.items() if not v.tags]
        tags: dict[str, TagInfo] = {
            "(Untagged)": TagInfo(id=0, name="(Untagged)", variables=untagged),
        }
        for i, (tag_name, var_names) in enumerate(tag_to_vars.items(), start=1):
            tags[tag_name] = TagInfo(id=i, name=tag_name, variables=var_names)

        # Max timestamp across all run variables
        run_vars = await loop.run_in_executor(None, self._load_run_variables)
        max_ts = 0.0
        for vars_dict in run_vars.values():
            for vv in vars_dict.values():
                if vv.timestamp > max_ts:
                    max_ts = vv.timestamp

        return MetadataSnapshot(
            runs=tuple(sorted(run_info.keys())),
            variables=variables,
            tags=tags,
            timestamp=max_ts,
        )

    async def get_extracted_data(self, *, run: int, variable: str) -> Any:
        return None

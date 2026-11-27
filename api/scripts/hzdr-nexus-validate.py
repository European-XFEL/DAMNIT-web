# h5py is optional here (a Python without it exits 2 before any of it is
# used), so pyright reads every h5py attribute as possibly None.
# pyright: reportOptionalMemberAccess=false
"""NeXus validation gate for a campaign's output (campaign output phase 5).

    <nds>/.venv/bin/python api/scripts/hzdr-nexus-validate.py \\
        --master <campaign>.nxs [--master ...] | --output-root <root> \\
        [--definitions hzdr/nxdl] [--strict-subentries]

Runs inside nexus-design-studio's environment (it has pynxtools; DAMNIT does
not depend on it) and imports nothing from ``damnit_api``. For each campaign:

* **master** -- NDS's structural check; pynxtools against the application
  definition its ``/entry`` declares (``NXhzdr_target``, overlaid from
  ``--definitions``); and every root link into ``shots/`` must resolve (the
  master never names a missing container).
* **containers** (``shots/<YYYYMMDD>_<number>.nxs`` naming this campaign) --
  NDS's structural check (NX classes, a top-level NXentry), and pynxtools on
  every ``NXsubentry`` that declares a ``definition`` (the mapping rows'
  claims, ``NXoptical_spectroscopy`` for the Irr8 spectrometers).
* **other root entries** that declare a definition (NXhzdr_target v0.11's
  ``/pump_probe`` laser pump-probe record) -- pynxtools against that
  definition, like ``/entry``; every finding gates. Where pynxtools raises on
  a per-event enumerated string array (``ENUM_ARRAY_CRASH``), the gate checks
  those values itself and has pynxtools check the rest on a copy.

Exit 0: passed. Exit 1 (the gate): a structural error in the master or a
container, the master's entry not valid against its definition, a dangling
container link, or a subentry finding outside ``KNOWN_SUBENTRY_GAPS``.
Warnings are counted, never gating. A subentry whose only findings are the
known gaps is reported as *not certified* and gates only with
``--strict-subentries``: the concepts it lacks are mapping decisions
(shot-aligner ``config/mappings``), not something a converter may invent.
Exit 2: the gate could not run (no nexus-design-studio or pynxtools in this
Python, a missing ``--output-root`` or definitions directory, a ``--master``
that is not there); it writes a report saying so, so an older passing one is
not read as current. A failing campaign still makes it exit 1.

Writes ``<campaign folder>/.validation.json`` (atomically) and prints one line
per campaign. ``--json`` prints the whole report as well.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib
import json
import logging
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET  # noqa: S405 -- our own NXDL files
from datetime import UTC, datetime
from pathlib import Path

try:
    import h5py
except ImportError:  # the wrong Python: say the gate could not run (exit 2)
    h5py = None

REPORT_NAME = ".validation.json"
CONTAINER_FILE = re.compile(r"^(?:\d{8}|unknown)_\d{6,}\.nxs$")
DEFAULT_DEFINITIONS = Path(__file__).resolve().parents[2] / "hzdr" / "nxdl"
CANNOT_RUN = 2

# What every Irr8 NXoptical_spectroscopy subentry lacks today, in shot-aligner's
# own build as in DAMNIT's (container-writer.md section 9): mapping decisions
# for a person. Keyed by the definition the subentry declares, so a gap known
# for one definition is still a new finding under another. Any other subentry
# finding is new, and gates.
KNOWN_SUBENTRY_GAPS: dict[str, tuple[re.Pattern[str], ...]] = {
    "NXoptical_spectroscopy": tuple(
        re.compile(pattern)
        for pattern in (
            r"required group \S+/instrument/beam_TYPE hasn't been supplied",
            r"required group \S+/instrument/detector_TYPE hasn't been supplied",
            r"required attribute \S+/definition/@URL hasn't been supplied",
            r"required attribute \S+/definition/@version hasn't been supplied",
            r"required field \S+/experiment_type hasn't been supplied",
            r"/number_of_cycles should be one of the following Python types: .*NX_INT",
        )
    ),
}

# pynxtools' is_valid_enum_hdf compares a whole 1-D string array with an
# enumeration and raises, which ends its check of the entry there. NXhzdr_target
# v0.11's /pump_probe entry has such arrays (events/status, one value per shot).
# A pynxtools bug, not the file's: the gate checks those arrays' values against
# the NXDL enumeration itself and has pynxtools check the rest of the entry on a
# copy without them (Validator.recheck_without_enum_arrays). Never lets a
# finding through: anything else still gates.
ENUM_ARRAY_CRASH = re.compile(
    r"pynxtools raised while validating /\S+ against '\w+': The truth "
    r"value of an array with more than one element is ambiguous"
)
NXDL_NS = "{http://definition.nexusformat.org/nxdl/3.1}"


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


@contextlib.contextmanager
def _quiet_pynxtools(*handlers: logging.Handler):
    """pynxtools' logger with only ``handlers``, not its own stderr echo.

    pynxtools prints every finding to stderr itself, and the trigger's log
    takes stderr as well as this script's report of the same findings, so
    each one appeared twice. NDS adds and removes its own capture handler
    inside ``run_pynxtools_validation``, which still works in here.
    """
    logger = logging.getLogger("pynxtools")
    saved = (logger.handlers[:], logger.propagate)
    logger.handlers[:] = list(handlers)
    logger.propagate = False
    try:
        yield
    finally:
        logger.handlers[:], logger.propagate = saved


@contextlib.contextmanager
def _captured():
    capture = _Capture()
    with _quiet_pynxtools(capture):
        yield capture.messages


def _text(value) -> str:
    return value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)


def _sorted_findings(messages: list[str]) -> dict:
    """pynxtools' messages, de-duplicated and grouped."""
    unique = list(dict.fromkeys(messages))
    required = [m for m in unique if "required" in m and "hasn't been supplied" in m]
    undocumented = [m for m in unique if "has no documentation" in m]
    other = [m for m in unique if m not in required and m not in undocumented]
    return {
        "required_missing": required,
        "undocumented": len(undocumented),
        "other": other,
    }


def _unexpected(findings: dict, definition: str) -> list[str]:
    gaps = KNOWN_SUBENTRY_GAPS.get(definition, ())
    return [
        message
        for message in (*findings["required_missing"], *findings["other"])
        if not any(gap.search(message) for gap in gaps)
    ]


def _nds_helper(nds, name: str):
    """NDS's public helper, or the private one it wraps in older NDS.

    ``assemble_definitions_tree`` and ``load_pynxtools_validator`` are public
    since NDS's ``feat/public-validation-helpers``; before that only their
    ``_``-prefixed forms existed. ``test_hzdr_nexus_validate`` breaks if
    neither is there.
    """
    return getattr(nds, name, None) or getattr(nds, f"_{name}")


class Validator:
    """NDS's checks and pynxtools, set up once for every file of a run."""

    def __init__(self, definitions: Path | None) -> None:
        # NDS's environment, not DAMNIT's: this script runs in NDS's Python, so
        # the import is by name (DAMNIT's type check cannot resolve it).
        nds = importlib.import_module("nexus_design_studio.core.validator")

        self._nds = nds
        self._definitions = definitions
        self._tmp = None
        self.extra = frozenset()
        if definitions is not None:
            names = [p.name for p in definitions.glob("*.nxdl.xml")]
            if not names:
                msg = f"no *.nxdl.xml in {definitions}"
                raise FileNotFoundError(msg)
            if "pynxtools" in sys.modules:  # pragma: no cover - fresh process only
                msg = "pynxtools imported before its definitions path was set"
                raise RuntimeError(msg)
            self._tmp = tempfile.TemporaryDirectory(prefix="hzdr-nxdl-")
            _nds_helper(nds, "assemble_definitions_tree")(
                definitions, Path(self._tmp.name)
            )
            os.environ["NEXUS_DEF_PATH"] = self._tmp.name
            self.extra = frozenset(n.removesuffix(".nxdl.xml") for n in names)
        self._against = _nds_helper(nds, "load_pynxtools_validator")()

    def structural(self, path: Path) -> dict:
        report = self._nds.validate_nexus_file(path, extra_definitions=self.extra)
        return {
            "ok": report.ok,
            "errors": [f"{i.path}: {i.message}" for i in report.errors],
            "warnings": [f"{i.path}: {i.message}" for i in report.warnings],
        }

    def master(self, path: Path) -> dict:
        result = self.structural(path)
        with _quiet_pynxtools():  # NDS captures the findings itself
            pynx = self._nds.run_pynxtools_validation(path)
        result["entries"] = [e.model_dump() for e in pynx.entries]
        result["pynxtools_note"] = pynx.note
        result["findings"] = _sorted_findings(pynx.findings)
        if not pynx.entries:
            result["errors"].append(
                "no root entry declares a definition to validate against "
                f"({pynx.note or 'pynxtools checked nothing'})"
            )
        result["rechecked"] = {}
        for entry in pynx.entries:
            if entry.valid:
                continue
            own = [
                message
                for message in (
                    *result["findings"]["required_missing"],
                    *result["findings"]["other"],
                )
                if f"/{entry.entry}" in message
            ]
            # pynxtools stopped at a per-event enumerated array (ENUM_ARRAY_CRASH)
            # and checked nothing after it: check the entry again without them.
            if own and all(ENUM_ARRAY_CRASH.search(m) for m in own):
                findings, fields = self.recheck_without_enum_arrays(
                    path, entry.entry, entry.definition
                )
                result["rechecked"][entry.entry] = {
                    "definition": entry.definition,
                    "enum_arrays_checked_by_gate": fields,
                    "findings": findings,
                }
                if not findings:
                    entry_report = next(
                        e for e in result["entries"] if e["entry"] == entry.entry
                    )
                    entry_report["valid"] = True
                    continue
                result["errors"] += [f"/{entry.entry}: {m}" for m in findings]
            result["errors"].append(
                f"/{entry.entry} is not valid against {entry.definition}"
            )
        result["errors"] += _dangling_links(path)
        return result

    def recheck_without_enum_arrays(
        self, path: Path, entry: str, definition: str
    ) -> tuple[list[str], list[str]]:
        """Findings for ``/<entry>`` with its enumerated string arrays checked here.

        On a temporary copy, every 1-D string array under the entry whose NXDL
        field has an enumeration is checked against it value by value and then
        removed; pynxtools checks the rest, and its "required ... hasn't been
        supplied" for exactly those removed fields is dropped. Returns the
        findings and the fields checked here.
        """
        enumerations = _nxdl_enumerations(self._definitions, definition)
        findings: list[str] = []
        removed: list[str] = []
        with tempfile.TemporaryDirectory(prefix="hzdr-recheck-") as tmp:
            copy = Path(tmp) / path.name
            copy.write_bytes(path.read_bytes())
            with h5py.File(copy, "r+") as handle:
                arrays = []
                root = handle[entry]
                if not isinstance(root, h5py.Group):
                    return [f"/{entry} is not a group"], []
                root.visititems(
                    lambda _name, node: (
                        arrays.append(node)
                        if isinstance(node, h5py.Dataset)
                        and node.ndim == 1
                        and node.shape[0] > 1
                        and node.dtype.kind in {"O", "S", "U"}
                        else None
                    )
                )
                for dataset in arrays:
                    parent = dataset.parent
                    keys = (
                        parent.name.rsplit("/", 1)[-1],
                        _text(parent.attrs.get("NX_class", "")),
                    )
                    field = dataset.name.rsplit("/", 1)[-1]
                    allowed = next(
                        (
                            enumerations[key, field]
                            for key in keys
                            if (key, field) in enumerations
                        ),
                        None,
                    )
                    if allowed is None:
                        continue
                    values = [_text(v) for v in dataset[...]]
                    findings += [
                        f"The value {value!r} at {dataset.name} should be one of "
                        f"the following: {sorted(allowed)}."
                        for value in dict.fromkeys(values)
                        if value not in allowed
                    ]
                    removed.append(dataset.name)
                    del handle[dataset.name]
            with _captured() as messages, h5py.File(copy, "r") as handle:
                try:
                    self._against(definition, handle[entry], str(copy), False)
                except Exception as error:
                    messages.append(f"pynxtools raised: {error}")
            skipped = {
                f"The required field {name} hasn't been supplied." for name in removed
            }
            findings += [
                m
                for m in dict.fromkeys(messages)
                if m not in skipped and "has no documentation" not in m
            ]
        return findings, removed

    def container(self, path: Path) -> dict:
        result = self.structural(path)
        result["subentries"] = {}
        with h5py.File(path, "r") as handle:
            entry = handle.get("entry")
            for name, group in entry.items() if isinstance(entry, h5py.Group) else ():
                if not isinstance(group, h5py.Group):
                    continue
                if _text(group.attrs.get("NX_class", "")) != "NXsubentry":
                    continue
                definition = group.get("definition")
                if not isinstance(definition, h5py.Dataset):
                    continue
                nxdl = _text(definition[()])
                with _captured() as messages:
                    try:
                        valid = bool(self._against(nxdl, group, str(path), False))
                    except Exception as error:
                        messages.append(f"pynxtools raised: {error}")
                        valid = False
                findings = _sorted_findings(messages)
                unexpected = _unexpected(findings, nxdl)
                result["subentries"][name] = {
                    "definition": nxdl,
                    "valid": valid,
                    "findings": findings,
                    "unexpected": unexpected,
                }
                result["errors"] += [f"/entry/{name}: {m}" for m in unexpected]
        return result


def _nxdl_enumerations(
    definitions: Path | None, name: str
) -> dict[tuple[str, str], frozenset[str]]:
    """(group name or class, field name) -> enumeration, along ``extends``.

    Read from the ``*.nxdl.xml`` files in ``definitions``; a definition that
    extends another overrides its enumerations.
    """
    if definitions is None:
        return {}
    roots = {}
    for nxdl in definitions.glob("*.nxdl.xml"):
        root = ET.parse(nxdl).getroot()  # noqa: S314 -- our own NXDL files
        roots[root.get("name")] = root
    chain = []
    while name in roots and name not in chain:
        chain.append(name)
        name = roots[name].get("extends")
    enumerations: dict[tuple[str, str], frozenset[str]] = {}
    for definition in reversed(chain):
        for group in roots[definition].iter(f"{NXDL_NS}group"):
            key = group.get("name") or group.get("type") or ""
            for field in group.findall(f"{NXDL_NS}field"):
                items = field.findall(f"{NXDL_NS}enumeration/{NXDL_NS}item")
                if items:
                    enumerations[key, field.get("name") or ""] = frozenset(
                        item.get("value") or "" for item in items
                    )
    return enumerations


def _dangling_links(master: Path) -> list[str]:
    """Root links into ``shots/`` whose container or ``/entry`` is not there."""
    problems = []
    with h5py.File(master, "r") as handle:
        for name in handle:
            link = handle.get(name, getlink=True)
            if not isinstance(link, h5py.ExternalLink):
                continue
            if not link.filename.startswith("shots/"):
                continue
            target = master.parent / link.filename
            try:
                with h5py.File(target, "r") as container:
                    if link.path not in container:
                        problems.append(f"/{name}: {link.filename} has no {link.path}")
            except OSError as error:
                problems.append(f"/{name}: {link.filename} cannot be opened ({error})")
    return problems


def _campaign_of(path: Path) -> str | None:
    with h5py.File(path, "r") as handle:
        key = handle.attrs.get("shot_key")
    key = _text(key) if key is not None else ""
    return key.rsplit(":", 2)[0] if key.count(":") >= 2 else None


def _write_json_atomic(path: Path, payload: dict) -> None:
    temp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        with temp.open("w", encoding="utf-8") as stream:
            stream.write(json.dumps(payload, indent=2, sort_keys=True))
            stream.flush()
            os.fsync(stream.fileno())
        temp.replace(path)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def _experiment_id(master: Path) -> str:
    with h5py.File(master, "r") as handle:
        value = handle.attrs.get("experiment_id")
    return _text(value) if value is not None else master.stem


def validate_campaign(validator: Validator, master: Path, *, strict: bool) -> dict:
    master = master.resolve()
    report = {"master": master.name, "ran": True, "result": validator.master(master)}
    campaign = _experiment_id(master)
    containers = {}
    shots = master.parent / "shots"
    for path in sorted(shots.iterdir()) if shots.is_dir() else ():
        if not CONTAINER_FILE.match(path.name):
            continue
        try:
            if _campaign_of(path) not in {campaign, None}:
                continue  # another master's container in a shared folder
            containers[path.name] = validator.container(path)
        except Exception as error:
            containers[path.name] = {
                "ok": False,
                "errors": [f"could not be checked: {type(error).__name__}: {error}"],
                "warnings": [],
                "subentries": {},
            }
    report["containers"] = containers
    report["summary"] = _summary(report, strict=strict)
    report["validated_at"] = datetime.now(UTC).isoformat()
    return report


def _summary(report: dict, *, strict: bool) -> dict:
    master = report["result"]
    containers = report["containers"].values()
    subentries = [s for c in containers for s in c["subentries"].values()]
    container_errors = sum(len(c["errors"]) for c in containers)
    uncertified = sum(not s["valid"] for s in subentries)
    passed = not master["errors"] and not container_errors
    if strict:
        passed = passed and not uncertified
    return {
        "passed": passed,
        "master_errors": len(master["errors"]),
        "master_warnings": len(master["warnings"])
        + len(master["findings"]["required_missing"])
        + len(master["findings"]["other"]),
        "containers": len(report["containers"]),
        "container_errors": container_errors,
        "container_warnings": sum(len(c["warnings"]) for c in containers),
        "subentries": len(subentries),
        "subentries_certified": len(subentries) - uncertified,
        "entries_rechecked": len(master.get("rechecked", {})),
        "strict_subentries": strict,
    }


def _line(report: dict) -> str:
    s = report["summary"]
    return (
        f"Validation ({report['master']}): {'passed' if s['passed'] else 'FAILED'}; "
        f"master {s['master_errors']} error(s), {s['master_warnings']} warning(s); "
        f"{s['containers']} container(s), {s['container_errors']} error(s), "
        f"{s['container_warnings']} warning(s); subentries "
        f"{s['subentries_certified']}/{s['subentries']} certified"
        + (
            f"; {s['entries_rechecked']} entr(y/ies) rechecked without "
            "pynxtools' enum arrays"
            if s.get("entries_rechecked")
            else ""
        )
    )


def _print(report: dict) -> None:
    print(_line(report))
    result = report["result"]
    for error in result["errors"][:20]:
        print(f"  master: {error}")
    if result["errors"]:  # what pynxtools said, so the log explains it
        findings = result["findings"]
        for finding in (*findings["required_missing"], *findings["other"])[:20]:
            print(f"    {finding}")
    for name, container in report["containers"].items():
        for error in container["errors"][:5]:
            print(f"  {name}: {error}")


def _masters(args) -> list[Path]:
    if args.master:
        return args.master
    root = args.output_root
    if not root.is_dir():
        msg = f"--output-root {root} is not a folder"
        raise FileNotFoundError(msg)
    return sorted(
        folder / f"{folder.name}.nxs"
        for folder in root.iterdir()
        if folder.is_dir() and (folder / f"{folder.name}.nxs").is_file()
    )


def _write_not_run(master: Path, reason: str) -> None:
    """A report saying the gate did not run, over one that could linger."""
    _write_json_atomic(
        master.resolve().parent / REPORT_NAME,
        {
            "master": master.name,
            "ran": False,
            "reason": reason,
            "summary": {"passed": None},
            "validated_at": datetime.now(UTC).isoformat(),
        },
    )


def _not_run(masters: list[Path], reason: str, *, write: bool) -> int:
    """Say the gate did not run, where a passing report could otherwise linger."""
    print(f"Validation could not run: {reason}", file=sys.stderr)
    for master in masters:
        if write and master.is_file():
            _write_not_run(master, reason)
    return CANNOT_RUN


def _published(masters: list[Path], *, write: bool) -> tuple[list[Path], list[Path]]:
    """Split the masters into those published and those that are not there.

    Only a ``--master`` can be missing (``--output-root`` lists published
    ones). It is not a pass: the gate could not run for it (exit 2, unless
    another campaign failed), and an older report in its folder must not read
    as this run's. Checked before NDS loads, so it holds without NDS too.
    """
    missing = [master for master in masters if not master.is_file()]
    for master in missing:
        reason = f"no published master at {master}"
        print(f"Validation ({master.name}): could not run; {reason}")
        if write and master.parent.is_dir():
            _write_not_run(master, reason)
    return [master for master in masters if master.is_file()], missing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    where = parser.add_mutually_exclusive_group(required=True)
    where.add_argument("--master", action="append", type=Path)
    where.add_argument("--output-root", type=Path)
    parser.add_argument(
        "--definitions",
        type=Path,
        default=DEFAULT_DEFINITIONS,
        help="NXDL overlay (default: this repository's hzdr/nxdl)",
    )
    parser.add_argument(
        "--strict-subentries",
        action="store_true",
        help="also fail when a definition subentry is not certified",
    )
    parser.add_argument("--json", action="store_true", help="print the full report")
    parser.add_argument(
        "--no-write", action="store_true", help=f"do not write {REPORT_NAME}"
    )
    args = parser.parse_args(argv)

    if h5py is None:
        return _not_run([], "h5py is not installed in this Python", write=False)
    try:
        masters = _masters(args)
    except FileNotFoundError as error:
        return _not_run([], str(error), write=False)
    masters, missing = _published(masters, write=not args.no_write)
    if missing and not masters:
        return CANNOT_RUN
    try:
        validator = Validator(args.definitions)
    except (ImportError, AttributeError, FileNotFoundError, RuntimeError) as error:
        reason = (
            f"{type(error).__name__}: {error} -- run it with a Python that has "
            "nexus-design-studio and pynxtools"
        )
        return _not_run(masters, reason, write=not args.no_write)

    failed = False
    reports = []
    for master in masters:
        try:
            report = validate_campaign(validator, master, strict=args.strict_subentries)
        except Exception as error:
            print(f"Validation ({master.name}): FAILED; could not be checked: {error}")
            failed = True
            continue
        reports.append(report)
        if not args.no_write:
            _write_json_atomic(master.resolve().parent / REPORT_NAME, report)
        _print(report)
        failed = failed or not report["summary"]["passed"]
    if args.json:
        print(json.dumps(reports, indent=2, sort_keys=True))
    if failed:
        return 1
    return CANNOT_RUN if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())

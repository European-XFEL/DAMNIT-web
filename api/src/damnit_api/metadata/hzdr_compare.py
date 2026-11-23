"""Compare two shot containers node by node (campaign output plan, phase 6).

Phase 6 builds one real campaign both ways, DAMNIT's containers and
shot-aligner's, and compares them: the diff must be empty apart from the
documented differences. This is that comparison, for two files.

`walk` is the reference fixture's manifest walk with values: every link name,
aliases grouped with the lexicographically first name as canonical, `NX_class`,
shape, dtype, units, the plot attributes and every other attribute, the value
of a dataset of at most `small` elements and a sha256 of a larger one. The
tests hold DAMNIT's packs and containers to shot-aligner's references with the
same walk.

`compare` walks both files and sorts every node into *same*, *ignored* (with
the documented reason) or *different*. Nothing is ignored silently: each rule
in `IGNORED` names why the two builds are allowed to differ there.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import h5py
import numpy as np

if TYPE_CHECKING:
    from pathlib import Path

# Recorded by the walk itself; every other attribute goes under `attrs`.
WALKED = ("NX_class", "units", "signal", "axes", "default", "nds_definition")


def text(value):
    """An attribute or string as JSON: a string, a list of strings, or None."""
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode()
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        return [text(v) for v in value]
    return str(value)


def _attribute(value):
    if isinstance(value, bytes):
        return value.decode()
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        return [_attribute(v) for v in value]
    return value


def _value(dataset, small: int):
    if dataset.size > small:
        return None
    if dataset.dtype.kind in "SOU":
        data = dataset.asstr()[()]
        return data.tolist() if hasattr(data, "tolist") else data
    data = dataset[()]
    if isinstance(data, np.ndarray):
        return data.tolist()
    return data.item() if hasattr(data, "item") else data


def _digest(dataset, small: int):
    if dataset.size <= small or dataset.dtype.kind in "SOU":
        return None
    data = np.ascontiguousarray(dataset[()])
    little = data.astype(data.dtype.newbyteorder("<"))
    return hashlib.sha256(little.tobytes()).hexdigest()


def _link_node(link) -> dict | None:
    """A soft or external link, recorded by its target and not followed."""
    if isinstance(link, h5py.SoftLink):
        return {"type": "softlink", "link": link.path}
    if isinstance(link, h5py.ExternalLink):
        return {"type": "externallink", "link": f"{link.filename}:{link.path}"}
    return None


def _node(obj, parent, name: str, small: int) -> tuple[dict, bool]:
    """One object's entry, and whether its value is volatile."""
    is_group = isinstance(obj, h5py.Group)
    entry = {
        "type": "group" if is_group else "dataset",
        "NX_class": text(obj.attrs.get("NX_class")),
    }
    if not is_group:
        entry["shape"] = list(obj.shape)
        entry["dtype"] = "string" if obj.dtype.kind in "SOU" else obj.dtype.str
        entry["units"] = text(obj.attrs.get("units"))
    entry |= {
        attr: text(obj.attrs[attr])
        for attr in ("signal", "axes", "default", "nds_definition")
        if attr in obj.attrs
    }
    extra = {
        key: _attribute(obj.attrs[key])
        for key in sorted(obj.attrs)
        if key not in WALKED
    }
    if extra:
        entry["attrs"] = extra
    if is_group:
        return entry, False
    if name == "date" and text(parent.attrs.get("NX_class")) == "NXnote":
        return entry, True
    measured = {"value": _value(obj, small), "sha256": _digest(obj, small)}
    entry |= {key: value for key, value in measured.items() if value is not None}
    return entry, False


def walk(path: Path, small: int = 64) -> tuple[dict, list[str]]:
    """shot-aligner's manifest walk plus values, over any HDF5 file.

    The same rules as its `make_reference_fixture.manifest` and
    `make_pack_references`: every link name, aliases grouped with the
    lexicographically first as canonical, `attrs` for the rest, `value` for
    datasets of at most `small` elements, `sha256` above that, and an NXnote's
    `date` listed as volatile.
    """
    nodes: dict[str, dict] = {}
    objects: dict = {}
    volatile: list[str] = []

    def visit(group, prefix: str, ancestors: tuple) -> None:
        for name in sorted(group):
            here = f"{prefix}/{name}"
            linked = _link_node(group.get(name, getlink=True))
            if linked is not None:
                nodes[here] = linked
                continue
            obj = group[name]
            nodes[here], is_volatile = _node(obj, group, name, small)
            if is_volatile:
                volatile.append(here)
            objects.setdefault(obj.id, []).append(here)
            if isinstance(obj, h5py.Group) and obj.id not in ancestors:
                visit(obj, here, (*ancestors, obj.id))

    with h5py.File(path, "r") as handle:
        visit(handle, "", (handle.id,))
    for paths in objects.values():
        canonical = min(paths)
        for name in paths:
            if name != canonical:
                nodes[name]["link"] = canonical
    return dict(sorted(nodes.items())), volatile


def _under(*prefixes: str):
    return lambda path: any(path == p or path.startswith(p + "/") for p in prefixes)


def _ends(*suffixes: str):
    return lambda path: any(path.endswith(s) for s in suffixes)


# Where the two builds may differ, each with the reason (the reference
# fixture's NOT_CONTRACT and the container writer's own nodes, plus the
# differences HANDOFF-2026-10-05 lists for phase 6). Anything else differing
# is reported.
IGNORED = (
    (
        _under(
            "/entry/alignment",
            "/entry/build_provenance",
            "/entry/program_name",
            "/entry/user",
        ),
        (
            "shot-aligner's alignment evidence and build provenance; the live "
            "flow keeps attribution in the master's /entry/source_events"
        ),
    ),
    (
        _under(
            "/entry/shot_info", "/entry/shot_parameters", "/entry/shotsheet_provenance"
        ),
        "the workbook row; DAMNIT takes the shot's record from LabFrog",
    ),
    (
        _under(
            "/entry/title", "/entry/entry_identifier", "/entry/collection_identifier"
        ),
        "each builder's own naming of the shot",
    ),
    (
        _under("/entry/experiment_description", "/entry/experiment_documentation"),
        "the beamtime's description and link, not the converter's",
    ),
    (
        _under("/entry/data"),
        "the entry-level plot: decision 6 keeps only each detector's default",
    ),
    (
        _under(
            "/entry/experiment_identifier",
            "/entry/conversion_problems",
            "/entry/mapping_problems",
            "/entry/labfrog_shot",
        ),
        "DAMNIT's own: the campaign, its problem notes and the LabFrog record",
    ),
    (
        _ends("/file_metadata/sha256"),
        "DAMNIT records the members' sha256 the producer sent",
    ),
    (
        _ends(
            "/file_metadata/file_creation_date",
            "/file_creation_date",
            "/file_metadata/time_source",
        ),
        (
            "documented: DAMNIT dates a file from its event (acquisition.time), "
            "shot-aligner from its own clock fit"
        ),
    ),
)

# Compared after normalising, not ignored: the same fact written differently.
TIME_PATHS = ("/entry/start_time",)  # one instant, within the tolerance


def _basename(value):
    return (
        value.replace("\\", "/").rsplit("/", 1)[-1] if isinstance(value, str) else value
    )


def _normalise(path: str, node: dict) -> dict:
    node = dict(node)
    attrs = dict(node.get("attrs") or {})
    if path == "/entry":
        # DAMNIT names the shot on its entry; the entry's default names the
        # entry-level plot shot-aligner keeps (decision 6).
        attrs.pop("experiment_id", None)
        attrs.pop("shot_key", None)
        attrs.pop("shot_number", None)
        node.pop("default", None)
    if path.endswith("/file_metadata/file_path"):
        # The recorded /bigdata path against the folder it was built from.
        node["value"] = _basename(node.get("value"))
    if path.endswith("/file_metadata/recorded_offset_removed") or path in TIME_PATHS:
        attrs.pop("description", None)  # each builder explains its own clock
    if attrs:
        node["attrs"] = attrs
    else:
        node.pop("attrs", None)
    return node


#: A ``start_time`` written without a UTC offset is the campaign's wall clock:
#: shot-aligner wrote it so before it added the offset (2026), and its
#: Vanlife 12-03 containers on fwkt-webapps still read 15:21:38 for DAMNIT's
#: 14:21:38+00:00, so no pair formed.
CAMPAIGN_TIMEZONE = "Europe/Berlin"


def instant(value, zone: str = CAMPAIGN_TIMEZONE):
    """``value`` as a zone-aware datetime, a bare one read in ``zone``; else None."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    try:
        when = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return when if when.tzinfo is not None else when.replace(tzinfo=ZoneInfo(zone))


@dataclass
class Comparison:
    """Every node of either file, sorted into what agrees and what does not."""

    same: list[str] = field(default_factory=list)
    ignored: dict[str, str] = field(default_factory=dict)  # path -> reason
    only_damnit: list[str] = field(default_factory=list)
    only_aligner: list[str] = field(default_factory=list)
    different: dict[str, dict] = field(default_factory=dict)  # path -> {key: (d, a)}

    @property
    def equal(self) -> bool:
        return not (self.only_damnit or self.only_aligner or self.different)


def compare(
    damnit: Path,
    aligner: Path,
    *,
    ignored=IGNORED,
    tolerance: float = 2.0,
    zone: str = CAMPAIGN_TIMEZONE,
) -> Comparison:
    """DAMNIT's container against shot-aligner's, node by node.

    ``tolerance`` (seconds) is how far apart the two ``start_time`` instants
    may be: DAMNIT writes the trigger's ``fired_at``, shot-aligner the anchor
    diagnostic's clock after its offset fit.
    """
    ours, ours_volatile = walk(damnit)
    theirs, theirs_volatile = walk(aligner)
    volatile = set(ours_volatile) | set(theirs_volatile)
    result = Comparison()
    for path in sorted(ours.keys() | theirs.keys()):
        reason = next(
            (why for rule, why in ignored if rule(path)),
            "an NXnote's date" if path in volatile else None,
        )
        if reason is not None:
            result.ignored[path] = reason
            continue
        if path not in theirs:
            result.only_damnit.append(path)
            continue
        if path not in ours:
            result.only_aligner.append(path)
            continue
        a, b = _normalise(path, ours[path]), _normalise(path, theirs[path])
        if path in TIME_PATHS:
            when_a = instant(a.get("value"), zone)
            when_b = instant(b.get("value"), zone)
            if (
                when_a
                and when_b
                and abs((when_a - when_b).total_seconds()) <= tolerance
            ):
                a, b = {**a, "value": None}, {**b, "value": None}
        keys = sorted(a.keys() | b.keys())
        delta = {k: (a.get(k), b.get(k)) for k in keys if a.get(k) != b.get(k)}
        if delta:
            result.different[path] = delta
        else:
            result.same.append(path)
    return result

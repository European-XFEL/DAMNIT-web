"""A campaign's suggested context.py, built from what its LabFrog records hold.

Every shot from a LabFrog export carries ``metadata.labfrog_variables``:
``{variable_name: {"value", "unit", "kind"}}``. A variable becomes a suggested
column when enough of the campaign's shots record it and its value varies; the
column reads it through a ``meta#labfrog_variables.<name>.value`` argument, so
names with spaces work. Numbers accept a decimal comma ("99,4"), as typed in
LabFrog. Diagnostic on/off settings, constant flags and bookkeeping fields are
left out, and so are the values the shot table already shows (energy, target).
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

    from ..metadata.hzdr_sources import HZDRShot

#: Shown by fixed table columns already, or bookkeeping rather than data.
EXCLUDED = frozenset({
    "laser_energy",
    "target",
    "target_name",
    "target_source",
    "target_material",
    "target_thickness",
    "target_thickness_value",
    "target_thickness_unit",
    "target_notes",
    "beamtime_id",
    "date_time_timezone",
    "date_time_utc",
    "include_diag_details",
    "material",
    "thickness",
    "notes",
    "Shot",
})
#: Kinds that are setup choices per diagnostic (a calibration date or OFF).
EXCLUDED_KINDS = frozenset({"diagnostic"})
#: A text column is only useful while it has few distinct values.
MAX_TEXT_VALUES = 25
#: The share of a variable's values that must parse for it to be a number.
NUMERIC_SHARE = 0.9
#: A starter, not an inventory: the most-recorded few, numbers with units first.
MAX_COLUMNS = 6


@dataclass
class _Seen:
    kind: str = ""
    count: int = 0
    values: Counter = field(default_factory=Counter)
    units: Counter = field(default_factory=Counter)


def as_number(value: object) -> float | None:
    """A LabFrog value as a number, or None (accepts a decimal comma)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip().replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


MICRO = "\u00b5"
#: Ways the micro sign reaches an export: Greek mu, UTF-8 read as Latin-1,
#: a character lost in a conversion.
_MICRO_FORMS = ("\u03bc", "\u00c2\u00b5", "\ufffd")
#: Units typed with a plain "u" for micro.
_U_MICRO = re.compile(r"^u(?=(m|s|Sv|Gy|A|J|V|W|C|l|L|g)$)")


def _unit(unit: str) -> str:
    """One spelling per unit for titles: every micro form becomes the micro sign."""
    text = unit.strip()
    for form in _MICRO_FORMS:
        text = text.replace(form, MICRO)
    return _U_MICRO.sub(MICRO, text)


def _python_name(name: str, taken: set[str]) -> str:
    base = re.sub(r"[^0-9a-zA-Z]+", "_", name).strip("_").lower() or "value"
    if base[0].isdigit():
        base = f"v_{base}"
    candidate, index = base, 2
    while candidate in taken:
        candidate, index = f"{base}_{index}", index + 1
    taken.add(candidate)
    return candidate


#: Short laser and diagnostic names LabFrog writes in lower case.
ACRONYMS = frozenset({
    "gvd",
    "tod",
    "tfo",
    "tro",
    "tw",
    "tps",
    "tof",
    "ict",
    "mcp",
    "pm",
    "ff",
    "nf",
})


def _pretty(name: str) -> str:
    """``proton_energy_tps45`` -> ``Proton energy TPS45``; ``gvd`` -> ``GVD``."""
    words = []
    for word in name.replace("_", " ").split():
        letters = re.match(r"[a-z]+", word)
        if letters and letters.group(0) in ACRONYMS and word.islower():
            word = word.upper()
        words.append(word)
    text = " ".join(words)
    return text[:1].upper() + text[1:]


def _title(name: str, unit: str) -> str:
    title = _pretty(name)
    if not unit or f"({unit})" in name or f"[{unit}]" in name:
        return title
    return f"{title} ({unit})"


def _collect(shots: Iterable[HZDRShot]) -> tuple[dict[str, _Seen], int]:
    """What each LabFrog variable holds across the shots, and the shot count."""
    seen: dict[str, _Seen] = {}
    total = 0
    for shot in shots:
        total += 1
        variables = (shot.metadata or {}).get("labfrog_variables") or {}
        if not isinstance(variables, dict):
            continue
        for name, entry in variables.items():
            if not isinstance(entry, dict) or entry.get("value") in (None, ""):
                continue
            record = seen.setdefault(str(name), _Seen())
            record.kind = str(entry.get("kind") or record.kind)
            record.count += 1
            record.values[str(entry["value"]).strip()] += 1
            if entry.get("unit"):
                record.units[_unit(str(entry["unit"]))] += 1

    return seen, total


def suggested_columns(shots: Iterable[HZDRShot]) -> list[dict[str, str]]:
    """The LabFrog variables worth a column: name, title, python name, type."""
    seen, total = _collect(shots)
    minimum = max(3, round(total * 0.1))
    numeric, text = [], []
    for name, record in seen.items():
        if (
            name in EXCLUDED
            or record.kind in EXCLUDED_KINDS
            or record.count < minimum
            or len(record.values) < 2
        ):
            continue
        parsed = sum(
            count
            for value, count in record.values.items()
            if as_number(value) is not None
        )
        unit = record.units.most_common(1)[0][0] if record.units else ""
        if parsed >= NUMERIC_SHARE * record.count:
            numeric.append((
                0 if unit else 1,
                -record.count,
                name.lower(),
                name,
                unit,
                "number",
            ))
        elif len(record.values) <= MAX_TEXT_VALUES:
            text.append((2, -record.count, name.lower(), name, unit, "text"))

    taken: set[str] = set()
    columns = []
    for *_, name, unit, kind in sorted(numeric + text)[:MAX_COLUMNS]:
        columns.append({
            "name": name,
            "title": _title(name, unit),
            "function": _python_name(name, taken),
            "type": kind,
        })
    return columns


_HELPERS = '''

def _number(value):
    """A LabFrog value as a number; a decimal comma is accepted."""
    if value in (None, ""):
        raise Skip("No value recorded for this shot")
    try:
        return float(str(value).strip().replace(",", "."))
    except ValueError:
        raise Skip(f"Not a number: {value!r}") from None


def _text(value):
    if value in (None, ""):
        raise Skip("No value recorded for this shot")
    return str(value)
'''


def suggested_context(campaign: str, shots: Iterable[HZDRShot]) -> str:
    """A context.py with one column per suggested LabFrog variable."""
    columns = suggested_columns(shots)
    lines = [
        f'"""Suggested columns for {campaign}, from its LabFrog records.',
        "",
        "Each @Variable is one column of the shot table. These read values",
        "the campaign's shots record in LabFrog; delete what you do not need,",
        "or add your own below (a shot without the value shows Missing).",
        '"""',
        "",
        "from damnit_ctx import Skip, Variable",
        _HELPERS.rstrip("\n"),
    ]
    if not columns:
        lines += [
            "",
            "",
            "# This campaign's records hold no value that varies from shot to",
            "# shot yet; add your own @Variable here.",
        ]
    for column in columns:
        path = f"meta#labfrog_variables.{column['name']}.value"
        reader = "_number" if column["type"] == "number" else "_text"
        lines += [
            "",
            "",
            f"@Variable(title={column['title']!r})",
            f"def {column['function']}(run, value: {path!r} = None):",
            f"    return {reader}(value)",
        ]
    return "\n".join(lines) + "\n"

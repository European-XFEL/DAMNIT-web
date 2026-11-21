"""Context Builder's "Help me": ranked column suggestions with their reasons.

Where ``suggested.py`` writes a whole starter context.py, this lists every
column worth offering, one at a time, so a person can add or ignore each. Each
suggestion says what the data is, why it was picked (how many shots record it,
what it holds), what the column will do with it, and carries a ready
``@Variable`` block. Blocks are self-contained (no shared helpers), so adding
one works on any existing context.py.

Two kinds of data are offered:

- LabFrog variables (``metadata.labfrog_variables``), ranked and filtered
  exactly as the starter is; the starter's few are marked ``starter``.
- Registered metadata keys (``METADATA_KEY_REGISTRY``, with their canonical
  unit) and the trigger's ADC value. Nothing else from shot metadata: the rest
  is bookkeeping, and device counters are not shot numbers.

HDF5 datasets depend on the example shot and are suggested by the frontend.
"""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any

from ..metadata.hzdr_event import METADATA_KEY_REGISTRY
from .suggested import (
    EXCLUDED,
    EXCLUDED_KINDS,
    MAX_TEXT_VALUES,
    NUMERIC_SHARE,
    _collect,
    _columns_from,
    _pretty,
    _python_name,
    _title,
    _unit,
    as_number,
    labfrog_argument,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    from ..metadata.hzdr_sources import HZDRShot

#: More than the starter, still a list a person reads through.
MAX_SUGGESTIONS = 24
#: Registered keys the shot table already shows as fixed columns.
EXCLUDED_METADATA = frozenset({"laser.pulse_energy", "target.thickness"})
#: Registered namespaces that describe a record (audit, attribution, who sent
#: it), not the shot: never a column suggestion, numbers or not.
EXCLUDED_NAMESPACES = frozenset({
    "acquisition",
    "attribution",
    "instrument",
    "producer",
    "run",
})
#: Unregistered numbers that are measurements, with where their unit is.
EXTRA_METADATA_UNITS = {"trigger.adc_value": "trigger.adc_unit"}

#: Registry spellings chosen for unit-aware tools, as people read them.
READABLE_UNITS = {"degC": "\u00b0C"}

_IMPORTS = "from damnit_ctx import Skip, Variable"


def _get(metadata: Any, path: str) -> Any:
    value = metadata
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _format(number: float) -> str:
    return f"{number:.4g}"


def _safe_docstring(text: str) -> str:
    """One line a triple-quoted docstring can hold, whatever LabFrog's name is."""
    return " ".join(text.replace("\\", "/").replace('"', "'").split())


def _block(
    title: str,
    function: str,
    argument: tuple[str, str],
    docstring: str,
    body: list[str],
) -> str:
    parameter, expression = argument
    return "\n".join([
        _IMPORTS,
        "",
        "",
        f"@Variable(title={title!r})",
        f"def {function}(run, {parameter}):",
        f'    """{_safe_docstring(docstring)}"""',
        *([] if expression == "value" else [f"    value = {expression}"]),
        '    if value in (None, ""):',
        '        raise Skip("No value recorded for this shot")',
        *body,
        "",
    ])


def _number_block(
    title: str, function: str, argument: tuple[str, str], docstring: str
) -> str:
    return _block(
        title,
        function,
        argument,
        docstring,
        [
            "    try:",
            '        return float(str(value).strip().replace(",", "."))',
            "    except ValueError:",
            '        raise Skip(f"Not a number: {value!r}") from None',
        ],
    )


def _text_block(
    title: str, function: str, argument: tuple[str, str], docstring: str
) -> str:
    return _block(title, function, argument, docstring, ["    return str(value)"])


def _numbers_reason(values: Counter, count: int, total: int, unit: str) -> str:
    # Distinct values are enough for a range: no need to parse repeats.
    numbers = [number for value in values if (number := as_number(value)) is not None]
    spread = (
        f"from {_format(min(numbers))} to {_format(max(numbers))}"
        f"{f' {unit}' if unit else ''}"
        if numbers
        else ""
    )
    return (
        f"Recorded on {count} of {total} shots, {spread}, "
        f"{len(values)} different values."
    )


def _text_reason(values: Counter, count: int, total: int) -> str:
    common = ", ".join(f"{value} ({n})" for value, n in values.most_common(3))
    more = len(values) - 3
    return (
        f"Recorded on {count} of {total} shots as one of {len(values)} labels: "
        f"{common}{f' and {more} more' if more > 0 else ''}."
    )


def _display(kind: str) -> dict[str, str]:
    if kind == "number":
        return {
            "display": "number",
            "displayLabel": "Number column",
            "displayHelp": (
                "Shows the value in each shot's row. Select a cell in the shot "
                "table to see it as a trend across the campaign."
            ),
        }
    return {
        "display": "text",
        "displayLabel": "Label column",
        "displayHelp": (
            "Shows the label in each shot's row, so you can sort and filter "
            "shots by it."
        ),
    }


def _labfrog_suggestions(
    shots: list[HZDRShot], taken: set[str]
) -> list[dict[str, Any]]:
    seen, total = _collect(shots)
    # The starter's picks, from the same single pass over the shots.
    starter = {column["name"] for column in _columns_from(seen, total)}
    minimum = max(3, round(total * 0.1))
    ranked = []
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
            kind = "number"
        elif len(record.values) <= MAX_TEXT_VALUES:
            kind = "text"
        else:
            continue
        # The starter's order: numbers with a unit, other numbers, then text.
        order = (0 if unit else 1) if kind == "number" else 2
        rank = (0 if name in starter else 1, order)
        ranked.append((*rank, -record.count, name.lower(), name, record, unit, kind))

    suggestions = []
    for *_, name, record, unit, kind in sorted(ranked):
        title = _title(name, unit)
        function = _python_name(name, taken)
        argument = labfrog_argument(name)
        # What the browser looks for, quoted, to tell the column is there.
        path = name if "." in name else f"meta#labfrog_variables.{name}.value"
        docstring = f"LabFrog: {name}, as typed on the Shotsheet."
        block = (
            _number_block(title, function, argument, docstring)
            if kind == "number"
            else _text_block(title, function, argument, docstring)
        )
        suggestions.append({
            "id": f"labfrog:{name}",
            "title": title,
            "function": function,
            "origin": "labfrog",
            "originLabel": "LabFrog record",
            "field": f"labfrog_variables.{name}.value",
            "path": path,
            "type": kind,
            "unit": unit,
            "count": record.count,
            "total": total,
            "examples": [value for value, _ in record.values.most_common(3)],
            "reason": (
                _numbers_reason(record.values, record.count, total, unit)
                if kind == "number"
                else _text_reason(record.values, record.count, total)
            ),
            "starter": name in starter,
            "block": block,
            **_display(kind),
        })
    return suggestions


def _metadata_suggestions(
    shots: list[HZDRShot], taken: set[str]
) -> list[dict[str, Any]]:
    total = len(shots)
    minimum = max(3, round(total * 0.1))
    # Every registered key of a shot namespace; string keys drop out below,
    # since their values do not parse as numbers.
    keys = {
        key: unit or ""
        for key, unit in METADATA_KEY_REGISTRY.items()
        if key not in EXCLUDED_METADATA
        and key.split(".", 1)[0] not in EXCLUDED_NAMESPACES
    }
    keys.update(dict.fromkeys(EXTRA_METADATA_UNITS, ""))
    suggestions = []
    for key, registered_unit in sorted(keys.items()):
        values: Counter = Counter()
        units: Counter = Counter()
        for shot in shots:
            metadata = shot.metadata or {}
            number = as_number(_get(metadata, key))
            if number is None:
                continue
            values[_format(number)] += 1
            if key in EXTRA_METADATA_UNITS:
                raw_unit = _get(metadata, EXTRA_METADATA_UNITS[key])
                if raw_unit:
                    units[_unit(str(raw_unit))] += 1
        count = sum(values.values())
        if count < minimum or len(values) < 2:
            continue
        unit = _unit(registered_unit) or (units.most_common(1)[0][0] if units else "")
        unit = READABLE_UNITS.get(unit, unit)
        name = key.replace(".", " ").replace("_", " ")
        title = _title(_pretty(name), unit)
        function = _python_name(key, taken)
        path = f"meta#{key}"
        block = _number_block(
            title,
            function,
            (f"value: {path!r} = None", "value"),
            f"Shot metadata: {key} (registered key).",
        )
        suggestions.append({
            "id": f"metadata:{key}",
            "title": title,
            "function": function,
            "origin": "metadata",
            "originLabel": "Shot metadata",
            "field": key,
            "path": path,
            "type": "number",
            "unit": unit,
            "count": count,
            "total": total,
            "examples": [value for value, _ in values.most_common(3)],
            "reason": _numbers_reason(values, count, total, unit),
            "starter": False,
            "block": block,
            **_display("number"),
        })
    return suggestions


def column_suggestions(shots: Iterable[HZDRShot]) -> list[dict[str, Any]]:
    """Every column worth offering for this campaign, best first."""
    shot_list = list(shots)
    taken: set[str] = set()
    labfrog = _labfrog_suggestions(shot_list, taken)
    metadata = _metadata_suggestions(shot_list, taken)
    starters = [entry for entry in labfrog if entry["starter"]]
    rest = [entry for entry in labfrog if not entry["starter"]]
    return (starters + metadata + rest)[:MAX_SUGGESTIONS]

import asyncio
import hashlib
import json
from collections import Counter

from async_lru import alru_cache

from ..runs import sqlite as db
from ..runs.types import DamnitRun
from ..utils import create_map


@alru_cache(ttl=10)
async def fetch_metadata(proposal=db.DEFAULT_PROPOSAL):
    """Fetch the per-proposal metadata snapshot from SQLite.

    Returns a dict with `runs`, `variables`, `tags`, `groups`, and
    `timestamp`. `runs` is a server-ordered list of (proposal, run) pairs
    (active block first). Result is TTL-cached; the `run_updates` subscription
    invalidates this cache when it observes new data so subsequent reads stay
    fresh.
    """
    tags, variables, variable_tags, runs, max_timestamp = await asyncio.gather(
        db.async_all_tags(proposal),
        db.async_variables(proposal),
        db.async_variable_tags(proposal),
        db.async_run_identifiers(proposal),
        db.async_max(proposal, table="run_variables", column="timestamp"),
    )

    variables = {**DamnitRun.known_variables(), **variables}
    groups = _assign_groups(variables)
    variables = _order_by_group(variables)

    for name, var in variables.items():
        tag_ids = variable_tags.get(name, [])
        var["tags"] = [tags[tag]["name"] for tag in tag_ids]
        for tag in tag_ids:
            tags[tag].setdefault("variables", []).append(name)

    untagged = {
        "id": 0,
        "name": "(Untagged)",
        "variables": [name for name, var in variables.items() if not var.get("tags")],
    }
    tags = create_map([untagged, *tags.values()], key="name")

    snapshot = {
        "runs": runs,
        "variables": variables,
        "tags": tags,
        "groups": groups,
        "timestamp": max_timestamp or 0,
    }
    snapshot["signature"] = _signature(snapshot)
    return snapshot


def _assign_groups(variables):
    """Set the group on every dotted variable, and return the groups by name."""
    group_titles = {}
    for name, var in variables.items():
        group = _variable_group(name, var.get("title"))
        if group is None:
            continue
        instance, title = group
        var["group"] = instance
        group_titles.setdefault(instance, []).append(title)

    return {name: _group_entry(name, titles) for name, titles in group_titles.items()}


def _variable_group(name, title):
    """Find the group a variable belongs to, and the title it contributes.

    The dot in the name is the only reliable signal: titles carry slashes for
    units and prose too, and the separator before the leaf is configurable.
    """
    instance, dot, _ = name.partition(".")
    if not dot:
        return None

    group_title, slash, _ = (title or "").partition("/")
    return instance, group_title if slash else None


def _group_entry(name, titles):
    """Build the group, titled by majority, with the first seen winning a tie.

    Members with no title count towards the majority, so a group whose titles
    use a different separator keeps none: a stray `/` in a unit cuts elsewhere.
    """
    counts = Counter(titles)
    title = max(counts, key=counts.get)
    return {"name": name, "title": title} if title else {"name": name}


def _order_by_group(variables):
    """Gather each group's members at the position of its earliest member.

    Rowid order drifts from context file order, so members scatter and the
    header would draw a box per stretch of them. Ungrouped variables stay put.
    """
    blocks = {}
    for name, var in variables.items():
        group = var.get("group")
        key = ("group", group) if group else ("variable", name)
        blocks.setdefault(key, []).append((name, var))

    return {name: var for block in blocks.values() for name, var in block}


def _signature(snapshot) -> str:
    """Hash of everything a subscriber would be pushed.

    Computed here so it costs one pass per actual read rather than one per
    subscription tick. `timestamp` is left out: it moves whenever any value
    changes, which would make every tick look like a metadata change.
    """
    payload = json.dumps(
        {key: value for key, value in snapshot.items() if key != "timestamp"},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()

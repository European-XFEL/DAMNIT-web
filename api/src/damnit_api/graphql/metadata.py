import asyncio
import hashlib
import json

from async_lru import alru_cache

from ..runs import sqlite as db
from ..runs.types import DamnitRun
from ..utils import create_map


@alru_cache(ttl=10)
async def fetch_metadata(proposal=db.DEFAULT_PROPOSAL):
    """Fetch the per-proposal metadata snapshot from SQLite.

    Returns a dict with `runs`, `variables`, `tags`, and `timestamp`. `runs`
    is a server-ordered list of (proposal, run) pairs (active block first).
    Result is TTL-cached; the `run_updates` subscription invalidates this
    cache when it observes new data so subsequent reads stay fresh.
    """
    tags, variables, variable_tags, runs, max_timestamp = await asyncio.gather(
        db.async_all_tags(proposal),
        db.async_variables(proposal),
        db.async_variable_tags(proposal),
        db.async_run_identifiers(proposal),
        db.async_max(proposal, table="run_variables", column="timestamp"),
    )

    for name, var in variables.items():
        var["tags"] = [tags[tag]["name"] for tag in variable_tags.get(name, [])]

    variables = {**DamnitRun.known_variables(), **variables}

    for name, var_tags in variable_tags.items():
        for tag in var_tags:
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
        "timestamp": max_timestamp or 0,
    }
    snapshot["signature"] = _signature(snapshot)
    return snapshot


def _signature(snapshot) -> str:
    """Hash of everything a subscriber would be pushed.

    Computed here so it costs one pass per actual read rather than one per
    subscription tick. `timestamp` is left out: it moves whenever any value
    changes, which would make every tick look like a metadata change.
    """
    payload = json.dumps(
        {key: snapshot[key] for key in ("runs", "variables", "tags")},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()

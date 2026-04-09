from datetime import UTC, datetime

from async_lru import alru_cache

from .. import db
from ..utils import create_map
from .models import DamnitRun


@alru_cache(ttl=10)
async def fetch_metadata(proposal=db.DEFAULT_PROPOSAL):
    """Fetch the per-proposal metadata snapshot from SQLite.

    Returns a dict with `runs`, `variables`, `tags`, and `timestamp`. Result
    is TTL-cached; the `latest_data` subscription invalidates this cache when
    it observes new data so subsequent reads stay fresh.
    """
    tags = await db.async_all_tags(proposal)
    variables = await db.async_variables(proposal)
    variable_tags = await db.async_variable_tags(proposal)

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

    runs = await db.async_column(proposal, table="run_info", name="run")

    return {
        "runs": sorted(runs or []),
        "variables": variables,
        "tags": tags,
        "timestamp": datetime.now(tz=UTC).timestamp(),
    }

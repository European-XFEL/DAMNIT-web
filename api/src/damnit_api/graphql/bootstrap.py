from async_lru import alru_cache

from .. import db
from . import models


@alru_cache(ttl=10)
async def bootstrap(proposal=db.DEFAULT_PROPOSAL):
    """Sets up the DAMNIT model by adding annotations to its class definition
    and converting it to a Strawberry type. This function should only be called
    once.

    Raises:
        RuntimeError: If setup is called more than once.
    """

    model = models.get_model(proposal)

    tags = await db.async_all_tags(proposal)
    model.tags = {str(k): v for k, v in tags.items()}

    variables = await db.async_variables(proposal)

    variable_tags_list = await db.async_variable_tags(proposal)
    tags_map: dict[str, list[int]] = {}
    for row in variable_tags_list:
        name = row["variable_name"]
        tag_id = row["tag_id"]
        tags_map.setdefault(name, []).append(tag_id)

    for name, var in variables.items():
        var["tag_ids"] = tags_map.get(name, [])

    model.update(variables)

    runs = await db.async_column(proposal, table="run_info", name="run")
    model.runs = sorted(runs or [])

    return model

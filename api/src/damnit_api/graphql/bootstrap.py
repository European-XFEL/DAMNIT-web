from async_lru import alru_cache

from .. import db, utils
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
    variables = await db.async_variables(proposal)

    # Populate variable model with tags
    variable_tags = await db.async_variable_tags(proposal)
    for name, var in variables.items():
        var["tags"] = [tags[tag]["name"] for tag in variable_tags.get(name, [])]

    model.update(variables)

    # Popoulate tag model with variables
    for name, var_tags in variable_tags.items():
        for tag in var_tags:
            tags[tag].setdefault("variables", []).append(name)

    # Also create a tag for untagged variables
    untagged = {
        "id": 0,
        "name": "(Untagged)",
        "variables": [
            variable["name"]
            for variable in model.variables.values()
            if len(variable["tags"]) == 0
        ],
    }

    model.tags = utils.create_map([untagged, *tags.values()], key="name")

    runs = await db.async_column(proposal, table="run_info", name="run")
    model.runs = sorted(runs or [])

    return model

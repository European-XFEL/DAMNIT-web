from sqlalchemy import select
from sqlalchemy.exc import NoSuchTableError

from .. import db
from ..utils import create_map
from . import models


async def bootstrap(proposal=db.DEFAULT_PROPOSAL):
    """Sets up the DAMNIT model by adding annotations to its class definition
    and converting it to a Strawberry type. This function should only be called
    once.

    Raises:
        RuntimeError: If setup is called more than once.
    """

    model = models.get_model(proposal)

    tags = await db.async_all_tags(proposal)
    model.tags = [models.DamnitTag(**tag) for tag in tags]

    variables_list = await db.async_variables(proposal)

    try:
        variable_tags = await db.async_table(proposal, name="variable_tags")
        selection_tags = select(variable_tags.c.variable_name,
                                variable_tags.c.tag_id)
        async with db.get_session(proposal) as session:
            tags_result = await session.execute(selection_tags)

        tags_list = tags_result.mappings().all()
        tags_map: dict[str, list[int]] = {}
        for row in tags_list:
            name = row["variable_name"]
            tag_id = row["tag_id"]
            tags_map.setdefault(name, []).append(tag_id)

    except NoSuchTableError:
        tags_map = {}

    for var in variables_list:
        var["tag_ids"] = tags_map.get(var["name"], [])

    variables = create_map(variables_list, key="name")

    model.update(variables)

    runs = await db.async_column(proposal, table="run_info", name="run")
    model.runs = sorted(runs or [])

    return model

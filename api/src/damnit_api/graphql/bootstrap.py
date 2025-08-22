from .. import db
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

    variables = await db.async_variables(proposal)
    model.update(variables)

    runs = await db.async_column(proposal, table="run_info", name="run")
    model.runs = sorted(runs or [])

    return model

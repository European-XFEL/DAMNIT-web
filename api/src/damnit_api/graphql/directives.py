import strawberry
from strawberry.directive import DirectiveLocation, DirectiveValue

from .models import DamnitRun, DamnitType, DamnitVariable

HEAVY_DATA = (
    DamnitType.IMAGE,
    DamnitType.RGBA,
    DamnitType.ARRAY,
)


@strawberry.directive(
    locations=[DirectiveLocation.FIELD],
    description="Only return lightweight values (e.g., scalars)",
)
def lightweight(field: DirectiveValue[DamnitRun | DamnitVariable]):
    fields = field if isinstance(field, list) else [field]

    for variable in get_variables(fields):
        if variable is not None and variable.dtype in HEAVY_DATA:
            variable.value = None

    # Return original field
    return field


def get_variables(fields):
    variables = []
    for field in fields:
        if isinstance(field, DamnitRun):
            variables.extend(field._variables)
        elif isinstance(field, DamnitVariable):
            variables.append(field)
    return variables

import strawberry
from strawberry.directive import DirectiveLocation, DirectiveValue

from .models import BaseVariable, DamnitType


HEAVY_DATA = (
    DamnitType.IMAGE,
    DamnitType.RGBA,
    DamnitType.ARRAY,
)


@strawberry.directive(
    locations=[DirectiveLocation.FIELD],
    description="Only return lightweight values (e.g., scalars)",
)
def lightweight(field: DirectiveValue[BaseVariable]):
    if field is not None and DamnitType(field.dtype) in HEAVY_DATA:
        field.value = None
    return field

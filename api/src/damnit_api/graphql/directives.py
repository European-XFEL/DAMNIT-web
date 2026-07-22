import strawberry
from strawberry.directive import DirectiveLocation, DirectiveValue

from ..runs.types import Cell, DamnitRun
from ..shared.const import DamnitType

HEAVY_DATA = (
    DamnitType.IMAGE,
    DamnitType.RGBA,
    DamnitType.ARRAY,
)


@strawberry.directive(
    locations=[DirectiveLocation.FIELD],
    description="Only return lightweight values (e.g., scalars)",
)
def lightweight(field: DirectiveValue[DamnitRun | Cell]):
    fields = field if isinstance(field, list) else [field]

    for cell in get_cells(fields):
        if cell is not None and cell.dtype in HEAVY_DATA:
            cell.value = None

    # Return original field
    return field


def get_cells(fields):
    cells = []
    for field in fields:
        if isinstance(field, DamnitRun):
            cells.extend(field._cells)
        elif isinstance(field, Cell):
            cells.append(field)
    return cells

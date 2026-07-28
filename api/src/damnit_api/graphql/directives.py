import strawberry
from strawberry.directive import DirectiveLocation, DirectiveValue

from ..runs.types import Cell, DamnitRun
from ..shared.const import DamnitType

# The summary dtypes worth a second round trip. ARRAY_2D is missing on purpose:
# DamnitRun.get_dtype cannot reach it, so only a preview ever carries one.
HEAVY_DATA = (
    DamnitType.IMAGE,
    DamnitType.ARRAY_1D,
)


@strawberry.directive(
    locations=[DirectiveLocation.FIELD],
    description="Only return lightweight values (e.g., scalars)",
)
def lightweight(field: DirectiveValue[DamnitRun | Cell]):
    fields = field if isinstance(field, list) else [field]

    for cell in get_cells(fields):
        if cell is not None and cell.summary.dtype in HEAVY_DATA:
            cell.summary.value = None

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

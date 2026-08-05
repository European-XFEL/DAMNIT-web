from enum import Enum

DEFAULT_PROPOSAL = "2956"

FILL_VALUE = "None"


class DamnitType(Enum):
    NONE = "none"
    NUMBER = "number"
    STRING = "string"
    BOOLEAN = "boolean"
    TIMESTAMP = "timestamp"
    COMPLEX = "complex"

    ARRAY_1D = "array1d"
    ARRAY_2D = "array2d"
    IMAGE = "image"
    NUMPY = "numpy"

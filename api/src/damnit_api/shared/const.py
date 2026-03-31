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

    ARRAY = "array"
    IMAGE = "image"
    NUMPY = "numpy"
    RGBA = "rgba"

    PNG = "png"
    DATASET = "dataset"

from enum import Enum

DEFAULT_PROPOSAL = "2956"

FILL_VALUE = "None"


class DamnitType(Enum):
    NONE = "none"
    NUMBER = "number"
    STRING = "string"
    BOOLEAN = "boolean"
    TIMESTAMP = "timestamp"

    ARRAY = "array"
    IMAGE = "image"
    RGBA = "rgba"

    PNG = "png"
    DATASET = "dataset"

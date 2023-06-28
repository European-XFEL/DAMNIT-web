from enum import Enum

DEFAULT_PROPOSAL = '2956'

FILL_VALUE = 'None'

class Type(Enum):
    NUMBER = 'number'
    STRING = 'string'
    BOOLEAN = 'boolean'
    ARRAY = 'array'
    IMAGE = 'image'
    TIMESTAMP = 'timestamp'

import numpy as np

DTYPE_MAP = {
    'bytes': 'image',
    'str': 'string',
    'bool_': 'boolean',
}

def map_dtype(dtype, default='string'):
    name = DTYPE_MAP.get(dtype.__name__)
    if not name:
        name = 'number' if np.issubdtype(dtype, np.number) else default
    return name

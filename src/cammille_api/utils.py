from base64 import b64encode
import io
import pickle

import numpy as np
from matplotlib.figure import Figure

from .const import Type


DTYPE_MAP = {
    'bytes': Type.IMAGE,
    'str': Type.STRING,
    'bool_': Type.BOOLEAN,
}

def map_dtype(dtype, default=Type.STRING):
    dtype = DTYPE_MAP.get(dtype.__name__)
    if not dtype:
        dtype = Type.NUMBER if np.issubdtype(dtype, np.number) else default
    return dtype

# -----------------------------------------------------------------------------
# Conversion

def b64image(bytes_, format='png'):
    # Get the numpy array from the bytearray
    array = pickle.loads(bytes_)

    # Do matplotlib drawing
    # This is based on the DAMNIT GUI code generateThumbnail()
    fig = Figure(figsize=(1, 1))
    ax = fig.add_subplot()
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
    vmin = np.nanquantile(array, 0.01, interpolation='nearest')
    vmax = np.nanquantile(array, 0.99, interpolation='nearest')
    ax.imshow(array, vmin=vmin, vmax=vmax, extent=(0, 1, 1, 0))
    ax.axis('tight')
    ax.axis('off')
    ax.margins(0, 0)

    # Convert to base64 image with the supplied format
    with io.BytesIO() as buffer:
        # Save figure
        fig.savefig(buffer, format=format)
        
        # Get the encoded base64 string
        b64string = b64encode(buffer.getvalue()).decode()
        
    return b64string

def convert(data, dtype=Type.STRING):
    # Don't convert if None
    if data is None:
        return

    return CONVERSION_FUNCTIONS.get(dtype, str)(data)

CONVERSION_FUNCTIONS = {
    Type.IMAGE: b64image
}

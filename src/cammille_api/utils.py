from base64 import b64encode
from glob import iglob
import io
import os.path as osp
import pickle

import h5py
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
    # This is based on the DAMNIT GUI code Table.generateThumbnail()
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

# -----------------------------------------------------------------------------
# Proposal and runs

DATA_ROOT_DIR = '/gpfs/exfel/exp'


def format_proposal_number(proposal):
    """ Format a given unformatted proposal number."

    Lifted and modified from extra_data.reader.py
    https://github.com/European-XFEL/EXtra-data/blob/master/extra_data/reader.py
    """
    if not proposal.startswith('p'):
        proposal = 'p' + proposal.rjust(6, '0')

    return proposal


def find_proposal(propno):
    """Find the proposal directory for a given proposal on Maxwell

    Lifted and modified from extra_data.read_machinery.py
    https://github.com/European-XFEL/EXtra-data/blob/master/extra_data/read_machinery.py
    """

    if '/' in propno:
        # Already passed a proposal directory
        return propno
    
    propno = format_proposal_number(propno)
    for d in iglob(osp.join(DATA_ROOT_DIR, '*/*/{}'.format(propno))):
        return d

    return ''


def get_run_data(path, variable):
    try:
        file = h5py.File(path)
    except FileNotFoundError as e:
        # TODO: manage the error XD
        raise e
    data = file[variable]['data'][:]

    # REMOVE: Drop NaNs if data is 1D array (and also scale down a bit XD)
    # I do this temporarily as I know the signature of this data.
    data = data[np.argwhere(np.isfinite(data)).flatten()] / 1e5 

    return data

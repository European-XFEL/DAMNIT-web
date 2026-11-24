"""A DAMNIT context file for a mock proposal with every type of value.

It writes one variable per type of value DAMNIT stores, and every type of
failure on run 2. `build_proposals.py` runs it on mock runs.
"""

import numpy as np
import plotly.graph_objects as go
import xarray as xr
from damnit_ctx import Cell, Group, Variable
from extra_data import SourceNameError
from matplotlib.figure import Figure

FAILED_RUN = 2


def noise(run_number, size):
    return np.random.default_rng(run_number).normal(size=size)


# -----------------------------------------------------------------------------
# Scalars


@Variable(title="Trains", tags="Run details")
def n_trains(run, run_number: "meta#run_number"):
    return 100 + run_number


@Variable(title="Sample", tags="Run details")
def sample_name(run, run_number: "meta#run_number"):
    return f"Sample {run_number:03d}"


@Variable(title="Beam on", tags="Beam")
def beam_on(run, run_number: "meta#run_number"):
    return run_number != 3


@Variable(title="Amplitude", tags="Analysis")
def amplitude(run, run_number: "meta#run_number"):
    real, imag = noise(run_number, 2)
    return complex(real, imag)


# -----------------------------------------------------------------------------
# Arrays and figures


@Variable(title="Trace")
def trace(run, run_number: "meta#run_number"):
    return noise(run_number, 200)


@Variable(title="Detector image", tags="Detector")
def detector_image(run, run_number: "meta#run_number"):
    # Not square, so a test can tell rows from columns
    return noise(run_number, (16, 24))


@Variable(title="Pulse energy [uJ]")
def pulse_energy(run, run_number: "meta#run_number"):
    train_ids = 1_000_000 + 1000 * run_number + np.arange(100)

    # Its own seed, so its values differ from trace's and fit's
    energy = 500 + 20 * noise(run_number + 100, 100)

    return xr.DataArray(energy, dims="trainId", coords={"trainId": train_ids})


# A small figure: DAMNIT stores a figure as uncompressed RGBA pixels
@Variable(title="Trace plot", tags="Analysis")
def trace_plot(run, run_number: "meta#run_number"):
    figure = Figure(figsize=(2, 1.5), dpi=50)
    figure.add_subplot().plot(noise(run_number, 200))
    return figure


# Its own summary: without one, DAMNIT renders the figure with Chrome
@Variable(title="Trace with Plotly preview", tags="Analysis")
def trace_plotly(run, run_number: "meta#run_number"):
    values = noise(run_number, 200)
    return Cell(values, summary="mean", preview=go.Figure(go.Scatter(y=values)))


# -----------------------------------------------------------------------------
# Failures on run 2: Error, Missing data and Missing dependency


@Variable(title="Fit", tags="Analysis")
def fit(run, run_number: "meta#run_number"):
    if run_number == FAILED_RUN:
        msg = "fit did not converge"
        raise ValueError(msg)

    return float(noise(run_number, 100).mean())


@Variable(title="Attenuator", tags="Beam")
def attenuator(run, run_number: "meta#run_number"):
    if run_number == FAILED_RUN:
        source = "FXE_XAD_ATT/MDL/ATT"
        raise SourceNameError(source)

    return 0.5


@Variable(title="Transmission", tags="Beam")
def transmission(run, attenuator: "var#attenuator"):
    return attenuator * 0.9


# -----------------------------------------------------------------------------
# Groups


@Group(tags="Sample")
class Stage:
    offset_mm: float

    @Variable(title="Position [mm]")
    def position(self, run, run_number: "meta#run_number"):
        return run_number * 0.1 + self.offset_mm


sample_x = Stage(title="Sample X", offset_mm=0.0)
sample_y = Stage(title="Sample Y", offset_mm=1.0)

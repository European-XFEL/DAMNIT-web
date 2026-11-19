"""A DAMNIT context file for a mock proposal with no runs.

It holds a few of the all-value-types variables: tagged ones, an untagged one
and a group. `build_proposals.py` reads it and processes no run.
"""

import numpy as np
from damnit_ctx import Group, Variable


def noise(run_number, size):
    return np.random.default_rng(run_number).normal(size=size)


@Variable(title="Trains", tags="Run details")
def n_trains(run, run_number: "meta#run_number"):
    return 100 + run_number


@Variable(title="Sample", tags="Run details")
def sample_name(run, run_number: "meta#run_number"):
    return f"Sample {run_number:03d}"


@Variable(title="Trace")
def trace(run, run_number: "meta#run_number"):
    return noise(run_number, 200)


@Group(tags="Sample")
class Stage:
    offset_mm: float

    @Variable(title="Position [mm]")
    def position(self, run, run_number: "meta#run_number"):
        return run_number * 0.1 + self.offset_mm


sample_x = Stage(title="Sample X", offset_mm=0.0)

import numpy as np

from extra_analysis.pipeline import saxs_xpcs_offline
from extra.components import Scantool, XGM, XrayPulses
from damnit_ctx import Variable


# -----------------------------------------------------------------------------
# Run details


@Variable(title="Trains")
def n_trains(run):
    return len(run.train_ids)


@Variable("Sample type")
def sample_type(run, sample: "mymdc#sample_name"):
    return sample


@Variable("Scan type")
def scan_type(run):
    sc = Scantool(run)
    if sc.active:
        return sc.format(compact=True)


# -----------------------------------------------------------------------------
# Beam properties


@Variable(title="Pulses", summary="mean")
def n_pulses(run):
    return XrayPulses(run).pulse_counts().to_xarray()


@Variable(title="XGM intensity [uJ]", summary="mean")
def xgm_intensity(run):
    return XGM(run).pulse_energy().mean("trainId")


@Variable("XTD1 trans.", summary="nanmean", transient=True)
def xtd1_transmission(run):
    return run.alias["xtd1-transmission"].xarray()


@Variable("XTD6 trans.", summary="nanmean", transient=True)
def xtd6_transmission(run):
    return run.alias["xtd6-transmission"].xarray()


@Variable("Opt. trans.", summary="nanmean", transient=True)
def opt_transmission(run):
    return run.alias["opt-transmission"].xarray()


@Variable("Total trans.", summary="nanmean")
def total_transmission(
    run,
    xtd1: "var#xtd1_transmission",
    xtd6: "var#xtd6_transmission",
    opt: "var#opt_transmission",
):
    return xtd1 * xtd6 * opt


# -----------------------------------------------------------------------------
# Motors


@Variable("Sample X [mm]", summary="mean")
def sample_x(run):
    return run.alias["sample-x"].xarray()


@Variable("Sample Y [mm]", summary="mean")
def sample_y(run):
    return run.alias["sample-y"].xarray()


# -----------------------------------------------------------------------------
# XPCS

XPCS_RESULTS = None


@Variable("XPCS PIPELINE", data="proc", cluster=True, transient=True)
def xpcs_pipeline(
    run,
    proposal: "meta#proposal",
    run_no: "meta#run_number",
    sample: "mymdc#sample_name",
    rep_rate: "var#rep_rate",
):
    # Default values
    mask = "PROPOSAL_PATH/Shared/masks/agipd_mask.npy"
    q_range = np.arange(0.0095, 0.065, 0.005)
    workers_no = 50

    if sample == "yolk plasma":
        q_range = np.logspace(np.log10(0.00790267), np.log10(0.062), 10)  # 9 qBins
        mask = "PROPOSAL_PATH/Shared/masks/new_mask.npy"

    # ---------------------------------
    # input parameters for the pipeline
    # ---------------------------------
    args = dict()

    args["sdd"] = 7265
    args["mask"] = mask
    args["q_range"] = q_range

    # refine beam_center and do this again after outlier masking?
    args["refine_beamcenter"] = True
    args["refine_beamcenter_again"] = False

    # mask AGIPD outliers?
    args["outlier_masking"] = True

    # mask bad signal intensities?
    args["intensity_masking"] = True

    # remove trains from outside of the capillary frame holder range?
    args["remove_outer_points"] = True

    # force calculation of statistics
    args["calc_stats"] = True

    # execute xpcs (ttcf, etc.) calculations?
    args["run_xpcs_analysis"] = True
    args["run_saxs_analysis"] = True

    # misc
    args["xgm_source"] = XGM(run).instrument_source.source
    args["motor_range"] = (-24, 24)

    args["ram_limit"] = 300
    args["workers_no"] = workers_no

    args["rep_rate"] = rep_rate

    args["save_files"] = True
    args["all_messages"] = True
    # ---------------------------------

    global XPCS_RESULTS
    XPCS_RESULTS = saxs_xpcs_offline(proposal, run_no, **args)

    if (XPCS_RESULTS["TTCF_raw"] is not None) and (
        XPCS_RESULTS["TTCF_off"] is not None
    ):
        res = "Done"
    else:
        res = "Incomplete"

    return res


@Variable("XPCS q-rings", data="proc", cluster=True)
def xpcs_q_rings_plot(run, _: "var#xpcs_pipeline"):
    return XPCS_RESULTS["figure_2d"]


@Variable("XPCS intensity outliers", data="proc", cluster=True)
def xpcs_intensity_outliers_plot(run, _: "var#xpcs_pipeline"):
    return XPCS_RESULTS["fig_intens_outlier"]


@Variable("XPCS g2", data="proc", cluster=True)
def xpcs_g2_plot(run, _: "var#xpcs_pipeline"):
    return XPCS_RESULTS["figure_g2"]


@Variable("XPCS SAXS overview", data="proc", cluster=True)
def xpcs_saxs_plot(run, _: "var#xpcs_pipeline"):
    return XPCS_RESULTS["figure_saxs"]

import { getExtractedVariable, getTableVariables } from "./slices"

export const getAllExtractedVariables =
  ({ proposal, variable }) =>
  async (dispatch, getState) => {
    // 1. Get the tables values of all runs
    // TODO: Optimize this (e.g., by avoiding this step)
    await dispatch(getTableVariables({ proposal, variables: [variable] }))

    // 2. Get the extracted values of all run of that variable
    const state = getState()
    for (const run of Object.keys(state.tableData.data)) {
      dispatch(getExtractedVariable({ proposal, run: Number(run), variable }))
    }
  }

import { getExtractedValue } from "./extracted"
import { getTableData } from "./table"

import type { AppDispatch, RootState } from "../redux/"

type GetAllExtractedValuesOptions = {
  proposal: string
  variable: string
}

export const getAllExtractedValues =
  ({ proposal, variable }: GetAllExtractedValuesOptions) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    // 1. Get the tables values of all runs
    // TODO: Optimize this (e.g., by avoiding this step)
    await dispatch(getTableData({ proposal, variables: [variable] }))

    // 2. Get the extracted values of all run of that variable
    const state = getState()
    for (const run of Object.keys(state.tableData.data)) {
      dispatch(getExtractedValue({ proposal, run, variable }))
    }
  }

import { createSlice } from "@reduxjs/toolkit"

import { isArrayEqual } from "../../utils/array"

type TableState = {
  selection: {
    run: number | null
    variables: string[]
  }
}

const initialState: TableState = {
  selection: { run: null, variables: [] },
}

const slice = createSlice({
  name: "table",
  initialState,
  reducers: {
    selectRun: ({ selection }, action) => {
      const { run, variables } = action.payload
      if (selection.run !== run) {
        selection.run = run
      }
      if (!isArrayEqual(selection.variables, variables)) {
        selection.variables = variables
      }
    },
    reset: (state) => {
      state.selection = { ...initialState.selection }
    },
  },
})

export default slice.reducer
export const { selectRun, reset } = slice.actions

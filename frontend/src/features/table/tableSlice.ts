import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  selection: { run: null, variables: null },
}

const slice = createSlice({
  name: "table",
  initialState,
  reducers: {
    selectRun: ({ selection }, action) => {
      const { run, variables } = action.payload
      selection.run = run
      selection.variables = variables
    },
    reset: (state) => {
      state.selection = { ...initialState.selection }
    },
  },
})

export default slice.reducer
export const { selectRun, reset } = slice.actions

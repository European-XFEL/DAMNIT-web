import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { isArrayEqual } from '../../utils/array'

type TableState = {
  selection: {
    run: number | null
    variables: string[]
  }
  variableVisibility: Record<string, boolean>
}

const initialState: TableState = {
  selection: { run: null, variables: [] },
  variableVisibility: {},
}

const slice = createSlice({
  name: 'table',
  initialState,
  reducers: {
    selectRun: (
      { selection },
      action: PayloadAction<{ run: number | null; variables: string[] }>
    ) => {
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
      state.variableVisibility = {}
    },
    setVariablesVisibility: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      for (const [name, isVisible] of Object.entries(action.payload)) {
        state.variableVisibility[name] = isVisible
      }
    },
  },
})

export default slice.reducer
export const { selectRun, reset, setVariablesVisibility } = slice.actions

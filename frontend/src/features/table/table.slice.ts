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
    toggleVariableVisibility: (state, action: PayloadAction<string>) => {
      const varName = action.payload
      const current = state.variableVisibility[varName]
      state.variableVisibility[varName] = !(current ?? true)
    },
    setVariableGroupVisibility: (
      state,
      action: PayloadAction<{ variableNames: string[]; isVisible: boolean }>
    ) => {
      const { variableNames, isVisible } = action.payload
      variableNames.forEach((name) => {
        state.variableVisibility[name] = isVisible
      })
    },
  },
})

export default slice.reducer
export const {
  selectRun,
  reset,
  toggleVariableVisibility,
  setVariableGroupVisibility,
} = slice.actions

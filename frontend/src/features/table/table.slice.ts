import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { getTable } from '../../data/table'
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
      if (varName in state.variableVisibility) {
        state.variableVisibility[varName] = !state.variableVisibility[varName]
      }
    },
    setVariableGroupVisibility: (
      state,
      action: PayloadAction<{ variableNames: string[]; isVisible: boolean }>
    ) => {
      const { variableNames, isVisible } = action.payload
      variableNames.forEach((name) => {
        if (name in state.variableVisibility) {
          state.variableVisibility[name] = isVisible
        }
      })
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const newVariables = action.payload.metadata?.variables
      if (newVariables) {
        const next: Record<string, boolean> = {}
        for (const varName of Object.keys(newVariables)) {
          next[varName] = state.variableVisibility[varName] ?? true
        }
        state.variableVisibility = next
      }
    })
  },
})

export default slice.reducer
export const {
  selectRun,
  reset,
  toggleVariableVisibility,
  setVariableGroupVisibility,
} = slice.actions

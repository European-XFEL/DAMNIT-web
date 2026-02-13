import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Scroll } from './types'
import { isArrayEqual } from '../../utils/array'

type VariableOptions = {
  visibility: boolean
}

type TableState = {
  selection: {
    run: number | null
    variables: string[]
  }
  view: {
    scroll: Scroll
  }
  variables: Record<string, VariableOptions>
}

const initialState: TableState = {
  selection: { run: null, variables: [] },
  variables: {},
  view: { scroll: { x: 0, y: 0 } },
}

const slice = createSlice({
  name: 'table',
  initialState,
  reducers: {
    reset: () => initialState,
    selectRun: ({ selection }, action) => {
      const { run, variables } = action.payload
      if (selection.run !== run) {
        selection.run = run
      }
      if (!isArrayEqual(selection.variables, variables)) {
        selection.variables = variables
      }
    },
    setVariableVisibility: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      for (const [name, isVisible] of Object.entries(action.payload)) {
        const options = state.variables[name] ?? {}
        state.variables[name] = { ...options, visibility: isVisible }
      }
    },
    setViewScroll: (state, action: PayloadAction<Scroll>) => {
      state.view.scroll = action.payload
    },
  },
})

export default slice.reducer
export const { selectRun, reset, setVariableVisibility, setViewScroll } =
  slice.actions

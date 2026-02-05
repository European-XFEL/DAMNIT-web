import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Scroll } from './types'
import { isArrayEqual } from '../../utils/array'

type TableState = {
  selection: {
    run: number | null
    variables: string[]
  }
  view: {
    scroll: Scroll
  }
  visibility: {
    variables: Record<string, boolean>
  }
}

const initialState: TableState = {
  selection: { run: null, variables: [] },
  visibility: { variables: {} },
  view: { scroll: { x: 0, y: 0 } },
}

const slice = createSlice({
  name: 'table',
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
    reset: () => initialState,
    setVariablesVisibility: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      for (const [name, isVisible] of Object.entries(action.payload)) {
        state.visibility.variables[name] = isVisible
      }
    },
    setViewScroll: (state, action: PayloadAction<Scroll>) => {
      state.view.scroll = action.payload
    },
  },
})

export default slice.reducer
export const { selectRun, reset, setVariablesVisibility, setViewScroll } =
  slice.actions

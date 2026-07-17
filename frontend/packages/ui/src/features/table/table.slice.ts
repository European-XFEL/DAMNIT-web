import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { type PlotSpec } from '#src/types'
import { isArrayEqual } from '#src/utils/array'

import type { Scroll } from './types'

type VariableOptions = {
  visibility: boolean
}

type TagSettings = {
  isSelected: boolean
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
  tags: Record<string, TagSettings>
  isActive: boolean
}

const initialState: TableState = {
  selection: { run: null, variables: [] },
  variables: {},
  tags: {},
  view: { scroll: { x: 0, y: 0 } },
  isActive: false,
}

const slice = createSlice({
  name: 'table',
  initialState,
  reducers: {
    setActive: (state, action: PayloadAction<boolean>) => {
      state.isActive = action.payload
    },
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
    setTagSelection: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      // Set the tags selection
      for (const [name, isSelected] of Object.entries(action.payload)) {
        const settings = state.tags[name] ?? {}
        state.tags[name] = { ...settings, isSelected }
      }
    },
    clearTagSelection: (state) => {
      // Set the tags selection
      for (const name of Object.keys(state.tags)) {
        const settings = state.tags[name] ?? {}
        state.tags[name] = { ...settings, isSelected: false }
      }
    },
    setViewScroll: (state, action: PayloadAction<Scroll>) => {
      state.view.scroll = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const {
  clearTagSelection,
  selectRun,
  setActive,
  setTagSelection,
  setVariableVisibility,
  setViewScroll,
} = slice.actions

// No reducer handles this: a store listener turns the request into a plot.
export const plotRequested = createAction<PlotSpec>('table/plotRequested')

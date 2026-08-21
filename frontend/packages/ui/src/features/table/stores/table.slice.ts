import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { VARIABLES } from '#src/constants'
import { runKey } from '#src/data/table/table-data.transforms'
import type { RunId } from '#src/data/table/table-data.types'
import { type PlotSpec } from '#src/types'
import { isEmpty } from '#src/utils/helpers'
import type { Scroll } from '#src/features/table/types/table.types'

// Shaped by @tanstack/table-core v9: column ids and primitives, nothing derived.
// These key names are the contract, so don't rename them to fit local taste.
type TanstackState = {
  columnVisibility: Record<string, boolean>
  columnPinning: { start: string[]; end: string[] }
  rowSelection: Record<string, true>
}

// What TanStack has no name for. `tagSelection` filters columns by a facet,
// which its row-filtering columnFilters cannot express; scroll and isActive only
// mean anything mid-session, which its state slices deliberately exclude.
type TableViewState = {
  activeVariable: string | null
  tagSelection: Record<string, boolean>
  view: {
    scroll: Scroll
  }
  isActive: boolean
}

type TableState = TanstackState & TableViewState

const initialState: TableState = {
  // A column shows unless it is listed false, so only the ones the table leaves
  // out of its default view are seeded.
  columnVisibility: { [VARIABLES.proposal]: false },
  // These lead the grid and stay put while it scrolls. Glide freezes a leading
  // run of columns, so `end` is here only because the shape carries it.
  columnPinning: { start: [VARIABLES.proposal, VARIABLES.run], end: [] },
  // Keyed by runKey, so the selection survives the rows moving under it.
  rowSelection: {},
  // Which variable the aside is drilled into; null shows every one of them.
  activeVariable: null,
  tagSelection: {},
  view: { scroll: { x: 0, y: 0 } },
  isActive: false,
}

// Immer hands out a new object on every assignment, so writing unconditionally
// would give every reader of `rowSelection` a fresh reference per click.
function selectRow(state: TableState, key: string) {
  const selected = Object.keys(state.rowSelection)
  if (selected.length !== 1 || selected[0] !== key) {
    state.rowSelection = { [key]: true }
  }
}

const slice = createSlice({
  name: 'table',
  initialState,
  reducers: {
    setActive: (state, action: PayloadAction<boolean>) => {
      state.isActive = action.payload
    },
    runSelected: (state, action: PayloadAction<RunId>) => {
      selectRow(state, runKey(action.payload))
      state.activeVariable = null
    },
    runDeselected: (state) => {
      if (!isEmpty(state.rowSelection)) {
        state.rowSelection = {}
      }
      state.activeVariable = null
    },
    cellActivated: (
      state,
      action: PayloadAction<RunId & { variable: string }>
    ) => {
      selectRow(state, runKey(action.payload))
      state.activeVariable = action.payload.variable
    },
    setColumnVisibility: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      Object.assign(state.columnVisibility, action.payload)
    },
    setTagSelection: (
      state,
      action: PayloadAction<Record<string, boolean>>
    ) => {
      Object.assign(state.tagSelection, action.payload)
    },
    clearTagSelection: (state) => {
      state.tagSelection = {}
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
  cellActivated,
  clearTagSelection,
  runDeselected,
  runSelected,
  setActive,
  setColumnVisibility,
  setTagSelection,
  setViewScroll,
} = slice.actions

// No reducer handles this: a store listener turns the request into a plot.
export const plotRequested = createAction<PlotSpec>('table/plotRequested')

import type { RootState } from '#src/app/store/types'

// ----------------------------------------------------------------------------
// Columns

export const selectColumnVisibility = (state: RootState) =>
  state.table.columnVisibility

export const selectColumnPinning = (state: RootState) =>
  state.table.columnPinning

export const selectColumnOrder = (state: RootState) => state.table.columnOrder

export const selectColumnSizing = (state: RootState) => state.table.columnSizing

export const selectLastMove = (state: RootState) => state.table.lastMove

// ----------------------------------------------------------------------------
// Selection

export const selectRowSelection = (state: RootState) => state.table.rowSelection

export const selectActiveVariable = (state: RootState) =>
  state.table.activeVariable

// ----------------------------------------------------------------------------
// Tags

export const selectTagSelection = (state: RootState) => state.table.tagSelection

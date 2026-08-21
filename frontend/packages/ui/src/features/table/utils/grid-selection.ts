import type { GridSelection, Rectangle } from '@glideapps/glide-data-grid'

import { runKey } from '#src/data/table/table-data.transforms'
import type { RunId } from '#src/data/table/table-data.types'
import type { TableColumn } from '#src/features/table/types/table.types'

// Glide addresses a selection by index into the visible columns and the run
// list, and nothing re-points those indices when either list changes: hiding a
// column slides the selection onto its neighbour. So the selection is held by
// variable and run identity, and resolved back to indices on every render.
export type SelectedCell = { variable: string; run: string }
export type SelectedRange = SelectedCell & { width: number; height: number }
export type SelectedCells = {
  cell: SelectedCell
  range: SelectedRange
  rangeStack: SelectedRange[]
}

export type ColumnIndex = Map<string, number>
export type RowIndex = Map<string, number>

function toSelectedCell(
  col: number,
  row: number,
  columns: TableColumn[],
  runs: RunId[]
): SelectedCell | undefined {
  const variable = columns[col]?.id
  const identity = runs[row]
  if (!variable || !identity) {
    return undefined
  }

  return { variable, run: runKey(identity) }
}

function toSelectedRange(
  { x, y, width, height }: Rectangle,
  columns: TableColumn[],
  runs: RunId[]
): SelectedRange | undefined {
  const cell = toSelectedCell(x, y, columns, runs)
  return cell && { ...cell, width, height }
}

export function toSelectedCells(
  { cell: [col, row], range, rangeStack }: GridSelection['current'] & object,
  columns: TableColumn[],
  runs: RunId[]
): SelectedCells | undefined {
  const anchor = toSelectedCell(col, row, columns, runs)
  const anchored = toSelectedRange(range, columns, runs)
  if (!anchor || !anchored) {
    return undefined
  }

  return {
    cell: anchor,
    range: anchored,
    rangeStack: rangeStack
      .map((rect) => toSelectedRange(rect, columns, runs))
      .filter((rect) => rect != null),
  }
}

function toOrigin(
  { variable, run }: SelectedCell,
  columnIndex: ColumnIndex,
  rowIndex: RowIndex
) {
  const x = columnIndex.get(variable)
  const y = rowIndex.get(run)
  return x == null || y == null ? undefined : { x, y }
}

function toRectangle(
  range: SelectedRange,
  columnIndex: ColumnIndex,
  rowIndex: RowIndex
): Rectangle | undefined {
  const origin = toOrigin(range, columnIndex, rowIndex)
  return origin && { ...origin, width: range.width, height: range.height }
}

// A selection whose column or run has left the table no longer points at
// anything, which reads as nothing selected rather than as its neighbour.
export function toCurrent(
  selection: SelectedCells | undefined,
  columnIndex: ColumnIndex,
  rowIndex: RowIndex
): GridSelection['current'] {
  if (!selection) {
    return undefined
  }

  const anchor = toOrigin(selection.cell, columnIndex, rowIndex)
  if (!anchor) {
    return undefined
  }

  // The anchor outlives its range: hiding the column a range started from says
  // nothing about the cell the user last touched, so that cell keeps its
  // selection as the single cell it would have had from a plain click.
  const range = toRectangle(selection.range, columnIndex, rowIndex) ?? {
    ...anchor,
    width: 1,
    height: 1,
  }

  return {
    cell: [anchor.x, anchor.y],
    range,
    rangeStack: selection.rangeStack
      .map((rect) => toRectangle(rect, columnIndex, rowIndex))
      .filter((rect) => rect != null),
  }
}

import { DTYPES } from '#src/constants'
import { hasValue, runKey } from '#src/data/table/table-data.transforms'
import type { Cell, RunCells, RunId } from '#src/data/table/table-data.types'

// The cells a summary plot draws for one run, one per plotted variable, or null
// when any of them is not a number: a run is drawn whole or not at all.
export function drawnCells(
  row: RunCells | undefined,
  variables: string[]
): Cell[] | null {
  const cells = variables.map((name) => row?.get(name))
  const allNumeric = cells.every(
    (cell): cell is Cell =>
      hasValue(cell) &&
      typeof cell.summary.value === 'number' &&
      cell.summary.dtype === DTYPES.number
  )

  return allNumeric ? cells : null
}

type NewestComputedTimeOptions = {
  cells: Map<string, RunCells>
  runIds: RunId[]
  variables: string[]
}

// When the newest value a summary plot draws was computed, or null when none of
// them has a time.
export function newestComputedTime({
  cells,
  runIds,
  variables,
}: NewestComputedTimeOptions): number | null {
  let newest: number | null = null
  for (const id of runIds) {
    for (const cell of drawnCells(cells.get(runKey(id)), variables) ?? []) {
      const time = cell.computed_at
      if (time !== null && (newest === null || time > newest)) {
        newest = time
      }
    }
  }

  return newest
}

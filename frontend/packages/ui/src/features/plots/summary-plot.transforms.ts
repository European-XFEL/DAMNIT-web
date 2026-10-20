import { DTYPES } from '#src/constants'
import { hasValue } from '#src/data/table/table-data.transforms'
import type { Cell, RunCells } from '#src/data/table/table-data.types'

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

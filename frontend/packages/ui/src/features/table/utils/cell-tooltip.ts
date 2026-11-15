import { DTYPES } from '#src/constants'
import type { Cell } from '#src/data/table/table-data.types'
import type { CellTooltip } from '#src/features/table/components/tooltips/table-tooltip'
import { sparklineIndexAt, toSparkline } from '#src/features/table/utils/cells'

// The card a hovered cell shows, if any. `normalizedX` is where the pointer is
// across the cell's content, from 0 at its left edge to 1 at its right.
export const cellTooltip = (
  cell: Cell,
  { normalizedX }: { normalizedX: number }
): CellTooltip | undefined => {
  const { value, dtype } = cell.summary

  if (cell.error) {
    return { kind: 'error', error: cell.error }
  }
  if (dtype === DTYPES.image && typeof value === 'string' && value) {
    return { kind: 'image', src: value }
  }
  if (dtype !== DTYPES.array1d) {
    return undefined
  }

  const sparkline = toSparkline(value)
  if (!sparkline?.y.length) {
    return undefined
  }

  const index = sparklineIndexAt({ normalizedX, count: sparkline.y.length })
  return { kind: 'sparkline', x: sparkline.x[index], y: sparkline.y[index] }
}

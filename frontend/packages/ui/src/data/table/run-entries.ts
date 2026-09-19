import {
  DTYPES,
  NONCONFIGURABLE_VARIABLES,
  isHeavySummaryBlank,
} from '#src/constants'
import type {
  Cell,
  CellValue,
  RunCells,
  TableMeta,
  Variable,
} from '#src/data/table/table-data.types'
import { buildVariableBlocks } from '#src/data/table/variable-blocks'
import type { CellError } from '#src/utils/cell-errors'
import type { VariableBlock, VariableItem } from '#src/utils/variable-blocks'

// What the panel draws under a variable's title.
type CellState =
  | { state: 'value'; value: NonNullable<CellValue>; dtype: string }
  | { state: 'loading'; dtype: string }
  | { state: 'no-preview' }
  | { state: 'blank' }
  | { state: 'error'; error: CellError }

export type RunEntry = VariableItem & CellState

type RunEntriesOptions = {
  cells: RunCells
  // In the order the grid draws its columns.
  variables: Variable[]
  groups: TableMeta['groups']
  visible: Record<string, boolean | undefined>
  drilled: string | null
}

// A run with no cell for a variable is one DAMNIT has no value for, which the
// grid draws as empty too.
function cellState(cell: Cell | undefined): CellState {
  if (cell == null) {
    return { state: 'blank' }
  }
  if (cell.error != null) {
    return { state: 'error', error: cell.error }
  }
  // A curve is something only a plot can show, so nothing waits for its value.
  if (cell.summary.dtype === DTYPES.array1d) {
    return { state: 'no-preview' }
  }
  if (isHeavySummaryBlank(cell.summary)) {
    return { state: 'loading', dtype: cell.summary.dtype }
  }

  const { value, dtype } = cell.summary
  return value == null ? { state: 'blank' } : { state: 'value', value, dtype }
}

// The grid's row as blocks, less what has no value to show. Drilled, the one
// variable alone in its group, whatever its state or its column's visibility.
export function runEntries({
  cells,
  variables,
  groups,
  visible,
  drilled,
}: RunEntriesOptions): VariableBlock<RunEntry>[] {
  const isListed = ({ name }: Variable) => {
    if (NONCONFIGURABLE_VARIABLES.includes(name)) {
      return false
    }
    if (drilled != null) {
      return name === drilled
    }

    const { state } = cellState(cells[name])
    return visible[name] !== false && state !== 'blank' && state !== 'error'
  }

  return buildVariableBlocks(variables.filter(isListed), {
    groups,
    toItem: (variable, item) => ({
      ...item,
      ...cellState(cells[variable.name]),
    }),
  })
}

import { NONCONFIGURABLE_VARIABLES } from '#src/constants'
import { isDeferred } from '#src/data/table/table-data.transforms'
import type {
  Cell,
  CellError,
  CellValue,
  RunCells,
  TableMeta,
  Variable,
} from '#src/data/table/table-data.types'
import { buildVariableBlocks } from '#src/data/table/variable-blocks'
import type { VariableBlock, VariableItem } from '#src/utils/variable-blocks'

type CellState =
  | { state: 'value'; value: NonNullable<CellValue>; dtype: string }
  | { state: 'loading'; dtype: string }
  | { state: 'blank' }
  | { state: 'error'; error: CellError }

export type RunEntry = VariableItem & CellState

type RunEntriesOptions = {
  cells: RunCells
  variables: Variable[]
  groups: TableMeta['groups']
  visible: Record<string, boolean | undefined>
  activeVariable: string | null
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
  if (isDeferred(cell)) {
    return { state: 'loading', dtype: cell.summary.dtype }
  }

  const { value, dtype } = cell.summary
  return value == null ? { state: 'blank' } : { state: 'value', value, dtype }
}

// The grid's row as blocks, less what has no value to show. With an active
// variable, that one alone in its group, whatever its state or visibility.
export function runEntries({
  cells,
  variables,
  groups,
  visible,
  activeVariable,
}: RunEntriesOptions): VariableBlock<RunEntry>[] {
  const isListed = ({ name }: Variable) => {
    if (NONCONFIGURABLE_VARIABLES.includes(name)) {
      return false
    }
    if (activeVariable != null) {
      return name === activeVariable
    }

    const { state } = cellState(cells.get(name))
    return visible[name] !== false && (state === 'value' || state === 'loading')
  }

  return buildVariableBlocks(variables.filter(isListed), {
    groups,
    toItem: (variable, item) => ({
      ...item,
      ...cellState(cells.get(variable.name)),
    }),
  })
}

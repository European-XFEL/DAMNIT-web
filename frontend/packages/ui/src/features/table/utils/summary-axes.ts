import { VARIABLES } from '#src/constants'
import type { TableColumn } from '#src/features/table/types/table.types'

const RUN_AXIS: TableColumn = { id: VARIABLES.run, title: 'Run' }

type SummaryAxesParams = {
  variable: string
  selectedVariables: string[]
  columnsById: Map<string, TableColumn>
}

// The right-clicked column is the y axis. The other selected one is the x
// axis, or Run when this column is the only one selected.
export function summaryAxes({
  variable,
  selectedVariables,
  columnsById,
}: SummaryAxesParams) {
  if (selectedVariables.length > 2) {
    return undefined
  }

  const y = columnsById.get(variable)
  const firstSelected = selectedVariables.find((other) => other !== variable)
  const x =
    firstSelected === undefined ? RUN_AXIS : columnsById.get(firstSelected)
  if (!x || !y) {
    return undefined
  }

  return { x, y }
}

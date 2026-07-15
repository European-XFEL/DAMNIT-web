import type { RootState } from '#src/redux/types'
import { createTypedSelector } from '#src/redux/selectors'
import { EXCLUDED_VARIABLES } from '#src/constants'

const selectTableData = (state: RootState) => state.tableData

export const selectVariables = createTypedSelector(
  [selectTableData],
  (tableData) =>
    Object.values(tableData.metadata.variables).filter(
      (variable) => !EXCLUDED_VARIABLES.includes(variable.name)
    )
)

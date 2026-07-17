import type { RootState } from '#src/app/store/types'
import { createTypedSelector } from '#src/app/store/selectors'
import { EXCLUDED_VARIABLES } from '#src/constants'

const selectTableData = (state: RootState) => state.tableData

export const selectVariables = createTypedSelector(
  [selectTableData],
  (tableData) =>
    Object.values(tableData.metadata.variables).filter(
      (variable) => !EXCLUDED_VARIABLES.includes(variable.name)
    )
)

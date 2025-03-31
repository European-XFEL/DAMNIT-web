import { createTypedSelector } from "../../redux"

import { RootState } from "../../redux/reducer"
import { EXCLUDED_VARIABLES } from "../../constants"

const selectTableData = (state: RootState) => state.tableData

export const selectVariables = createTypedSelector(
  [selectTableData],
  (tableData) =>
    Object.values(tableData.metadata.variables).filter(
      (variable) => !EXCLUDED_VARIABLES.includes(variable.name),
    ),
)

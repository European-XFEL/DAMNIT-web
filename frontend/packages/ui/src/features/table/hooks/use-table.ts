import { isEmpty } from 'lodash'

import { NONCONFIGURABLE_VARIABLES } from '../constants'
import {
  selectTagSelection,
  selectVariableVisibility,
} from '../store/selectors'

import { useAppSelector } from '../../../redux/hooks'

function useColumnVisibility() {
  const variableVisibility = useAppSelector(selectVariableVisibility)
  const tagSelection = useAppSelector(selectTagSelection)

  // TODO: Replace with GraphQL useQuery
  const { variables, tags } = useAppSelector(
    (state) => state.tableData.metadata
  )

  const hasSelectedTags =
    !isEmpty(tagSelection) && Object.values(tagSelection).some(Boolean)

  const visibleVariablesFromTags = new Set(
    Object.entries(tags)
      .filter(([name]) => !!tagSelection[name])
      .map(([_, tag]) => tag.variables)
      .flat()
  )

  const columnVisibility = Object.fromEntries(
    Object.keys(variables)
      .filter((name) => !NONCONFIGURABLE_VARIABLES.includes(name))
      .map((name) => {
        return [
          name,
          variableVisibility[name] !== false &&
            (!hasSelectedTags || visibleVariablesFromTags.has(name)),
        ]
      })
  )

  return columnVisibility
}

export function useTable() {
  const columnVisibility = useColumnVisibility()

  return { columnVisibility }
}

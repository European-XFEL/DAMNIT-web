import { useMemo } from 'react'
import { isEmpty } from 'lodash'

import { NONCONFIGURABLE_VARIABLES } from '../constants'
import {
  selectTagSelection,
  selectVariableVisibility,
} from '../store/selectors'

import { useAppSelector } from '../../../redux/hooks'

function useConfigurableVariableNames() {
  // TODO: Replace with GraphQL useQuery
  const variables = useAppSelector(
    (state) => state.tableData.metadata.variables
  )

  const configurableVariables = useMemo(
    () =>
      Object.keys(variables).filter(
        (name) => !NONCONFIGURABLE_VARIABLES.includes(name)
      ),
    [variables]
  )

  return configurableVariables
}

export function useColumnVisibilityFromVariables() {
  const variableVisibility = useAppSelector(selectVariableVisibility)
  const variables = useConfigurableVariableNames()

  return useMemo(() => {
    return Object.fromEntries(
      variables.map((variable) => [
        variable,
        variableVisibility[variable] !== false,
      ])
    )
  }, [variables, variableVisibility])
}

export function useColumnVisibilityFromTags() {
  // TODO: Replace with GraphQL useQuery
  const tags = useAppSelector((state) => state.tableData.metadata.tags)

  const selection = useAppSelector(selectTagSelection)
  const variables = useConfigurableVariableNames()

  const visibleVariablesFromTags = useMemo(() => {
    const hasSelectedTags =
      !isEmpty(selection) && Object.values(selection).some(Boolean)
    if (!hasSelectedTags) {
      return new Set()
    }

    return new Set(
      Object.entries(tags)
        .filter(([name]) => !!selection[name])
        .map(([_, tag]) => tag.variables)
        .flat()
    )
  }, [tags, selection])

  const visibilityFromTags = useMemo(() => {
    if (visibleVariablesFromTags.size === 0) {
      // There's no selection
      return null
    }

    return Object.fromEntries(
      variables.map((variable) => [
        variable,
        visibleVariablesFromTags.has(variable),
      ])
    )
  }, [visibleVariablesFromTags, variables])

  return visibilityFromTags
}

export function useColumnVisibility() {
  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const visibilityFromTags = useColumnVisibilityFromTags()

  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(visibilityFromVariables).map((variable) => [
          variable,
          visibilityFromVariables[variable] &&
            (visibilityFromTags == null || visibilityFromTags[variable]),
        ])
      ),
    [visibilityFromVariables, visibilityFromTags]
  )

  return columnVisibility
}

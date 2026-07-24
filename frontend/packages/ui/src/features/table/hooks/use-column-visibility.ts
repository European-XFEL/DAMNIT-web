import { useMemo } from 'react'

import type { Tag } from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { isVariableVisible, NONCONFIGURABLE_VARIABLES } from '#src/constants'
import {
  selectTagSelection,
  selectVariableVisibility,
} from '#src/features/table/store/selectors'
import { useAppSelector } from '#src/app/store/hooks'

type ColumnVisibilityInputs = {
  variableNames: string[]
  visibility: Record<string, boolean | undefined>
  tags: Record<string, Tag>
  tagSelection: Record<string, boolean>
}

// Columns the user can't hide (added_at, run) never appear here.
function configurableVariables(variableNames: string[]) {
  return variableNames.filter(
    (name) => !NONCONFIGURABLE_VARIABLES.includes(name)
  )
}

// The visibility map for the configurable columns.
function visibilityFromVariables(
  configurable: string[],
  visibility: ColumnVisibilityInputs['visibility']
) {
  return Object.fromEntries(
    configurable.map((name) => [name, isVariableVisible(name, visibility)])
  )
}

// With no selected tags there's no tag filter (null). Otherwise a variable
// passes only if it belongs to at least one selected tag.
function visibilityFromTags(
  configurable: string[],
  { tags, tagSelection }: Pick<ColumnVisibilityInputs, 'tags' | 'tagSelection'>
): Record<string, boolean> | null {
  const taggedVariables = new Set(
    Object.entries(tags)
      .filter(([name]) => !!tagSelection[name])
      .flatMap(([, tag]) => tag.variables)
  )

  if (taggedVariables.size === 0) {
    return null
  }

  return Object.fromEntries(
    configurable.map((name) => [name, taggedVariables.has(name)])
  )
}

// A column shows when it's variable-visible AND (there's no tag filter OR it
// passes the tag filter).
export function computeColumnVisibility(inputs: ColumnVisibilityInputs) {
  const configurable = configurableVariables(inputs.variableNames)
  const fromVariables = visibilityFromVariables(configurable, inputs.visibility)
  const fromTags = visibilityFromTags(configurable, inputs)

  return Object.fromEntries(
    configurable.map((name) => [
      name,
      fromVariables[name] && (fromTags == null || fromTags[name]),
    ])
  )
}

function useVariableNames() {
  const { variables } = useTableMeta()
  return useMemo(() => Object.keys(variables), [variables])
}

export function useColumnVisibilityFromVariables() {
  const variableNames = useVariableNames()
  const visibility = useAppSelector(selectVariableVisibility)

  return useMemo(
    () =>
      visibilityFromVariables(configurableVariables(variableNames), visibility),
    [variableNames, visibility]
  )
}

export function useColumnVisibilityFromTags() {
  const { tags } = useTableMeta()
  const tagSelection = useAppSelector(selectTagSelection)
  const variableNames = useVariableNames()

  return useMemo(
    () =>
      visibilityFromTags(configurableVariables(variableNames), {
        tags,
        tagSelection,
      }),
    [variableNames, tags, tagSelection]
  )
}

export function useColumnVisibility() {
  const variableNames = useVariableNames()
  const visibility = useAppSelector(selectVariableVisibility)
  const { tags } = useTableMeta()
  const tagSelection = useAppSelector(selectTagSelection)

  return useMemo(
    () =>
      computeColumnVisibility({
        variableNames,
        visibility,
        tags,
        tagSelection,
      }),
    [variableNames, visibility, tags, tagSelection]
  )
}

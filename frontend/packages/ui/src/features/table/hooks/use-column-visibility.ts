import { useMemo } from 'react'

import type { Tag } from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { NONCONFIGURABLE_VARIABLES } from '#src/constants'
import {
  selectColumnVisibility,
  selectTagSelection,
} from '#src/features/table/stores/table.selectors'
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

// The visibility map for the configurable columns. A column the user has not
// touched shows, so only an explicit false hides one.
function visibilityFromVariables(
  configurable: string[],
  visibility: ColumnVisibilityInputs['visibility']
) {
  return Object.fromEntries(
    configurable.map((name) => [name, visibility[name] ?? true])
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
function combineVisibility(
  fromVariables: Record<string, boolean>,
  fromTags: Record<string, boolean> | null
) {
  return Object.fromEntries(
    Object.entries(fromVariables).map(([name, visible]) => [
      name,
      visible && (fromTags == null || fromTags[name]),
    ])
  )
}

export function computeColumnVisibility(inputs: ColumnVisibilityInputs) {
  const configurable = configurableVariables(inputs.variableNames)

  return combineVisibility(
    visibilityFromVariables(configurable, inputs.visibility),
    visibilityFromTags(configurable, inputs)
  )
}

export function useColumnVisibilityFromVariables() {
  const { variables } = useTableMeta()
  const visibility = useAppSelector(selectColumnVisibility)

  return useMemo(
    () =>
      visibilityFromVariables(
        configurableVariables(Object.keys(variables)),
        visibility
      ),
    [variables, visibility]
  )
}

export function useColumnVisibilityFromTags() {
  const { variables, tags } = useTableMeta()
  const tagSelection = useAppSelector(selectTagSelection)

  return useMemo(
    () =>
      visibilityFromTags(configurableVariables(Object.keys(variables)), {
        tags,
        tagSelection,
      }),
    [variables, tags, tagSelection]
  )
}

// Which columns the table actually shows. Named apart from the store's
// `columnVisibility`, which is only one of its two inputs.
export function useVisibleColumns() {
  const fromVariables = useColumnVisibilityFromVariables()
  const fromTags = useColumnVisibilityFromTags()

  return useMemo(
    () => combineVisibility(fromVariables, fromTags),
    [fromVariables, fromTags]
  )
}

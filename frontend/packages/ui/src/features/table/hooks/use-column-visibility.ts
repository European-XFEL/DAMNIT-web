import { useMemo } from 'react'

import type { RunId, Tag } from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { NONCONFIGURABLE_VARIABLES, VARIABLES } from '#src/constants'
import {
  selectColumnVisibility,
  selectTagSelection,
} from '#src/features/table/stores/table.selectors'
import { useAppSelector } from '#src/app/store/hooks'

export type ColumnVisibilityInputs = {
  variableNames: string[]
  visibility: Record<string, boolean | undefined>
  tags: Record<string, Tag>
  tagSelection: Record<string, boolean>
  runs: RunId[]
  proposal: string
}

// Columns the user can't hide (added_at, run) never appear here.
function configurableVariables(variableNames: string[]) {
  return variableNames.filter(
    (name) => !NONCONFIGURABLE_VARIABLES.includes(name)
  )
}

// Runs carry 6996 where the address may read 006996 or p6996.
function proposalKey(proposal: string) {
  return proposal.replace(/^p?0*/, '')
}

function holdsGuestRuns(runs: RunId[], proposal: string) {
  const opened = proposalKey(proposal)

  return runs.some((run) => run.proposal !== opened)
}

// A column the user has not touched shows, except Proposal while every run is
// the opened proposal's own.
function visibilityFromVariables(
  configurable: string[],
  {
    visibility,
    runs,
    proposal,
  }: Pick<ColumnVisibilityInputs, 'visibility' | 'runs' | 'proposal'>
) {
  const showsProposal = holdsGuestRuns(runs, proposal)

  return Object.fromEntries(
    configurable.map((name) => [
      name,
      visibility[name] ?? (name !== VARIABLES.proposal || showsProposal),
    ])
  )
}

// With no selected tags there's no tag filter (null). Proposal always passes:
// like run, it tells apart runs that share a number.
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
    configurable.map((name) => [
      name,
      name === VARIABLES.proposal || taggedVariables.has(name),
    ])
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
    visibilityFromVariables(configurable, inputs),
    visibilityFromTags(configurable, inputs)
  )
}

export function useColumnVisibilityFromVariables() {
  const { variables, runs } = useTableMeta()
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const visibility = useAppSelector(selectColumnVisibility)

  return useMemo(
    () =>
      visibilityFromVariables(configurableVariables(Object.keys(variables)), {
        visibility,
        runs,
        proposal,
      }),
    [variables, visibility, runs, proposal]
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

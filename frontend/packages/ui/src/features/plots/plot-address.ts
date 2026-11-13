import type { RunId, Variable } from '#src/data/table/table-data.types'
import type { PlotSource, PlotSpec } from '#src/types'

import { formatRunSelection, parseRunSelection, plotRunIds } from './utils'

const PLOT_SOURCES: PlotSource[] = ['summary', 'preview']

// A plot's kind and search, such as `summary?x=run&y=pulses&runs=1-20,25` or
// `preview?variable=detector_image&runs=5`. Its parts go in one order, so the
// same plot always gets the same address.
export function plotAddress({ source, variables, runs }: PlotSpec) {
  // `x` and `y` only ever name axes, so a preview can later take them for the
  // coordinates it plots against.
  const keys =
    source === 'summary'
      ? { x: variables[0], y: variables[1] }
      : { variable: variables[0] }
  const parts = Object.entries(keys).map(
    ([key, name]) => `${key}=${encodeURIComponent(name)}`
  )

  // Runs hold only digits, dashes and commas, so they go in unescaped and the
  // commas stay readable.
  if (runs !== undefined) {
    parts.push(`runs=${formatRunSelection(runs)}`)
  }

  return `${source}?${parts.join('&')}`
}

// Reads back what `plotAddress` writes, or names the part a link got wrong.
// It reads only the plot's own keys, so other flags on the address pass by.
export function parsePlotAddress(
  kind: string,
  search: URLSearchParams
): { plot: PlotSpec } | { error: string } {
  const source = PLOT_SOURCES.find((known) => known === kind)
  if (source === undefined) {
    return { error: `"${kind}" is not a kind of plot` }
  }

  const runsInput = search.get('runs')
  const selection =
    runsInput === null ? undefined : parseRunSelection(runsInput)
  if (selection !== undefined && 'error' in selection) {
    return { error: `The link's runs are unreadable: ${selection.error}` }
  }

  const runs = selection?.runs
  if (source === 'preview') {
    const variable = search.get('variable')
    if (!variable) {
      return { error: 'The link names no variable' }
    }

    // A preview of every run would fetch the whole proposal's images.
    if (runs === undefined) {
      return { error: 'The link names no runs' }
    }

    return { plot: { source, variables: [variable], runs } }
  }

  const y = search.get('y')
  if (!y) {
    return { error: 'The link names no y variable' }
  }

  const x = search.get('x')
  if (!x) {
    return { error: 'The link names no x variable' }
  }

  return { plot: { source, variables: [x, y], runs } }
}

type FindLinkErrorOptions = {
  variables: Record<string, Variable>
  runs: RunId[]
  proposal: string
}

// A well-formed link can still name what the proposal lacks. Some of its runs
// missing is fine, since the plot draws the ones that exist.
export function findLinkError(
  plot: PlotSpec,
  { variables, runs, proposal }: FindLinkErrorOptions
) {
  const missing = plot.variables.find((name) => !(name in variables))
  if (missing !== undefined) {
    return `The proposal has no variable "${missing}"`
  }

  if (
    plot.runs !== undefined &&
    plotRunIds(runs, { proposal, runs: plot.runs }).length === 0
  ) {
    return `The proposal has none of the runs ${formatRunSelection(plot.runs)}`
  }
}

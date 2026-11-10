import type { PlotSource, PlotSpec } from '#src/types'

import { formatRunSelection, parseRunSelection } from './utils'

type PlotContent = Omit<PlotSpec, 'name'>

const PLOT_SOURCES: PlotSource[] = ['summary', 'preview']

// A plot's kind and search, such as `summary?x=run&y=pulses&runs=1-20,25` or
// `preview?variable=detector_image&runs=5`. Its parts go in one order, so the
// same plot always gets the same address.
export function plotAddress({ source, variables, runs }: PlotContent) {
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
): { plot: PlotContent } | { error: string } {
  const source = PLOT_SOURCES.find((known) => known === kind)
  if (source === undefined) {
    return { error: `"${kind}" is not a kind of plot` }
  }

  let variables: string[]
  if (source === 'preview') {
    const variable = search.get('variable')
    if (!variable) {
      return { error: 'The link names no variable' }
    }
    variables = [variable]
  } else {
    const y = search.get('y')
    if (!y) {
      return { error: 'The link names no y variable' }
    }
    const x = search.get('x')
    if (!x) {
      return { error: 'The link names no x variable' }
    }
    variables = [x, y]
  }

  const runsInput = search.get('runs')
  if (runsInput === null) {
    return { plot: { source, variables } }
  }

  const selection = parseRunSelection(runsInput)
  if ('error' in selection) {
    return { error: `The link's runs are unreadable: ${selection.error}` }
  }

  return { plot: { source, variables, runs: selection.runs } }
}

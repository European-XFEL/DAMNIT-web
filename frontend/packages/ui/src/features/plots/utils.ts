import { getTitleByName } from '#src/data/table/table-data.transforms'
import type { RunId, Variable } from '#src/data/table/table-data.types'
import type { PlotSpec } from '#src/types'
import { sorted } from '#src/utils/array'

// "Pulses vs. Run" for a summary, "Detector image" for a preview. A variable
// with no title goes by its name.
export function plotName(
  { source, variables }: PlotSpec,
  variableMeta: Record<string, Variable>
) {
  const titleOf = (name: string) => getTitleByName(variableMeta, name)

  return source === 'summary'
    ? `${titleOf(variables[1])} vs. ${titleOf(variables[0])}`
    : titleOf(variables[0])
}

// A single run reads as a range of one.
const RUN_OR_RANGE = /^(\d+)(?:\s*-\s*(\d+))?$/

// Wider than any proposal's runs, so a range or a selection past it is a typo
// like one zero too many, which would otherwise hang the tab building the list.
const MAX_RUNS = 10_000

// Reads the dialog's run selection: a comma-separated list of runs and ranges,
// as the field's hint spells out ("3, 7, 10-20").
export function parseRunSelection(
  input: string
): { runs: string[] } | { error: string } {
  const runs = new Set<number>()

  for (const rawEntry of input.split(',')) {
    const entry = rawEntry.trim()
    if (entry === '') {
      continue
    }

    const match = RUN_OR_RANGE.exec(entry)
    if (match === null) {
      return { error: `"${entry}" is not a run or a range` }
    }

    const first = Number(match[1])
    const last = Number(match[2] ?? match[1])
    const bottom = Math.min(first, last)
    const top = Math.max(first, last)
    // Past the largest safe integer, `run++` stops counting and never ends.
    if (!Number.isSafeInteger(top)) {
      return { error: `"${entry}" is not a run or a range` }
    }
    if (top - bottom >= MAX_RUNS) {
      return { error: `"${entry}" spans more than ${MAX_RUNS} runs` }
    }

    for (let run = bottom; run <= top; run++) {
      runs.add(run)
    }
    if (runs.size > MAX_RUNS) {
      return { error: `The selection holds more than ${MAX_RUNS} runs` }
    }
  }

  if (runs.size === 0) {
    return { error: 'Enter at least one run' }
  }

  return {
    runs: sorted([...runs]).map(String),
  }
}

// Writes runs in the form `parseRunSelection` reads, with each row of
// consecutive runs as one range: 1-20,25.
export function formatRunSelection(runs: string[]) {
  const ranges: { first: number; last: number }[] = []

  for (const run of sorted([...new Set(runs.map(Number))])) {
    const range = ranges.at(-1)
    if (range !== undefined && run === range.last + 1) {
      range.last = run
    } else {
      ranges.push({ first: run, last: run })
    }
  }

  return ranges
    .map(({ first, last }) =>
      first === last ? `${first}` : `${first}-${last}`
    )
    .join(',')
}

type PlotRunIdsOptions = {
  proposal: string
  runs?: string[]
}

// The runs a plot charts, in server order. A plot names runs by number only,
// so a guest proposal sharing a number is left out: charting a guest run needs
// identity all the way down to `extracted_data`, which previews lack.
export function plotRunIds(
  allRuns: RunId[],
  { proposal, runs }: PlotRunIdsOptions
) {
  if (runs === undefined) {
    return allRuns
  }

  const wanted = new Set(runs)

  return allRuns.filter(
    (run) => run.proposal === proposal && wanted.has(String(run.run))
  )
}

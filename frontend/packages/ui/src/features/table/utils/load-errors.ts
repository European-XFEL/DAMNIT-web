import { upperFirst } from 'lodash'

import type { RunId } from '#src/data/table/table-data.types'
import type {
  LoadErrors,
  RowRange,
} from '#src/features/table/types/table.types'

// The runs of one proposal that a failed stretch of rows starts and ends on.
type RunRange = {
  proposal: string
  first: number
  last: number
}

// "1 to 10, 41 to 50 and 91 to 100", with no comma before the "and".
const listFormat = new Intl.ListFormat('en-GB')

// What the run count's bubble says about the failed rows, or null when no run
// failed. Rows come first: their values show once the rows land anyway.
export function describeLoadErrors(errors: LoadErrors, runs: RunId[]) {
  const rows = runRanges(errors.rows, runs)
  const rowsFailed = rows.length > 0
  const failed = rowsFailed ? rows : runRanges(errors.values, runs)
  if (failed.length === 0) {
    return null
  }

  // The proposal column starts hidden, so a guest's run 1 needs its proposal.
  const hasGuests = runs.some(({ proposal }) => proposal !== runs[0].proposal)
  const text = byProposal(failed)
    .map((ranges) =>
      hasGuests
        ? `proposal ${ranges[0].proposal} ${formatRuns(ranges)}`
        : formatRuns(ranges)
    )
    .join('; ')

  return {
    name: rowsFailed ? "Some runs didn't load" : "Some values didn't load",
    runs: `${upperFirst(text)}.`,
  }
}

// A page past the last run holds none, and pages side by side read as one
// stretch, cut where the proposal changes.
function runRanges(ranges: RowRange[], runs: RunId[]) {
  const clipped = ranges
    .map(({ first, last }) => ({
      first,
      last: Math.min(last, runs.length - 1),
    }))
    .filter(({ first, last }) => first <= last)
    .sort((a, b) => a.first - b.first)

  const merged: RowRange[] = []
  for (const range of clipped) {
    const previous = merged.at(-1)
    if (previous && range.first <= previous.last + 1) {
      previous.last = Math.max(previous.last, range.last)
      continue
    }

    merged.push({ ...range })
  }

  return merged.flatMap((range) => splitByProposal(range, runs))
}

function splitByProposal({ first, last }: RowRange, runs: RunId[]) {
  const ranges: RunRange[] = []
  let start = first
  for (let row = first + 1; row <= last + 1; row++) {
    if (row <= last && runs[row].proposal === runs[start].proposal) {
      continue
    }

    ranges.push({
      proposal: runs[start].proposal,
      first: runs[start].run,
      last: runs[row - 1].run,
    })
    start = row
  }

  return ranges
}

// The table keeps each proposal's runs together, so its ranges sit side by side.
function byProposal(ranges: RunRange[]) {
  const groups: RunRange[][] = []
  for (const range of ranges) {
    const group = groups.at(-1)
    if (group?.[0].proposal === range.proposal) {
      group.push(range)
      continue
    }

    groups.push([range])
  }

  return groups
}

// "runs 1 to 10 and 41", or "run 5" for a single run.
function formatRuns(ranges: RunRange[]) {
  const single = ranges.length === 1 && ranges[0].first === ranges[0].last

  return `${single ? 'run' : 'runs'} ${listFormat.format(ranges.map(formatRange))}`
}

function formatRange({ first, last }: RunRange) {
  return first === last ? String(first) : `${first} to ${last}`
}

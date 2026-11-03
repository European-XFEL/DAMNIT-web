import { sorted } from '#src/utils/array'

// A single run reads as a range of one.
const RUN_OR_RANGE = /^(\d+)(?:\s*-\s*(\d+))?$/

// Wider than any proposal's runs, so a range past it is a typo like one zero
// too many, which would otherwise hang the tab building the list.
const MAX_RANGE_RUNS = 10_000

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
    if (top - bottom >= MAX_RANGE_RUNS) {
      return { error: `"${entry}" spans more than ${MAX_RANGE_RUNS} runs` }
    }

    for (let run = bottom; run <= top; run++) {
      runs.add(run)
    }
  }

  if (runs.size === 0) {
    return { error: 'Enter at least one run' }
  }

  return {
    runs: sorted([...runs]).map(String),
  }
}

import { runKey } from '#src/data/table/table-data.transforms'
import type { RunCells } from '#src/data/table/table-data.types'

import {
  type PlotMeta,
  type PlotTrace,
  type PreviewScalar,
  type PreviewValue,
} from './plots.types'

// extracted_data is a JSON scalar, so `value.data` arrives as unknown and its
// shape is only knowable from `dtype`. Each branch narrows it to what Plot
// expects for that kind of trace.
export function toPlotTrace(
  value: PreviewValue,
  { run }: { run: string }
): PlotTrace {
  switch (value.dtype) {
    case 'array1d': {
      const dim = value.dims[0]
      return {
        x: { name: dim, value: value.coords[dim] },
        y: { name: `Run ${run}`, value: value.data as number[] },
      }
    }
    case 'array2d': {
      const [y, x] = value.dims.map((axis) => ({
        name: axis,
        value: value.coords[axis],
      }))
      return {
        x,
        y,
        z: { name: `Run ${run}`, value: value.data as number[][] },
      }
    }
    default:
      // Everything left plots as a bare value. A new array dtype has to be
      // given its own branch above before it builds.
      value satisfies PreviewScalar
      return { data: { name: `Run ${run}`, value: value.data } }
  }
}

export function toPlotMeta(value: PreviewValue): PlotMeta {
  const meta: PlotMeta = { type: 'unsupported' }

  switch (value.dtype) {
    case 'array1d':
      meta.x = { name: value.dims[0] }
      meta.y = { name: value.name }
      meta.type = 'scatter'
      break
    case 'array2d':
      meta.type = 'heatmap'
      break
    case 'image':
      meta.type = 'image'
      break
    case 'number':
    case 'string':
    case 'boolean':
    case 'timestamp':
      meta.type = 'scalar'
      break
    case 'none':
      // A run the variable has no value for, or one the backend could not type.
      // There is nothing to draw either way.
      break
    default:
      // A new dtype has to be drawn here before it builds. An unknown one at
      // runtime means a mismatched API, and stays unsupported.
      value satisfies never
  }

  // Only the attributes the plot declares. `attrs` also carries whatever the
  // context file left on the array, and spreading it whole put a single run's
  // arbitrary metadata on a plot that draws every run.
  const { shape, colormap_range: colormapRange } = value.attrs ?? {}

  return {
    ...(shape ? { shape } : {}),
    ...(colormapRange ? { colormap_range: colormapRange } : {}),
    ...meta,
  }
}

// Times recorded under another `key`, a proposal and variable, start over.
export type RecordedTimes = {
  key: string
  times: ReadonlyMap<number, { time: number; value: PreviewValue }>
}

type RecordComputedTimesOptions = {
  proposal: string
  variable: string
  drawn: { run: number; value: PreviewValue }[]
  cells: Map<string, RunCells>
}

function cellTime(
  cells: Map<string, RunCells>,
  {
    proposal,
    variable,
    run,
  }: { proposal: string; variable: string; run: number }
) {
  return cells.get(runKey({ proposal, run }))?.get(variable)?.computed_at
}

// A run's time is recorded when its data and its cell are both in, and kept until
// new data replaces the drawn one: a push moves the cell on, not the drawing.
export function recordComputedTimes(
  recorded: RecordedTimes,
  { proposal, variable, drawn, cells }: RecordComputedTimesOptions
): RecordedTimes {
  const key = `${proposal}:${variable}`
  const kept: RecordedTimes['times'] =
    recorded.key === key ? recorded.times : new Map()
  const times = new Map(kept)
  let changed = recorded.key !== key

  for (const { run, value } of drawn) {
    // A preview value is a JSON scalar: Apollo hands back the object it stored,
    // even when it builds a read anew, so only a write makes a new one.
    if (kept.get(run)?.value === value) {
      continue
    }

    const time = cellTime(cells, { proposal, variable, run })
    if (time != null) {
      times.set(run, { time, value })
      changed = true
    } else if (times.delete(run)) {
      changed = true
    }
  }

  return changed ? { key, times } : recorded
}

export function newestRecordedTime(
  recorded: RecordedTimes,
  drawn: { run: number }[]
): number | null {
  let newest: number | null = null
  for (const { run } of drawn) {
    const time = recorded.times.get(run)?.time
    if (time !== undefined && (newest === null || time > newest)) {
      newest = time
    }
  }

  return newest
}

// The drawn runs, in run order, whose cell has moved past the time recorded
// with the data the plot draws.
export function outdatedRuns(
  recorded: RecordedTimes,
  { proposal, variable, drawn, cells }: RecordComputedTimesOptions
): number[] {
  return drawn.flatMap(({ run }) => {
    const recordedTime = recorded.times.get(run)?.time
    const time = cellTime(cells, { proposal, variable, run })

    return recordedTime != null && time != null && time > recordedTime
      ? [run]
      : []
  })
}

type RecordReloadedTimesOptions = {
  proposal: string
  variable: string
  reloaded: { run: number; value: PreviewValue }[]
  cellsAtPress: Map<string, RunCells>
}

// Dates reloaded runs from their cells as they stood when Reload was pressed,
// even when the data came back equal: a push since then is newer than the answer.
export function recordReloadedTimes(
  recorded: RecordedTimes,
  { proposal, variable, reloaded, cellsAtPress }: RecordReloadedTimesOptions
): RecordedTimes {
  if (recorded.key !== `${proposal}:${variable}`) {
    return recorded
  }

  const times = new Map(recorded.times)
  let changed = false
  for (const { run, value } of reloaded) {
    const time = cellTime(cellsAtPress, { proposal, variable, run })
    if (time == null) {
      continue
    }

    times.set(run, { time, value })
    changed = true
  }

  return changed ? { key: recorded.key, times } : recorded
}

// "1 to 3, 5 and 9", with no comma before the "and", as the run count joins
// its runs.
const listFormat = new Intl.ListFormat('en-GB')

export function describeOutdatedRuns(runs: number[]) {
  const ranges: { first: number; last: number }[] = []
  for (const run of runs) {
    const previous = ranges.at(-1)
    if (previous && run === previous.last + 1) {
      previous.last = run
      continue
    }

    ranges.push({ first: run, last: run })
  }

  const single = runs.length === 1
  const list = listFormat.format(
    ranges.map(({ first, last }) =>
      first === last ? String(first) : `${first} to ${last}`
    )
  )

  return single
    ? `Run ${list} has newer data.`
    : `Runs ${list} have newer data.`
}

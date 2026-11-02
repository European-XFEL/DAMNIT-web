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
    if (kept.get(run)?.value === value) {
      continue
    }

    const time = cells
      .get(runKey({ proposal, run }))
      ?.get(variable)?.computed_at
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

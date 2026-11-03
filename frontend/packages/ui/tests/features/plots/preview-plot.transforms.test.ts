import { expect, test } from 'vitest'

import { indexRunCells } from '#src/data/table/table-data.transforms'
import {
  describeOutdatedRuns,
  outdatedRuns,
  recordReloadedTimes,
  toPlotMeta,
  toPlotTrace,
  type RecordedTimes,
} from '#src/features/plots/preview-plot.transforms'
import { type PreviewValue } from '#src/features/plots/plots.types'
import { serverCell } from '#tests/support/cells'

// The backend names a 2-D array's dims [y, x], so these coords are far enough
// apart to tell a swapped axis from a correct one.
const twoDimensional: PreviewValue = {
  dtype: 'array2d',
  name: 'scan',
  data: [
    [1, 2],
    [3, 4],
  ],
  dims: ['y', 'x'],
  coords: { y: [10, 11], x: [20, 21] },
}

// Mirrors data/1/xgm_intensity.json: the backend keeps the DataArray's own
// source name and only falls back to the variable name when it has none.
const oneDimensional: PreviewValue = {
  dtype: 'array1d',
  name: 'SA2_XTD1_XGM_XGM_DOOCS:output.data.intensityTD',
  data: [1, 2, 3],
  dims: ['pulseIndex'],
  coords: { pulseIndex: [0, 1, 2] },
  attrs: { shape: [3] },
}

test('a 2-D preview keeps only the shape and colormap range from attrs', () => {
  // `attrs` also carries whatever the context file left on the array. Spreading
  // it whole put one run's own metadata on a plot that draws every run.
  const meta = toPlotMeta({
    ...twoDimensional,
    attrs: { shape: [2, 2], colormap_range: [0, 4], sample_id: 'run-7-only' },
  })

  expect(meta).toEqual({
    type: 'heatmap',
    shape: [2, 2],
    colormap_range: [0, 4],
  })
})

test('a 1-D preview names its x axis from the dim and its y from the source', () => {
  expect(toPlotMeta(oneDimensional)).toEqual({
    type: 'scatter',
    shape: [3],
    x: { name: 'pulseIndex' },
    y: { name: 'SA2_XTD1_XGM_XGM_DOOCS:output.data.intensityTD' },
  })
})

test('an image preview keeps the shape the picture is drawn at', () => {
  // Every dtype passes `shape` through; the image is the only one drawn at it.
  const meta = toPlotMeta({
    dtype: 'image',
    name: 'xpcs_saxs_plot',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjq',
    attrs: { shape: [480, 640] },
  })

  expect(meta).toEqual({ type: 'image', shape: [480, 640] })
})

test('a preview with no value has nothing to draw', () => {
  // `none` covers both a variable this run has no value for and one the backend
  // could not type. Neither can be plotted, so the type is left as it started.
  expect(toPlotMeta({ dtype: 'none', name: 'flag', data: null }).type).toBe(
    'unsupported'
  )
})

test('a 2-D preview maps the first dim to y and the second to x', () => {
  const trace = toPlotTrace(twoDimensional, { run: '7' })

  expect(trace.x).toEqual({ name: 'x', value: [20, 21] })
  expect(trace.y).toEqual({ name: 'y', value: [10, 11] })
  expect(trace.z).toEqual({
    name: 'Run 7',
    value: [
      [1, 2],
      [3, 4],
    ],
  })
})

test('a 1-D preview plots its own dim against the run values', () => {
  const trace = toPlotTrace(oneDimensional, { run: '7' })

  expect(trace.x).toEqual({ name: 'pulseIndex', value: [0, 1, 2] })
  expect(trace.y).toEqual({ name: 'Run 7', value: [1, 2, 3] })
})

const PROPOSAL = '6996'
const VARIABLE = 'spectrum'
const KEY = `${PROPOSAL}:${VARIABLE}`

const drawnRuns = (runs: number[]) =>
  runs.map((run) => ({ run, value: oneDimensional }))

const recordedAt = (times: Record<number, number>): RecordedTimes => ({
  key: KEY,
  times: new Map(
    Object.entries(times).map(([run, time]) => [
      Number(run),
      { time, value: oneDimensional },
    ])
  ),
})

const cellsAt = (times: Record<number, number | null>) =>
  indexRunCells(
    Object.entries(times).map(([run, time]) => ({
      database: PROPOSAL,
      proposal: PROPOSAL,
      run: Number(run),
      cells: [
        {
          ...serverCell({
            database: PROPOSAL,
            proposal: PROPOSAL,
            run: Number(run),
            name: VARIABLE,
            value: null,
            dtype: 'array',
          }),
          computed_at: time,
        },
      ],
    }))
  )

test('the outdated runs are the drawn ones whose cell moved past their recorded time, in run order', () => {
  const outdated = outdatedRuns(recordedAt({ 2: 10, 5: 10, 9: 10 }), {
    proposal: PROPOSAL,
    variable: VARIABLE,
    drawn: drawnRuns([2, 5, 9]),
    cells: cellsAt({ 2: 20, 5: 10, 9: 30 }),
  })

  expect(outdated).toEqual([2, 9])
})

test('a run not drawn, or with no recorded time or cell time, is never outdated', () => {
  const outdated = outdatedRuns(recordedAt({ 1: 10, 3: 10 }), {
    proposal: PROPOSAL,
    variable: VARIABLE,
    drawn: drawnRuns([1, 2]),
    cells: cellsAt({ 1: null, 2: 20, 3: 20 }),
  })

  expect(outdated).toEqual([])
})

test('a reloaded run is dated from its cell at the press, even when its data came back the same', () => {
  const recorded = recordedAt({ 1: 10, 2: 20 })

  const next = recordReloadedTimes(recorded, {
    proposal: PROPOSAL,
    variable: VARIABLE,
    reloaded: drawnRuns([1]),
    cellsAtPress: cellsAt({ 1: 30, 2: 40 }),
  })

  expect(next.times.get(1)?.time).toBe(30)
  expect(next.times.get(2)?.time).toBe(20)
})

test('a reloaded run with no cell time keeps its recorded time', () => {
  const recorded = recordedAt({ 1: 10 })

  expect(
    recordReloadedTimes(recorded, {
      proposal: PROPOSAL,
      variable: VARIABLE,
      reloaded: drawnRuns([1]),
      cellsAtPress: cellsAt({ 1: null }),
    })
  ).toBe(recorded)
})

test('reloaded runs of another variable leave the recorded times alone', () => {
  const recorded = recordedAt({ 1: 10 })

  expect(
    recordReloadedTimes(recorded, {
      proposal: PROPOSAL,
      variable: 'energy',
      reloaded: drawnRuns([1]),
      cellsAtPress: cellsAt({ 1: 30 }),
    })
  ).toBe(recorded)
})

test('one outdated run is named alone', () => {
  expect(describeOutdatedRuns([2])).toBe('Run 2 has newer data.')
})

test('several outdated runs are joined with no comma before the "and"', () => {
  expect(describeOutdatedRuns([2, 5, 9])).toBe(
    'Runs 2, 5 and 9 have newer data.'
  )
})

test('outdated runs in a row are named as a range', () => {
  expect(describeOutdatedRuns([1, 2, 3, 5, 9])).toBe(
    'Runs 1 to 3, 5 and 9 have newer data.'
  )
})

import { expect, test } from 'vitest'

import { indexRunCells } from '#src/data/table/table-data.transforms'
import type { CellValue, Run } from '#src/data/table/table-data.types'
import { newestComputedTime } from '#src/features/plots/summary-plot.transforms'

const PROPOSAL = '6996'

function at(minute: number) {
  return Date.UTC(2026, 9, 19, 12, minute)
}

type CellOptions = {
  computedAt: number | null
  value?: CellValue
  dtype?: string
  failed?: boolean
}

function run(number: number, cells: Record<string, CellOptions>): Run {
  return {
    database: PROPOSAL,
    proposal: PROPOSAL,
    run: number,
    cells: Object.entries(cells).map(
      ([
        name,
        { computedAt, value = 1, dtype = 'number', failed = false },
      ]) => ({
        id: `${PROPOSAL}:${number}:${name}`,
        name,
        error: failed ? { cls: 'ValueError', message: 'boom' } : null,
        computed_at: computedAt,
        summary: { value: failed ? null : value, dtype },
      })
    ),
  }
}

function newestDrawnTime(runs: Run[], variables: string[]) {
  return newestComputedTime({
    cells: indexRunCells(runs),
    runIds: runs.map(({ proposal, run }) => ({ proposal, run })),
    variables,
  })
}

test('a summary plot dates its data by the newest drawn value on either axis', () => {
  const runs = [
    run(1, { energy: { computedAt: at(1) }, intensity: { computedAt: at(4) } }),
    run(2, { energy: { computedAt: at(3) }, intensity: { computedAt: at(2) } }),
  ]

  expect(newestDrawnTime(runs, ['energy', 'intensity'])).toBe(at(4))
  expect(newestDrawnTime(runs, ['intensity', 'energy'])).toBe(at(4))
})

test('a summary plot leaves a run with a failed value out of its data age', () => {
  const runs = [
    run(1, { energy: { computedAt: at(1) }, intensity: { computedAt: at(2) } }),
    run(2, {
      energy: { computedAt: at(5) },
      intensity: { computedAt: at(5), failed: true },
    }),
  ]

  expect(newestDrawnTime(runs, ['energy', 'intensity'])).toBe(at(2))
})

test('a summary plot leaves a run with a value that is not a number out of its data age', () => {
  const runs = [
    run(1, { energy: { computedAt: at(1) }, intensity: { computedAt: at(2) } }),
    run(2, {
      energy: { computedAt: at(5) },
      intensity: { computedAt: at(5), value: 'saturated', dtype: 'string' },
    }),
  ]

  expect(newestDrawnTime(runs, ['energy', 'intensity'])).toBe(at(2))
})

test('a summary plot leaves runs outside its selection out of its data age', () => {
  const cells = indexRunCells([
    run(1, { energy: { computedAt: at(1) }, intensity: { computedAt: at(2) } }),
    run(2, { energy: { computedAt: at(5) }, intensity: { computedAt: at(5) } }),
  ])

  const newest = newestComputedTime({
    cells,
    runIds: [{ proposal: PROPOSAL, run: 1 }],
    variables: ['energy', 'intensity'],
  })

  expect(newest).toBe(at(2))
})

test('a summary plot against run dates its data by the other axis', () => {
  // DAMNIT never computes `run`, so its cells carry no time.
  const runs = [
    run(1, { run: { computedAt: null }, energy: { computedAt: at(1) } }),
    run(2, { run: { computedAt: null }, energy: { computedAt: at(3) } }),
  ]

  expect(newestDrawnTime(runs, ['run', 'energy'])).toBe(at(3))
})

test('a summary plot whose drawn values carry no time has no data age', () => {
  const runs = [
    run(1, { run: { computedAt: null }, energy: { computedAt: null } }),
  ]

  expect(newestDrawnTime(runs, ['run', 'energy'])).toBeNull()
})

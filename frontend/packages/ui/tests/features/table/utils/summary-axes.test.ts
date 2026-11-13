import { expect, test } from 'vitest'

import { summaryAxes } from '#src/features/table/utils/summary-axes'

const columnsById = new Map(
  [
    { id: 'run', title: 'Run' },
    { id: 'n_trains', title: 'Trains' },
    { id: 'xgm_intensity', title: 'XGM intensity' },
    { id: 'hit_rate', title: 'Hit rate' },
  ].map((column) => [column.id, column])
)

const titles = (axes: ReturnType<typeof summaryAxes>) =>
  axes && { x: axes.x.title, y: axes.y.title }

test('plots a lone selected column against Run', () => {
  const axes = summaryAxes({
    variable: 'hit_rate',
    selectedVariables: ['hit_rate'],
    columnsById,
  })

  expect(titles(axes)).toEqual({ x: 'Run', y: 'Hit rate' })
})

test('plots the right-clicked column against the other selected one', () => {
  const axes = summaryAxes({
    variable: 'hit_rate',
    selectedVariables: ['xgm_intensity', 'hit_rate'],
    columnsById,
  })

  expect(titles(axes)).toEqual({ x: 'XGM intensity', y: 'Hit rate' })
})

test('offers no plot when three columns are selected', () => {
  const axes = summaryAxes({
    variable: 'hit_rate',
    selectedVariables: ['n_trains', 'xgm_intensity', 'hit_rate'],
    columnsById,
  })

  expect(axes).toBeUndefined()
})

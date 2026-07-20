import { describe, expect, test } from 'vitest'

import reducer, {
  addPlot,
  removePlot,
  setCurrentPlot,
} from '#src/features/plots/plots.slice'
import { type PlotSpec } from '#src/types'

const plot = (variables: string[]): PlotSpec => ({
  variables,
  runs: [],
  source: 'summary',
})

describe('addPlot', () => {
  test('adds the plot under a fresh id and makes it current', () => {
    const state = reducer(undefined, addPlot(plot(['a'])))
    const id = state.currentPlot
    expect(id).not.toBeNull()
    expect(state.data[id as string]).toEqual(plot(['a']))
  })
})

describe('setCurrentPlot', () => {
  test('switches to an existing plot and ignores unknown ids', () => {
    let state = reducer(undefined, addPlot(plot(['a'])))
    const first = state.currentPlot as string
    state = reducer(state, addPlot(plot(['b'])))

    state = reducer(state, setCurrentPlot(first))
    expect(state.currentPlot).toBe(first)

    state = reducer(state, setCurrentPlot('does-not-exist'))
    expect(state.currentPlot).toBe(first)
  })
})

describe('removePlot', () => {
  test('reassigns current to the last remaining plot', () => {
    let state = reducer(undefined, addPlot(plot(['a'])))
    const first = state.currentPlot as string
    state = reducer(state, addPlot(plot(['b'])))
    const second = state.currentPlot as string

    state = reducer(state, removePlot(second))
    expect(Object.keys(state.data)).toEqual([first])
    expect(state.currentPlot).toBe(first)
  })

  test('removing the only plot clears current and empties the data', () => {
    let state = reducer(undefined, addPlot(plot(['a'])))
    const only = state.currentPlot as string

    state = reducer(state, removePlot(only))
    expect(state.data).toEqual({})
    expect(state.currentPlot).toBeNull()
  })
})

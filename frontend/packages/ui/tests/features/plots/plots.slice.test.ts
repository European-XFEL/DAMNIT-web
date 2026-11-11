import { expect, test } from 'vitest'

import { plotRequested } from '#src/app/store/actions'
import reducer, { type ListedPlot } from '#src/features/plots/plots.slice'

const trains: ListedPlot = {
  variables: ['run', 'n_trains'],
  source: 'summary',
  name: 'Trains vs. Run',
}

test('the same plot asked for twice is listed once, under its address', () => {
  let state = reducer(undefined, plotRequested(trains))

  state = reducer(state, plotRequested(trains))

  expect(Object.keys(state.data)).toEqual(['summary?x=run&y=n_trains'])
})

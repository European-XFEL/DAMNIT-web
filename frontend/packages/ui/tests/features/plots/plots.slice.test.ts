import { expect, test } from 'vitest'

import reducer, {
  addPlot,
  type ListedPlot,
} from '#src/features/plots/plots.slice'

const trains: ListedPlot = {
  variables: ['run', 'n_trains'],
  source: 'summary',
  name: 'Trains vs. Run',
}

test('the same plot added twice is listed once, under its address', () => {
  let state = reducer(undefined, addPlot(trains))

  state = reducer(state, addPlot(trains))

  expect(Object.keys(state.data)).toEqual(['summary?x=run&y=n_trains'])
})

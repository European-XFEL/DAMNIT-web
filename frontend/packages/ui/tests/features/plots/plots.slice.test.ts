import { expect, test } from 'vitest'

import { plotRequested } from '#src/app/store/actions'
import reducer from '#src/features/plots/plots.slice'
import { type PlotSpec } from '#src/types'

const trains: PlotSpec = {
  variables: ['run', 'n_trains'],
  source: 'summary',
  name: 'Trains vs. Run',
}

test('the same plot added twice opens twice', () => {
  let state = reducer(undefined, plotRequested(trains))

  state = reducer(state, plotRequested(trains))

  expect(Object.keys(state.data)).toHaveLength(2)
})

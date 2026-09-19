import { expect, test } from 'vitest'

import { plotRequested } from '#src/app/store/actions'
import reducer, {
  mobileNavToggled,
  viewSelected,
} from '#src/features/dashboard/stores/dashboard.slice'
import { removePlot } from '#src/features/plots/plots.slice'

const trains = plotRequested({
  variables: ['run', 'n_trains'],
  source: 'summary',
  name: 'Trains vs. Run',
})

test('picking a view or making a plot closes the mobile nav', () => {
  const opened = reducer(undefined, mobileNavToggled())

  // The view already on show still closes it
  let state = reducer(opened, viewSelected({ kind: 'table' }))
  expect(state.nav.mobileOpened).toBe(false)

  // A new plot
  state = reducer(opened, trains)
  expect(state.nav.mobileOpened).toBe(false)
})

test('closing a plot leaves the mobile nav open', () => {
  let state = reducer(undefined, trains)
  state = reducer(state, mobileNavToggled())

  state = reducer(state, removePlot(trains.payload.id))

  expect(state.activeView).toEqual({ kind: 'table' })
  expect(state.nav.mobileOpened).toBe(true)
})

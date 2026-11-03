import { expect, test } from 'vitest'

import { plotRequested } from '#src/app/store/actions'
import { setupStore, type AppStore } from '#src/app/store/store'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'
import { viewSelected } from '#src/features/dashboard/stores/dashboard.slice'
import { removePlot } from '#src/features/plots/plots.slice'
import { type PlotSpec } from '#src/types'

const summary: PlotSpec = {
  variables: ['run', 'n_trains'],
  source: 'summary',
  name: 'Trains vs. Run',
}

function openPlot(store: AppStore) {
  const added = plotRequested(summary)
  store.dispatch(added)
  return added.payload.id
}

test('a new plot becomes the view', () => {
  const store = setupStore()

  const id = openPlot(store)

  expect(selectActiveView(store.getState())).toEqual({ kind: 'plot', id })
})

test('closing the shown plot returns to the view before it', () => {
  const store = setupStore()
  store.dispatch(viewSelected({ kind: 'context-file' }))
  const id = openPlot(store)

  store.dispatch(removePlot(id))

  expect(selectActiveView(store.getState())).toEqual({
    kind: 'context-file',
  })
})

test('closing a plot picked again returns to the view before it', () => {
  const store = setupStore()
  store.dispatch(viewSelected({ kind: 'context-file' }))
  const id = openPlot(store)
  store.dispatch(viewSelected({ kind: 'plot', id }))

  store.dispatch(removePlot(id))

  expect(selectActiveView(store.getState())).toEqual({
    kind: 'context-file',
  })
})

test('closing the second plot returns to the first', () => {
  const store = setupStore()
  const first = openPlot(store)
  const second = openPlot(store)

  store.dispatch(removePlot(second))

  expect(selectActiveView(store.getState())).toEqual({
    kind: 'plot',
    id: first,
  })
})

test('closing the shown plot falls back to the table when the view before it is closed too', () => {
  const store = setupStore()
  const first = openPlot(store)
  const second = openPlot(store)
  store.dispatch(viewSelected({ kind: 'plot', id: first }))
  store.dispatch(removePlot(second))

  store.dispatch(removePlot(first))

  expect(selectActiveView(store.getState())).toEqual({ kind: 'table' })
})

test('closing a plot in the background leaves the view alone', () => {
  const store = setupStore()
  const first = openPlot(store)
  const second = openPlot(store)

  store.dispatch(removePlot(first))

  expect(selectActiveView(store.getState())).toEqual({
    kind: 'plot',
    id: second,
  })
})

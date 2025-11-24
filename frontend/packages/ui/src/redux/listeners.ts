import { createListenerMiddleware } from '@reduxjs/toolkit'

import { addTab, removeTab, openAside, closeAside } from '../features/dashboard'
import { addPlot, removePlot, resetPlots } from '../features/plots'
import { selectRun } from '../features/table'
import { type RootState } from './reducer'
import { isEmpty } from '../utils/helpers'

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  actionCreator: selectRun,
  effect: (action, { dispatch }) => {
    const { run } = action.payload

    const sideEffect = run != null ? openAside : closeAside
    dispatch(sideEffect())
  },
})

listenerMiddleware.startListening({
  actionCreator: addPlot,
  effect: (_, { dispatch }) => {
    dispatch(addTab({ id: 'plots', title: 'Plots', isClosable: true }))
  },
})

listenerMiddleware.startListening({
  actionCreator: removePlot,
  effect: (_, { dispatch, getState }) => {
    const { plots } = getState() as RootState
    if (isEmpty(plots.data)) {
      dispatch(removeTab('plots'))
    }
  },
})

listenerMiddleware.startListening({
  actionCreator: removeTab,
  effect: (_, { dispatch }) => {
    dispatch(resetPlots())
  },
})

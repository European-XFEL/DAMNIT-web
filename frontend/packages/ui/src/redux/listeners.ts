import { createListenerMiddleware } from '@reduxjs/toolkit'

import { openAside, closeAside } from '../features/dashboard'
import { selectRun } from '../features/table'

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  actionCreator: selectRun,
  effect: (action, { dispatch }) => {
    const { run } = action.payload

    const sideEffect = run != null ? openAside : closeAside
    dispatch(sideEffect())
  },
})

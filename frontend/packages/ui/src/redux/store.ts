import { configureStore } from '@reduxjs/toolkit'

import { listenerMiddleware } from './listeners'
import reducer, { type RootState } from './reducer'
import { authApi } from '../auth'
import { contextfileApi } from '../features/context-file/context-file.api'

export const setupStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(authApi.middleware, contextfileApi.middleware),
    preloadedState,
  })
}

export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']

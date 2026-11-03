import { configureStore } from '@reduxjs/toolkit'

import { authApi } from '#src/features/auth/auth.api'
import { contextfileApi } from '#src/features/context-file/context-file.api'

import { listenerMiddleware } from './listener-middleware'
import { registerAppListeners } from './listeners'
import reducer, { type RootState } from './reducer'

registerAppListeners()

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

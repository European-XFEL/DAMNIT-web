import { createListenerMiddleware } from '@reduxjs/toolkit'

import type { RootState } from './reducer'
import type { AppDispatch } from './store'

export const listenerMiddleware = createListenerMiddleware()

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>()

import { configureStore } from "@reduxjs/toolkit"

import { listenerMiddleware } from "./listeners"
import reducer, { RootState } from "./reducer"
import { authApi } from "../auth"
import { metadataApi } from "../data/metadata"
import { fileApi } from "../features/editor/editor.api"

export const setupStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(authApi.middleware, metadataApi.middleware, fileApi.middleware),
    preloadedState,
  })
}

export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore["dispatch"]

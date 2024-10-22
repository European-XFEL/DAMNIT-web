import { configureStore } from "@reduxjs/toolkit"
import { loadingBarReducer as loadingBar } from "react-redux-loading-bar"

import { authApi, metadataApi } from "../features/api"
import { dashboardReducer as dashboard } from "../features/dashboard"
import { plotsReducer as plots } from "../features/plots"
import { tableReducer as table } from "../features/table"

import { listenerMiddleware } from "./listeners"
import extractedData from "./slices/extractedData"
import proposal from "./slices/proposal"
import tableData from "./slices/tableData"

const reducer = {
  dashboard,
  plots,
  proposal,
  table,
  tableData,
  extractedData,
  loadingBar,

  [authApi.reducerPath]: authApi.reducer,
  [metadataApi.reducerPath]: metadataApi.reducer,
}

export const setupStore = (preloadedState) => {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(authApi.middleware, metadataApi.middleware),
    preloadedState,
  })
}

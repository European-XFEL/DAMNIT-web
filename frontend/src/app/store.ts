import { combineReducers } from "redux"
import { configureStore } from "@reduxjs/toolkit"
import { loadingBarReducer as loadingBar } from "react-redux-loading-bar"

import { authApi } from "../features/api"
import { dashboardReducer as dashboard } from "../features/dashboard"
import { drawerReducer as drawer } from "../features/drawer"
import { plotsReducer as plots } from "../features/plots"
import { tableReducer as table } from "../features/table"
import { listenerMiddleware } from "./listeners"
import {
  extractedDataReducer as extractedData,
  proposalReducer as proposal,
  tableDataReducer as tableData,
} from "../shared"

const reducer = combineReducers({
  dashboard,
  drawer,
  plots,
  proposal,
  table,
  tableData,
  extractedData,
  loadingBar,

  [authApi.reducerPath]: authApi.reducer,
})

export const setupStore = (preloadedState) => {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(authApi.middleware),
    preloadedState,
  })
}

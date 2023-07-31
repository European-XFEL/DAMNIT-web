import { combineReducers } from "redux"
import { configureStore } from "@reduxjs/toolkit"

import { dashboardReducer as dashboard } from "../features/dashboard"
import { drawerReducer as drawer } from "../features/drawer"
import { plotsReducer as plots } from "../features/plots"
import { tableReducer as table } from "../features/table"
import { listenerMiddleware } from "./listeners"

const reducer = combineReducers({ dashboard, drawer, plots, table })

export const setupStore = (preloadedState) => {
  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(listenerMiddleware.middleware),
    preloadedState,
  })
}

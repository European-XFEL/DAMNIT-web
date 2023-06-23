import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";

import { drawerReducer as dashboard } from "../features/dashboard";
import { drawerReducer as drawer } from "../features/drawer";
import { tableReducer as table } from "../features/table";
import { listenerMiddleware } from "./listeners";

const reducer = combineReducers({ dashboard, drawer, table });

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

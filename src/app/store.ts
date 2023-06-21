import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";

import { tableReducer as table } from "../features/table";
import { drawerReducer as drawer } from "../common/drawer";
import { listenerMiddleware } from "./listeners";

const reducer = combineReducers({ table, drawer });

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

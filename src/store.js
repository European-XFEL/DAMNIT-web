import { combineReducers } from "redux";
import { configureStore } from "@reduxjs/toolkit";

import { drawerReducer as drawer } from "./common/drawer";
import table from "./reducers/table";

const reducer = combineReducers({ table, drawer });

export const store = configureStore({
  reducer,
});

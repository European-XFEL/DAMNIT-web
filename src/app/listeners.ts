import { createListenerMiddleware } from "@reduxjs/toolkit";

import { openDrawer, closeDrawer } from "../features/drawer/";
import { selectRow } from "../features/table";

export const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: selectRow,
  effect: (action, { dispatch }) => {
    const row = action.payload;

    const sideEffect = row !== null ? openDrawer : closeDrawer;
    dispatch(sideEffect());
  },
});

listenerMiddleware.startListening({
  actionCreator: closeDrawer,
  effect: (action, { dispatch, getState }) => {
    const { table } = getState();
    if (table.selection.row !== null) {
      dispatch(selectRow(null));
    }
  },
});

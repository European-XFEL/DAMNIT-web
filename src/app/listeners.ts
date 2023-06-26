import { createListenerMiddleware } from "@reduxjs/toolkit";

import { addTab } from "../features/dashboard";
import { openDrawer, closeDrawer } from "../features/drawer/";
import { addPlot } from "../features/plots/";
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

listenerMiddleware.startListening({
  actionCreator: addPlot,
  effect: (action, { dispatch, getState }) => {
    dispatch(addTab({ id: "plots", title: "Plots", isClosable: true }));
  },
});

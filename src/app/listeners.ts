import { createListenerMiddleware } from "@reduxjs/toolkit";

import { addTab } from "../features/dashboard";
import { openDrawer, closeDrawer } from "../features/drawer/";
import { addPlot } from "../features/plots/";
import { selectRun } from "../features/table";

export const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: selectRun,
  effect: (action, { dispatch }) => {
    const run = action.payload;

    const sideEffect = run !== null ? openDrawer : closeDrawer;
    dispatch(sideEffect());
  },
});

listenerMiddleware.startListening({
  actionCreator: closeDrawer,
  effect: (action, { dispatch, getState }) => {
    const { table } = getState();
    if (table.selection.run !== null) {
      dispatch(selectRun(null));
    }
  },
});

listenerMiddleware.startListening({
  actionCreator: addPlot,
  effect: (action, { dispatch, getState }) => {
    dispatch(addTab({ id: "plots", title: "Plots", isClosable: true }));
  },
});

import { createListenerMiddleware } from "@reduxjs/toolkit";

import { openDrawer, closeDrawer } from "../common/drawer/";
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

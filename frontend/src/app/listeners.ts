import { createListenerMiddleware } from "@reduxjs/toolkit"

import { addTab, removeTab } from "../features/dashboard"
import { openDrawer, closeDrawer } from "../features/drawer/"
import { addPlot, clearPlots, removePlot } from "../features/plots/"
import { selectRun } from "../features/table"
import { isEmpty } from "../utils/helpers"

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  actionCreator: selectRun,
  effect: (action, { dispatch }) => {
    const { run } = action.payload

    const sideEffect = run !== null ? openDrawer : closeDrawer
    dispatch(sideEffect())
  },
})

listenerMiddleware.startListening({
  actionCreator: addPlot,
  effect: (action, { dispatch }) => {
    dispatch(addTab({ id: "plots", title: "Plots", isClosable: true }))
  },
})

listenerMiddleware.startListening({
  actionCreator: removePlot,
  effect: (action, { dispatch, getState }) => {
    const { plots } = getState()
    isEmpty(plots.data) && dispatch(removeTab("plots"))
  },
})

listenerMiddleware.startListening({
  actionCreator: removeTab,
  effect: (action, { dispatch }) => {
    dispatch(clearPlots())
  },
})

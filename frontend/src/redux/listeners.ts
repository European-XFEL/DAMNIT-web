import { createListenerMiddleware } from "@reduxjs/toolkit"

import { addTab, removeTab, openAside, closeAside } from "../features/dashboard"
import { addPlot, removePlot, resetPlots } from "../features/plots/"
import { openEditor, resetEditor, clearUnseenChanges } from "../features/editor"
import { setCurrentTab } from "../features/dashboard/dashboard.slice"
import { selectRun } from "../features/table"
import { RootState } from "../redux/reducer"
import { isEmpty } from "../utils/helpers"

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  actionCreator: selectRun,
  effect: (action, { dispatch }) => {
    const { run } = action.payload

    const sideEffect = run != null ? openAside : closeAside
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
  actionCreator: openEditor,
  effect: (action, { dispatch }) => {
    dispatch(addTab({ id: "editor", title: "Context File", isClosable: true }))
  },
})

listenerMiddleware.startListening({
  actionCreator: removeTab,
  effect: (action, { dispatch }) => {
    const id = action.payload
    if (id === "plots") {
      dispatch(resetPlots())
    } else if (id === "editor") {
      dispatch(resetEditor())
    }
  },
})

listenerMiddleware.startListening({
  actionCreator: removePlot,
  effect: (action, { dispatch, getState }) => {
    const { plots } = getState() as RootState
    isEmpty(plots.data) && dispatch(removeTab("plots"))
  },
})

listenerMiddleware.startListening({
  actionCreator: setCurrentTab,
  effect: (action, { dispatch, getState }) => {
    const tabId = action.payload
    if (tabId === 'editor') {
      dispatch(clearUnseenChanges())
    }
  },
})

// listenerMiddleware.startListening({
//   actionCreator: removeTab,
//   effect: (action, { dispatch }) => {
//     dispatch(resetPlots())
//   },
// })

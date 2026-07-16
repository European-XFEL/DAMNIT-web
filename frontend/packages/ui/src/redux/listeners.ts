import {
  addTab,
  closeAside,
  openAside,
  removeTab,
} from '../features/dashboard/dashboard.slice'
import {
  addPlot,
  removePlot,
  reset as resetPlots,
} from '../features/plots/plots.slice'
import { selectRun } from '../features/table/table.slice'
import { startAppListening } from './listener-middleware'
import { isEmpty } from '../utils/helpers'

export function registerAppListeners() {
  startAppListening({
    actionCreator: selectRun,
    effect: (action, { dispatch }) => {
      const { run } = action.payload

      const sideEffect = run != null ? openAside : closeAside
      dispatch(sideEffect())
    },
  })

  startAppListening({
    actionCreator: addPlot,
    effect: (_, { dispatch }) => {
      dispatch(addTab({ id: 'plots', title: 'Plots', isClosable: true }))
    },
  })

  startAppListening({
    actionCreator: removePlot,
    effect: (_, { dispatch, getState }) => {
      const { plots } = getState()
      if (isEmpty(plots.data)) {
        dispatch(removeTab('plots'))
      }
    },
  })

  startAppListening({
    actionCreator: removeTab,
    effect: (_, { dispatch }) => {
      dispatch(resetPlots())
    },
  })
}

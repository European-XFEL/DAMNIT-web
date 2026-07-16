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
import { contextfileApi } from '../features/context-file/context-file.api'
import { cache } from '../graphql/apollo'
import { resetProposal } from './actions'
import { startAppListening } from './listener-middleware'
import { isEmpty } from '../utils/helpers'

export function registerAppListeners() {
  startAppListening({
    actionCreator: resetProposal,
    effect: (_, { dispatch }) => {
      dispatch(contextfileApi.util.resetApiState())

      // Drop every proposal-scoped ROOT_QUERY field, keeping only the home
      // list's proposal_metadata. An allowlist means a new proposal-scoped
      // field is dropped automatically. Apollo defers a watcher's unsubscribe
      // by a macrotask, so the dashboard's metadata watch is still live here;
      // clearing synchronously drops the departing proposal before the next
      // one mounts, where a deferred clear would instead wipe the next
      // proposal's freshly cached data. gc only reclaims orphaned entities, so
      // defer it off the transition frame.
      cache.modify({
        id: 'ROOT_QUERY',
        fields: (value, { fieldName, DELETE }) =>
          fieldName === 'proposal_metadata' ? value : DELETE,
      })
      setTimeout(() => cache.gc())
    },
  })

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

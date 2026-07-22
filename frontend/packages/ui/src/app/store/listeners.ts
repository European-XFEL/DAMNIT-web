import {
  addTab,
  closeAside,
  openAside,
  removeTab,
} from '#src/features/dashboard/dashboard.slice'
import {
  addPlot,
  removePlot,
  reset as resetPlots,
} from '#src/features/plots/plots.slice'
import { plotRequested, selectRun } from '#src/features/table/table.slice'
import { contextfileApi } from '#src/features/context-file/context-file.api'
import { cache } from '#src/graphql/apollo'
import { isEmpty } from '#src/utils/helpers'

import { resetProposal } from './actions'
import { startAppListening } from './listener-middleware'

export function registerAppListeners() {
  startAppListening({
    actionCreator: resetProposal,
    effect: (_, { dispatch, getOriginalState }) => {
      dispatch(contextfileApi.util.resetApiState())

      // The proposal being left. Read from the original state because this
      // action is what clears it.
      const departed = getOriginalState().metadata.proposal.value
      if (!departed) {
        return
      }

      // Drop that proposal's cached fields, and only that proposal's: every
      // one of them carries the number in its arguments, so the next proposal's
      // fields cannot be caught by this.
      //
      // Deferred, because the eviction would otherwise land on watchers that
      // are still subscribed. React runs a removed subtree's cleanups parent
      // first, so this listener fires while the departing pages' watchers are
      // alive, and dirtying them makes each one refetch a proposal the user has
      // already left. Apollo defers its unsubscribes by a macrotask, so wait
      // out both that and the microtasks queued ahead of it. Scoping is what
      // makes waiting safe: by the time this runs the next proposal may have
      // cached data, and none of it is ours to drop.
      Promise.resolve().then(() =>
        setTimeout(() => {
          cache.modify({
            id: 'ROOT_QUERY',
            fields: (value, { storeFieldName, DELETE }) =>
              storeFieldName.includes(`"proposal":"${departed}"`)
                ? DELETE
                : value,
          })
          // This is what reclaims the memory, not a tidy-up. Runs normalize to
          // top-level `DamnitRun:{...}` entries, so dropping the fields above
          // only removes the references to them; the entries themselves sit
          // there as orphans, images and all, until the collector runs.
          cache.gc()
        })
      )
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
    actionCreator: plotRequested,
    effect: (action, { dispatch }) => {
      dispatch(addPlot(action.payload))
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

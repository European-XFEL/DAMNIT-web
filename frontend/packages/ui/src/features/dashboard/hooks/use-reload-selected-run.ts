import type { ApolloCache, ApolloClient } from '@apollo/client'
import { useApolloClient, useReactiveVar } from '@apollo/client/react'
import { useDidUpdate } from '@mantine/hooks'
import isEqual from 'lodash/isEqual'

import {
  RUN_FRAGMENT,
  SELECTED_RUN_QUERY,
  type SelectedRunVariables,
  type TableDataResult,
} from '#src/data/table/table-data.queries'
import { cellsByName } from '#src/data/table/table-data.transforms'
import type { Run, RunId } from '#src/data/table/table-data.types'
import { reconnectCount } from '#src/graphql/live-updates'

type UseReloadSelectedRunOptions = {
  proposal: string
  run: RunId | undefined
}

// The run's cells by name, as the run panel reads them.
function readRunCells(
  cache: ApolloCache<object>,
  { proposal, run }: { proposal: string; run: RunId }
) {
  const entry = cache.readFragment<Run>({
    fragment: RUN_FRAGMENT,
    id: cache.identify({
      __typename: 'DamnitRun',
      database: proposal,
      proposal: run.proposal,
      run: run.run,
    }),
  })

  return cellsByName(entry?.cells ?? [])
}

// Kept out of the effect so its cleanup, alive until the next reconnect, does
// not also hold `cellsAtSend`: closures from one scope share their variables.
function reloadRun(
  client: ApolloClient<object>,
  {
    proposal,
    run,
    signal,
  }: { proposal: string; run: RunId; signal: AbortSignal }
) {
  const variables = { proposal, ids: [run] }
  const cellsAtSend = readRunCells(client.cache, { proposal, run })

  // `no-cache` keeps the answer to this run: a cached read of `Query.runs`
  // hands back every run held. Deduplication would join an aborted request.
  return client
    .query<TableDataResult, SelectedRunVariables>({
      query: SELECTED_RUN_QUERY,
      variables,
      fetchPolicy: 'no-cache',
      context: {
        queryDeduplication: false,
        fetchOptions: { signal },
      },
    })
    .then(({ data }) => {
      if (signal.aborted) {
        return
      }
      if (!data?.runs.length) {
        console.error(`Run ${run.run} came back with no data`)
        return
      }

      // A push that landed while the request was out is newer than its
      // answer. By value: a full read cache rebuilds a cell with no write.
      const cellsNow = readRunCells(client.cache, { proposal, run })
      const [fetched] = data.runs
      const cells = fetched.cells.filter((cell) =>
        isEqual(cellsNow.get(cell.name), cellsAtSend.get(cell.name))
      )

      client.cache.writeQuery({
        query: SELECTED_RUN_QUERY,
        variables,
        data: { runs: [{ ...fetched, cells }] },
      })
    })
    .catch((error: unknown) => {
      if (!signal.aborted) {
        console.error(`Run ${run.run} failed to reload:`, error)
      }
    })
}

// After a reconnect the table reloads only its pages in view and a plot only
// what it charts, so the run beside them asks for itself.
export function useReloadSelectedRun({
  proposal,
  run,
}: UseReloadSelectedRunOptions) {
  const client = useApolloClient()

  // Only a reconnect runs this, so selecting a run asks for nothing. The run it
  // reads is the one selected when live updates came back.
  const reconnects = useReactiveVar(reconnectCount)
  useDidUpdate(() => {
    if (!proposal || run == null) {
      return
    }

    const runFetch = new AbortController()
    void reloadRun(client, { proposal, run, signal: runFetch.signal })

    return () => runFetch.abort()
  }, [reconnects])
}

import { useEffect } from 'react'
import { useQuery, useSubscription } from '@apollo/client/react'

import {
  setProposalNotFound,
  setProposalSuccess,
} from '#src/data/metadata/metadata.slice'
import { stampLiveRuns } from '#src/data/table/run-stamps'
import { recordLiveUpdatesEvent } from '#src/graphql/live-updates'
import {
  RUN_UPDATES_SUBSCRIPTION,
  TABLE_DATA_QUERY,
  TABLE_META_QUERY,
  type RunUpdatesResult,
  type RunUpdatesVariables,
  type TableMetaResult,
  type TableMetaVariables,
} from '#src/data/table/table-data.queries'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'

type UseProposalOptions = {
  subscribe: boolean
}

const useProposal = ({ subscribe = true }: UseProposalOptions) => {
  const proposal = useAppSelector((state) => state.metadata.proposal)
  const dispatch = useAppDispatch()

  // Synchronize the server and the client table metadata. The result lands in
  // the Apollo cache, which is the only home the server metadata has; this query
  // just drives the proposal's navigation state.
  const { data: metadataResult, error: metadataError } = useQuery<
    TableMetaResult,
    TableMetaVariables
  >(TABLE_META_QUERY, {
    variables: { proposal: proposal.value },
    skip: !proposal.value,
    fetchPolicy: 'cache-and-network',
  })

  useEffect(() => {
    if (metadataError) {
      dispatch(setProposalNotFound())
      return
    }

    if (metadataResult?.metadata === undefined) {
      return
    }

    dispatch(setProposalSuccess())
  }, [metadataResult, metadataError, dispatch])

  const shouldSubscribe =
    subscribe && !proposal.loading && !proposal.notFound && !!proposal.value

  useSubscription<RunUpdatesResult, RunUpdatesVariables>(
    RUN_UPDATES_SUBSCRIPTION,
    {
      // The server reads only rows newer than its last-seen timestamp, so 0 is
      // enough. A poll another subscriber cached can still resend rows this
      // table already has.
      variables: { proposal: proposal.value, since: 0 },
      skip: !shouldSubscribe,
      // `onData` below writes every push into the cache itself, so Apollo's own
      // write would be the same payload a second time, filed under
      // ROOT_SUBSCRIPTION where nothing reads it. That root is never collected,
      // so it would also hold every pushed cell (images included) for as long as
      // the tab lives.
      fetchPolicy: 'no-cache',
      onData: ({ data, client }) => {
        const update = data.data?.run_updates
        if (!update) {
          return
        }

        // Changed runs merge into the normalized cache: values update in place
        // and a finished run joins the list. A stale push for a proposal the
        // user just left writes runs keyed by that proposal, which the current
        // table never reads, so no guard is needed.
        if (update.runs.length) {
          // Only runs count as an update: the server's first tick after every
          // connect carries the metadata, changed or not.
          recordLiveUpdatesEvent({ type: 'pushed' })
          client.cache.writeQuery({
            query: TABLE_DATA_QUERY,
            variables: { proposal: proposal.value },
            data: { runs: update.runs },
          })
          stampLiveRuns(update.runs)
        }

        // Metadata rides along only when the run list, variables, tags or
        // groups changed. Replace it wholesale; it is the run layout's source.
        if (update.metadata) {
          client.cache.writeQuery({
            query: TABLE_META_QUERY,
            variables: { proposal: proposal.value },
            data: { metadata: update.metadata },
          })
        }
      },
      // graphql-ws retries every drop, so an error or a completion is the
      // server's own, and nothing will try again.
      onError: () =>
        recordLiveUpdatesEvent({ type: 'failed', reason: 'server' }),
      onComplete: () =>
        recordLiveUpdatesEvent({ type: 'failed', reason: 'server' }),
    }
  )

  useEffect(() => {
    if (!subscribe) {
      recordLiveUpdatesEvent({ type: 'disabled' })
    }
  }, [subscribe])

  // A new proposal counts its changes afresh, even on a socket that stays open.
  useEffect(() => {
    if (shouldSubscribe) {
      recordLiveUpdatesEvent({ type: 'subscribed' })
    }
  }, [shouldSubscribe, proposal.value])

  return proposal
}

export default useProposal

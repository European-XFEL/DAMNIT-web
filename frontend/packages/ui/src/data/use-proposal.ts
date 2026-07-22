import { useEffect, useState } from 'react'
import { useQuery, useSubscription } from '@apollo/client/react'

import {
  setProposalNotFound,
  setProposalSuccess,
} from '#src/data/metadata/metadata.slice'
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

  // The subscription cursor, seeded once from the metadata snapshot and then
  // left alone. The server keeps its own high-water mark per proposal, so it
  // already bounds each tick to rows it has not shipped; this cursor only has
  // to cover the gap between the snapshot and the subscription opening.
  // Advancing it on every push would change a subscription variable, which
  // tears the subscription down and re-opens it on every run update.
  const [since, setSince] = useState(0)

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

    const metadata = metadataResult?.metadata
    if (metadata === undefined) {
      return
    }

    setSince((current) => (current === 0 ? metadata.timestamp : current))
    dispatch(setProposalSuccess())
  }, [metadataResult, metadataError, dispatch])

  useSubscription<RunUpdatesResult, RunUpdatesVariables>(
    RUN_UPDATES_SUBSCRIPTION,
    {
      variables: { proposal: proposal.value, since },
      skip:
        !subscribe || proposal.loading || proposal.notFound || !proposal.value,
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
          client.cache.writeQuery({
            query: TABLE_DATA_QUERY,
            variables: { proposal: proposal.value },
            data: { runs: update.runs },
          })
        }

        // Metadata rides along only when the run list, variables, or tags
        // changed. Replace it wholesale; it is the run layout's source.
        if (update.metadata) {
          client.cache.writeQuery({
            query: TABLE_META_QUERY,
            variables: { proposal: proposal.value },
            data: { metadata: update.metadata },
          })
        }
      },
    }
  )

  return proposal
}

export default useProposal

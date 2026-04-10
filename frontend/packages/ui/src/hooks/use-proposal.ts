import { useEffect } from 'react'

import { useQuery, useSubscription } from '@apollo/client/react'

import { updateTable } from '../data/table'
import { setProposalNotFound, setProposalSuccess } from '../data/metadata'
import {
  TABLE_METADATA_QUERY,
  LATEST_DATA_FIELD_NAME,
  LATEST_DATA_SUBSCRIPTION,
} from '../data/table'
import { useAppDispatch, useAppSelector } from '../redux/hooks'

type UseProposalOptions = {
  subscribe: boolean
}

const useProposal = ({ subscribe = true }: UseProposalOptions) => {
  // Initialize Redux things
  const proposal = useAppSelector((state) => state.metadata.proposal)
  const { timestamp } = useAppSelector((state) => state.tableData.metadata)
  const dispatch = useAppDispatch()

  useSubscription(LATEST_DATA_SUBSCRIPTION, {
    variables: { proposal: proposal.value, timestamp },
    onData: ({ data }) => {
      const { runs, metadata } = data.data[LATEST_DATA_FIELD_NAME]
      dispatch(updateTable({ data: runs, metadata, notify: true }))
    },
    skip: !subscribe || proposal.loading || proposal.notFound,
  })

  // Synchronize the server and the client table metadata
  const { data: metadataResult, error: metadataError } = useQuery(
    TABLE_METADATA_QUERY,
    {
      variables: { proposal: proposal.value },
      skip: !proposal.value,
    }
  )

  useEffect(() => {
    if (metadataError) {
      dispatch(setProposalNotFound())
      return
    }

    const metadata = metadataResult?.metadata
    if (metadata === undefined) {
      return
    }

    const normalized = {
      ...metadata,
      runs: metadata.runs.map(String),
    }
    dispatch(updateTable({ data: {}, metadata: normalized }))
    dispatch(setProposalSuccess())
  }, [metadataResult, metadataError, dispatch])

  return proposal
}

export default useProposal

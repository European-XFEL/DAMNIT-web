import { useEffect } from 'react'

import { useMutation, useSubscription } from '@apollo/client/react'
import { hideLoading } from 'react-redux-loading-bar'

import { updateTable } from '../data/table'
import { setProposalNotFound, setProposalSuccess } from '../data/metadata'
import {
  REFRESH_MUTATION,
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

  // Synchronize the server and the client table data
  const [refresh, _] = useMutation(REFRESH_MUTATION)
  useEffect(() => {
    if (!proposal.value) {
      return
    }

    refresh({
      variables: { proposal: proposal.value },
      onCompleted: ({ refresh }) => {
        dispatch(updateTable({ data: {}, metadata: refresh.metadata }))

        // Finalize
        dispatch(hideLoading())
        dispatch(setProposalSuccess())
      },
      onError: (_) => {
        // Finalize
        dispatch(hideLoading())
        dispatch(setProposalNotFound())
      },
    })
  }, [proposal.value, refresh, dispatch])

  return proposal
}

export default useProposal

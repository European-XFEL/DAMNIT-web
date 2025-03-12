import { useEffect } from "react"

import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"
import { hideLoading } from "react-redux-loading-bar"

import { updateTable } from "../data/table"
import { setProposalNotFound, setProposalSuccess } from "../data/metadata"
import {
  REFRESH_MUTATION,
  LATEST_DATA_FIELD_NAME,
  LATEST_DATA_SUBSCRIPTION,
} from "../data/table"
import { useAppDispatch, useAppSelector } from "../redux"

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === "test")

export const useProposal = () => {
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
    skip: !SHOULD_SUBSCRIBE || proposal.loading || proposal.notFound,
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
        dispatch(setProposalSuccess())
        dispatch(updateTable({ data: {}, metadata: refresh.metadata }))
        dispatch(hideLoading())
      },
      onError: (_) => {
        dispatch(setProposalNotFound())
        dispatch(hideLoading())
      },
    })
  }, [proposal, refresh, dispatch])

  return proposal
}

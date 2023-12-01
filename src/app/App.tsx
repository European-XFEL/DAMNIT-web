import React, { useEffect } from "react"
import { connect, useDispatch } from "react-redux"
import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"

import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import { updateTable } from "../features/table"
import {
  REFRESH_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"
import { PROPOSAL_NUMBER } from "../constants"

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === "test")

const useInitialize = ({ isLoading, timestamp }) => {
  // Initialize GraphQL hooks
  const [refresh, _] = useMutation(REFRESH_MUTATION)
  useSubscription(LATEST_DATA_SUBSCRIPTION, {
    variables: { proposal: String(PROPOSAL_NUMBER), timestamp },
    onData: ({ data }) => {
      const { runs, metadata } = data.data[LATEST_DATA]
      dispatch(updateTable({ runs, metadata }))
    },
    skip: !SHOULD_SUBSCRIBE || isLoading,
  })

  // Initialize Redux things
  const dispatch = useDispatch()

  // Finalize
  useEffect(() => {
    refresh({
      variables: { proposal: String(PROPOSAL_NUMBER) },
      onCompleted: ({ refresh }) => {
        dispatch(updateTable({ metadata: refresh.metadata }))
      },
    })
  }, [])
}

const App = ({ isLoading, timestamp }) => {
  useInitialize({ isLoading, timestamp })

  return (
    <div>
      {isLoading ? null : (
        <>
          <Drawer />
          <Dashboard />
        </>
      )}
    </div>
  )
}

const mapStateToProps = ({ table }) => {
  return {
    isLoading: table.metadata.rows === 0,
    timestamp: table.metadata.timestamp,
  }
}

export default connect(mapStateToProps)(App)

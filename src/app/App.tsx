import React, { useEffect } from "react"
import { connect, useDispatch } from "react-redux"
import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"

import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import { getTable, updateTable } from "../features/table"
import {
  INITIALIZE_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"
import { PROPOSAL_NUMBER } from "../constants"
import { isEmpty } from "../utils/helpers"

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === "test")

const useInitialize = ({ isLoading, timestamp }) => {
  // Initialize GraphQL hooks
  const [initialize, _] = useMutation(INITIALIZE_MUTATION)
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
    initialize({
      variables: { proposal: String(PROPOSAL_NUMBER) },
      onCompleted: (_) => {
        dispatch(getTable())
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
    isLoading: isEmpty(table.data),
    timestamp: table.metadata.timestamp,
  }
}

export default connect(mapStateToProps)(App)

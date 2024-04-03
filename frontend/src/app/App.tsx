import React, { useEffect } from "react"
import { connect, useDispatch } from "react-redux"
import { Route, Routes, useNavigate, useLocation } from "react-router-dom"
import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"

import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import HeroPage from "../features/hero"
import { LoginRoute, history } from "../routes"
import { updateTable } from "../shared"
import {
  REFRESH_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"
import { PROPOSAL_NUMBER } from "../constants"

const SHOULD_SUBSCRIBE = false // !(import.meta.env.MODE === "test")

const useInitialize = ({ isLoading, timestamp }) => {
  // Initialize routers
  history.navigate = useNavigate()
  history.location = useLocation()

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
      <Routes>
        <Route path="/" exact element={<HeroPage />} />
        <Route path="/login" element={<LoginRoute />} />
        {/* {isLoading ? null : (
        <>
          <Drawer />
          <Dashboard />
        </>
      )} */}
      </Routes>
    </div>
  )
}

const mapStateToProps = (state) => {
  const table = state.tableData
  return {
    isLoading: table.metadata.rows === 0,
    timestamp: table.metadata.timestamp,
  }
}

export default connect(mapStateToProps)(App)

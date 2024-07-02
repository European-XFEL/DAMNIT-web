import React, { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import {
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom"
import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"
import LoadingBar, { showLoading, hideLoading } from "react-redux-loading-bar"

import { initialize as initializeApp } from "./appSlice"
import { initializeAuth } from "../features/auth"
import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import HeroPage from "../features/hero"
import HomePage from "../features/home/"
import { LogoutPage } from "../features/pages"
import { resetPlots } from "../features/plots"
import { resetTable } from "../features/table"
import { LoginRoute, PrivateRoute, history } from "../routes"
import {
  setProposalPending,
  setProposalSuccess,
  setProposalNotFound,
  resetExtractedData,
  resetTableData,
  updateTableData,
} from "../shared"
import {
  REFRESH_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"

const SHOULD_SUBSCRIBE = false // !(import.meta.env.MODE === "test")

const useProposal = () => {
  // Initialize Redux things
  const proposal = useSelector((state) => state.proposal.current)
  const { timestamp } = useSelector((state) => state.tableData.metadata)
  const dispatch = useDispatch()

  // Initialize GraphQL hooks
  useSubscription(LATEST_DATA_SUBSCRIPTION, {
    variables: { proposal: proposal.value, timestamp },
    onData: ({ data }) => {
      const { runs, metadata } = data.data[LATEST_DATA]
      dispatch(updateTableData({ runs, metadata }))
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
        dispatch(updateTableData({ metadata: refresh.metadata }))
        dispatch(hideLoading())
      },
      onError: (error) => {
        dispatch(setProposalNotFound())
        dispatch(hideLoading())
      },
    })
  }, [proposal, refresh, dispatch])

  return proposal
}

function ProposalWrapper({ children }) {
  const proposal = useProposal()
  const dispatch = useDispatch()
  const { proposal_number } = useParams()

  useEffect(() => {
    if (proposal_number) {
      dispatch(showLoading())
      dispatch(setProposalPending(proposal_number))
    }

    return () => {
      dispatch(resetTableData())
      dispatch(resetTable())
      dispatch(resetExtractedData())
      dispatch(resetPlots())
    }
  }, [proposal_number, dispatch])

  return proposal.loading || !proposal_number ? (
    <div></div>
  ) : proposal.notFound ? (
    <div>Not found</div>
  ) : (
    children
  )
}

const App = () => {
  // Initialize routers
  history.navigate = useNavigate()
  history.location = useLocation()

  // Initialize application
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(initializeAuth())
    dispatch(initializeApp())
  }, [])

  return (
    <div>
      <Routes>
        <Route path="/" exact element={<HeroPage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/proposal/:proposal_number"
          element={
            <PrivateRoute>
              <ProposalWrapper>
                <LoadingBar style={{ backgroundColor: "#1864AB" }} />
                <Drawer />
                <Dashboard />
              </ProposalWrapper>
            </PrivateRoute>
          }
        />
      </Routes>
    </div>
  )
}

export default App

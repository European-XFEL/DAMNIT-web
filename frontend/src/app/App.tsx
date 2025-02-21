import React, { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom"
import { useMutation } from "@apollo/client"
import { useSubscription } from "@apollo/client"
import LoadingBar, { showLoading, hideLoading } from "react-redux-loading-bar"

import Dashboard from "../features/dashboard"
import {
  HeroPage,
  HomePage,
  LoggedOutPage,
  NotFoundPage,
} from "../features/pages"
import { resetPlots } from "../features/plots"
import { resetTable } from "../features/table"
import { LoginRoute, LogoutRoute, PrivateRoute, history } from "../routes"
import {
  setProposalPending,
  setProposalSuccess,
  setProposalNotFound,
  resetExtractedData,
  resetTableData,
  updateTableData,
} from "../redux/slices"
import {
  REFRESH_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === "test")

const useProposal = () => {
  // Initialize Redux things
  const proposal = useSelector((state) => state.proposal.current)
  const { timestamp } = useSelector((state) => state.tableData.metadata)
  const dispatch = useDispatch()

  useSubscription(LATEST_DATA_SUBSCRIPTION, {
    variables: { proposal: proposal.value, timestamp },
    onData: ({ data }) => {
      const { runs, metadata } = data.data[LATEST_DATA]
      dispatch(updateTableData({ runs, metadata, notify: true }))
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
      onError: (_) => {
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
    <Navigate to="/not-found" />
  ) : (
    children
  )
}

const App = () => {
  // Initialize routers
  history.navigate = useNavigate()
  history.location = useLocation()

  return (
    <div>
      <Routes>
        <Route path="/" exact element={<HeroPage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/logout" element={<LogoutRoute />} />
        <Route path="/logged-out" element={<LoggedOutPage />} />
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
                <Dashboard />
              </ProposalWrapper>
            </PrivateRoute>
          }
        />
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" />} />
      </Routes>
    </div>
  )
}

export default App

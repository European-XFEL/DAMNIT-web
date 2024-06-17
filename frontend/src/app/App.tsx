import React, { useCallback, useEffect } from "react"
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

import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import HeroPage from "../features/hero"
import HomePage from "../features/home/"
import { LoginRoute, PrivateRoute, history } from "../routes"
import {
  setCurrentProposal,
  resetExtractedData,
  resetTable,
  updateTable,
} from "../shared"
import {
  REFRESH_MUTATION,
  LATEST_DATA,
  LATEST_DATA_SUBSCRIPTION,
} from "../graphql/queries"

const SHOULD_SUBSCRIBE = false // !(import.meta.env.MODE === "test")

const useProposal = ({ monitor, timestamp }) => {
  // Initialize states
  const proposal = useSelector((state) => state.proposal.current)

  // Initialize Redux things
  const dispatch = useDispatch()

  // Initialize GraphQL hooks
  useSubscription(LATEST_DATA_SUBSCRIPTION, {
    variables: { proposal: String(proposal), timestamp },
    onData: ({ data }) => {
      const { runs, metadata } = data.data[LATEST_DATA]
      dispatch(updateTable({ runs, metadata }))
    },
    skip: !SHOULD_SUBSCRIBE || !monitor,
  })

  // Synchronize the server and the client table data
  const [refresh, _] = useMutation(REFRESH_MUTATION)
  useEffect(() => {
    if (!proposal) {
      return
    }

    refresh({
      variables: { proposal },
      onCompleted: ({ refresh }) => {
        dispatch(updateTable({ metadata: refresh.metadata }))
      },
    })
  }, [proposal, refresh, dispatch])
}

function ProposalWrapper({ children }) {
  const { rows, timestamp } = useSelector((state) => state.tableData.metadata)
  useProposal({ timestamp, monitor: rows !== 0 })

  const dispatch = useDispatch()
  const { proposal } = useParams()

  const setProposal = useCallback(
    (proposal: string) => {
      dispatch(setCurrentProposal(proposal))
    },
    [dispatch],
  )

  const reset = useCallback(() => {
    dispatch(resetTable())
    dispatch(resetExtractedData())
  }, [dispatch])

  useEffect(() => {
    if (proposal) {
      setProposal(proposal)
    }

    return () => {
      reset()
    }
  }, [proposal, setProposal, reset])

  return children
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
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/proposal/:proposal"
          element={
            <PrivateRoute>
              <ProposalWrapper>
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

import { type PropsWithChildren, useEffect } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom'
import LoadingBar, { showLoading } from 'react-redux-loading-bar'

import {
  Dashboard,
  HeroPage,
  HomePage,
  LoggedOutPage,
  LoginRoute,
  LogoutRoute,
  NotFoundPage,
  PrivateRoute,
  history,
  resetExtractedData,
  resetMetadata,
  resetPlots,
  resetTableData,
  resetTableView,
  setProposalPending,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'

function ProposalWrapper({ children }: PropsWithChildren) {
  const proposal = useProposal()
  const dispatch = useAppDispatch()
  const { proposal_number } = useParams()

  useEffect(() => {
    if (proposal_number) {
      dispatch(showLoading())
      dispatch(setProposalPending(proposal_number))
    }

    return () => {
      dispatch(resetTableData())
      dispatch(resetTableView())
      dispatch(resetExtractedData())
      dispatch(resetPlots())
      dispatch(resetMetadata())
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
  history.setNavigate(useNavigate())
  history.setLocation(useLocation())

  return (
    <div>
      <Routes>
        <Route path="/" element={<HeroPage />} />
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
                <LoadingBar style={{ backgroundColor: '#1864AB' }} />
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

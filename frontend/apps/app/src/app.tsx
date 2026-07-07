import { type PropsWithChildren, useEffect } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router'
import { Container } from '@mantine/core'
import {
  Dashboard,
  HomePage,
  LoggedOutPage,
  LoginRoute,
  LogoutRoute,
  NotFoundPage,
  PrivateRoute,
  Proposals,
  history,
  resetContextFile,
  resetDashboard,
  resetExtractedData,
  resetMetadata,
  resetPlots,
  resetTableData,
  resetTableView,
  setProposalPending,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'
import { AppHeader } from './hzdr/components/AppHeader'
import { useRuntimeConfig } from './hzdr/hooks'
import { HZDRSourceHome } from './hzdr'
import { hzdrRoutes } from './hzdr/routes'

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === 'test')

function ProposalWrapper({ children }: PropsWithChildren) {
  const proposal = useProposal({ subscribe: SHOULD_SUBSCRIBE })
  const dispatch = useAppDispatch()
  const { proposal_number } = useParams()

  useEffect(() => {
    if (proposal_number) {
      dispatch(setProposalPending(proposal_number))
    }

    return () => {
      dispatch(resetTableData())
      dispatch(resetTableView())
      dispatch(resetExtractedData())
      dispatch(resetPlots())
      dispatch(resetMetadata())
      dispatch(resetDashboard())
      dispatch(resetContextFile())
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
  const runtimeConfig = useRuntimeConfig()
  const usesProposals = runtimeConfig?.terminology.uses_proposals ?? true

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/logout" element={<LogoutRoute />} />
        <Route path="/logged-out" element={<LoggedOutPage />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <HomePage
                header={<AppHeader />}
                main={
                  <Container>
                    {usesProposals ? <Proposals /> : <HZDRSourceHome />}
                  </Container>
                }
              />
            </PrivateRoute>
          }
        />
        <Route
          path="/proposal/:proposal_number"
          element={
            <PrivateRoute>
              <ProposalWrapper>
                <Dashboard />
              </ProposalWrapper>
            </PrivateRoute>
          }
        />
        {hzdrRoutes()}
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" />} />
      </Routes>
    </>
  )
}

export default App

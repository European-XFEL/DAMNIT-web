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
  Header,
  HeroPage,
  HomePage,
  LoggedOutPage,
  LoginRoute,
  LogoutRoute,
  Logo,
  NotFoundPage,
  PrivateRoute,
  Proposals,
  history,
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
              <HomePage
                header={
                  <Header px={20}>
                    <Logo linkTo="/home" />
                  </Header>
                }
                main={
                  <Container>
                    <Proposals />
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
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" />} />
      </Routes>
    </div>
  )
}

export default App

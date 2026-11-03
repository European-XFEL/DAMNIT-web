import { type PropsWithChildren, useEffect } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router'
import { Container, VisuallyHidden } from '@mantine/core'

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
  resetProposal,
  selectAvailableProposals,
  setProposalPending,
  useAppDispatch,
  useAppSelector,
  useProposal,
} from '@damnit-frontend/ui'

import { AppHeader } from './hzdr/components/AppHeader'
import { useRuntimeConfig } from './hzdr/hooks'
import { HZDRSourceHome } from './hzdr'
import { hzdrRoutes } from './hzdr/routes'

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === 'test')

type ProposalWrapperProps = PropsWithChildren<{ proposalNumber: string }>

// ProposalRoute keys this on the proposal, so switching proposals remounts the
// subtree instead of updating it in place. Unmount dispatches resetProposal;
// see its listener for why the Apollo evict is safe to run during the switch.
function ProposalWrapper({ proposalNumber, children }: ProposalWrapperProps) {
  const proposal = useProposal({ subscribe: SHOULD_SUBSCRIBE })
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(setProposalPending(proposalNumber))

    return () => {
      dispatch(resetProposal())
    }
  }, [proposalNumber, dispatch])

  return proposal.loading ? (
    <div></div>
  ) : proposal.notFound ? (
    <Navigate to="/not-found" />
  ) : (
    children
  )
}

function ProposalRoute({ children }: PropsWithChildren) {
  const { proposal_number } = useParams()

  if (!proposal_number) {
    return <div></div>
  }

  return (
    <ProposalWrapper key={proposal_number} proposalNumber={proposal_number}>
      {children}
    </ProposalWrapper>
  )
}

function HomeRoute({ usesProposals }: { usesProposals: boolean }) {
  const proposals = useAppSelector(selectAvailableProposals)

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container>
          <VisuallyHidden component="h1">
            {usesProposals ? 'Proposals' : 'Sources'}
          </VisuallyHidden>
          {usesProposals ? (
            <Proposals proposals={proposals} />
          ) : (
            <HZDRSourceHome />
          )}
        </Container>
      }
    />
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
              <HomeRoute usesProposals={usesProposals} />
            </PrivateRoute>
          }
        />
        <Route
          path="/proposal/:proposal_number"
          element={
            <PrivateRoute>
              <ProposalRoute>
                <Dashboard />
              </ProposalRoute>
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

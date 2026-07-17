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
  UserMenu,
  history,
  resetProposal,
  selectUserFullName,
  setProposalPending,
  useAppDispatch,
  useAppSelector,
  useProposal,
} from '@damnit-frontend/ui'

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

function HomeHeader() {
  const userName = useAppSelector(selectUserFullName)

  return (
    <Header px={20}>
      <Logo linkTo="/home" />
      <UserMenu
        userName={userName}
        onLogout={() => history.navigate('/logout')}
      />
    </Header>
  )
}

const App = () => {
  // Initialize routers
  history.setNavigate(useNavigate())
  history.setLocation(useLocation())

  return (
    <>
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
                header={<HomeHeader />}
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
              <ProposalRoute>
                <Dashboard />
              </ProposalRoute>
            </PrivateRoute>
          }
        />
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" />} />
      </Routes>
    </>
  )
}

export default App

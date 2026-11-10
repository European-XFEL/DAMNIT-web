import { useNavigate } from 'react-router'
import { Container, VisuallyHidden } from '@mantine/core'

import {
  Header,
  HomePage,
  Logo,
  Proposals,
  UserMenu,
  selectAvailableProposals,
  selectUserFullName,
  useAppSelector,
} from '@damnit-frontend/ui'

function HomeRoute() {
  const userName = useAppSelector(selectUserFullName)
  const proposals = useAppSelector(selectAvailableProposals)
  const navigate = useNavigate()

  return (
    <HomePage
      header={
        <Header px={16}>
          <Logo linkTo="/home" />
          <UserMenu userName={userName} onLogout={() => navigate('/logout')} />
        </Header>
      }
      main={
        <Container>
          <VisuallyHidden component="h1">Proposals</VisuallyHidden>
          <Proposals proposals={proposals} />
        </Container>
      }
    />
  )
}

export default HomeRoute

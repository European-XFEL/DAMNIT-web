import { AppShell, Container } from '@mantine/core'

import { Header, Logo } from '../../components/headers'
import { Proposals } from '../proposals'

const HomePage = () => {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Header px={20}>
          <Logo />
        </Header>
      </AppShell.Header>

      <AppShell.Main>
        <Container>
          <Proposals />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

export default HomePage

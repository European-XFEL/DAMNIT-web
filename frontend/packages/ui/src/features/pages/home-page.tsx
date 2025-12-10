import { AppShell, Container } from '@mantine/core'

import { Header, Logo } from '../../components/headers'
import { SiteFooter } from '../../components/footers'
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
      <AppShell.Footer
        withBorder={false}
        mr={17}
        style={{ background: 'transparent' }}
      >
        <SiteFooter />
      </AppShell.Footer>
    </AppShell>
  )
}

export default HomePage

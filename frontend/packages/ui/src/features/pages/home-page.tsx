import { type ReactNode } from 'react'
import { AppShell } from '@mantine/core'

import { SiteFooter } from '../../components/footers'

type HomePageProps = {
  main: ReactNode
  header: ReactNode
}

const HomePage = ({ main, header }: HomePageProps) => {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>{header}</AppShell.Header>
      <AppShell.Main>{main}</AppShell.Main>
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

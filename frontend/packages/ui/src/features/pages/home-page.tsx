import { type ReactNode } from 'react'
import { AppShell, Stack } from '@mantine/core'

import { SiteFooter } from '../../components/footers'

type HomePageProps = {
  main: ReactNode
  header: ReactNode
}

const HomePage = ({ main, header }: HomePageProps) => {
  return (
    <AppShell padding="md">
      <AppShell.Header h={60}>{header}</AppShell.Header>
      <AppShell.Main>{main}</AppShell.Main>
      <AppShell.Footer
        h={100}
        withBorder={false}
        mr={32}
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 70%)',
        }}
      >
        <Stack h="100%" justify="flex-end">
          <SiteFooter />
        </Stack>
      </AppShell.Footer>
    </AppShell>
  )
}

export default HomePage

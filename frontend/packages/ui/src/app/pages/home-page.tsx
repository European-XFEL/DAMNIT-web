import { type ReactNode } from 'react'
import { AppShell, Stack } from '@mantine/core'

import ContactButton from '#src/components/buttons/contact-button'
import SiteFooter from '#src/components/footers/site-footer'
type HomePageProps = {
  main: ReactNode
  header: ReactNode
}

const HomePage = ({ main, header }: HomePageProps) => {
  return (
    <AppShell
      header={{ height: 40 }}
      // The height sits on the shell so the main area's clearance reads it.
      footer={{ height: 80 }}
      padding="md"
      style={{ '--app-shell-border-color': 'var(--mantine-color-gray-2)' }}
    >
      <AppShell.Header>{header}</AppShell.Header>
      <AppShell.Main>{main}</AppShell.Main>
      <AppShell.Footer
        withBorder={false}
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 70%)',
        }}
      >
        <Stack h="100%" justify="flex-end">
          <SiteFooter />
        </Stack>
      </AppShell.Footer>
      <ContactButton />
    </AppShell>
  )
}

export default HomePage

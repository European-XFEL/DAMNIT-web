import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import { HZDRPrivacyPage } from '../PrivacyPage'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

afterEach(cleanup)

describe('privacy page', () => {
  it('states what is processed, the rights, and who to ask', () => {
    render(
      <MantineProvider>
        <HZDRPrivacyPage />
      </MantineProvider>
    )

    for (const heading of [
      'Data rights and privacy',
      'What we process',
      'Purpose of processing',
      'Retention',
      'Your rights (GDPR)',
      'Controller',
      'Data Protection Officer',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(
      screen.getByRole('link', { name: 'dsb@hzdr.de' }).getAttribute('href')
    ).toBe('mailto:dsb@hzdr.de')
    expect(
      screen.getByRole('link', { name: 'info@hzdr.de' }).getAttribute('href')
    ).toBe('mailto:info@hzdr.de')
  })
})

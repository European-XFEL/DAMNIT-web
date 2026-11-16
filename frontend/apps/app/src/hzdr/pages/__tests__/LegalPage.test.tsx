import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router'

import { HZDRLegalPage } from '../LegalPage'

vi.mock('@damnit-frontend/ui', () => ({
  CONTACT_EMAIL: 'k.tippey@hzdr.de',
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

afterEach(cleanup)

describe('legal notice', () => {
  it('names HZDR as provider, with HZDR contacts and no XFEL notice', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRLegalPage />
        </MemoryRouter>
      </MantineProvider>
    )

    for (const heading of [
      'Legal notice',
      'Service provider',
      'This service',
      'Contact',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(
      screen.getByText(/Helmholtz-Zentrum Dresden-Rossendorf/)
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'info@hzdr.de' }).getAttribute('href')
    ).toBe('mailto:info@hzdr.de')
    expect(
      screen
        .getByRole('link', { name: 'k.tippey@hzdr.de' })
        .getAttribute('href')
    ).toBe('mailto:k.tippey@hzdr.de')
    expect(document.body.innerHTML).not.toContain('xfel.eu/legal')
  })
})

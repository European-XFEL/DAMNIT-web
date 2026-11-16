import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router'

import { HZDRDocsPage } from '../DocsPage'

vi.mock('@damnit-frontend/ui', () => ({
  CONTACT_EMAIL: 'k.tippey@hzdr.de',
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

afterEach(cleanup)

describe('user guide', () => {
  it('covers the deployed flow, review, the table and troubleshooting', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRDocsPage />
        </MemoryRouter>
      </MantineProvider>
    )
    for (const heading of [
      'Using DAMNIT-web at HZDR',
      '1. A shot happens',
      '2. DAMNIT matches',
      '3. The campaign file',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    for (const section of [
      'Find your campaign',
      'Read the shot table',
      'Review matches',
      'The campaign file and SciCat',
      'Something looks wrong',
    ]) {
      expect(screen.getAllByText(section).length).toBeGreaterThan(0)
    }
    // The emulator-era claim that LaserData creates shots through ASAPO is gone.
    expect(document.body.textContent).not.toContain('through the ASAPO path')
  })
})

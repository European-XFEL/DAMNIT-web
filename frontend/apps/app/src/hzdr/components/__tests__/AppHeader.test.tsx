import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { AppHeader } from '../AppHeader'

vi.mock('@damnit-frontend/ui', () => ({
  Header: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  Logo: () => <span>DAMNIT!</span>,
  UserMenu: () => null,
  selectUserFullName: () => 'Test User',
  useAppSelector: () => 'Test User',
}))

afterEach(cleanup)

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderHeader(path = '/flow-monitor') {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppHeader />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

const TABS = ['Campaigns', 'Flow monitor', 'Review matches', 'Docs']

describe('AppHeader', () => {
  it('names the campaign list "Campaigns" on the desktop tabs', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Campaigns' })).toHaveAttribute(
      'href',
      '/home'
    )
    expect(screen.queryByText('Inspect sources')).toBeNull()
    expect(screen.getByRole('link', { name: 'Flow monitor' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('keeps every tab reachable from the phone menu', async () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const menu = await screen.findByRole('menu')
    for (const label of TABS) {
      expect(
        within(menu).getByRole('menuitem', { name: label })
      ).toBeInTheDocument()
    }
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Review matches' })
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/review-matches')
  })
})

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/react'
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

  it('names the controls as the UI does', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRDocsPage />
        </MemoryRouter>
      </MantineProvider>
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Open Workspace')
    expect(text).not.toContain('Build one in Context')
    expect(text).toContain('Add columns')
    // Launcher commands moved to the repository's operations guide.
    expect(text).not.toContain('hzdr-launch')
    expect(text).toContain('hzdr/docs/guides/operations.md')
    expect(screen.getByRole('link', { name: 'API reference' })).toHaveAttribute(
      'href',
      '/api-docs'
    )
  })

  it('gives each section an anchor and lists them in the contents', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRDocsPage />
        </MemoryRouter>
      </MantineProvider>
    )
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    for (const [id, title] of [
      ['find-your-campaign', 'Find your campaign'],
      ['shot-table', 'Read the shot table'],
      ['review-matches', 'Review matches'],
      ['flow-monitor', 'Flow monitor'],
      ['developers', 'For developers'],
    ]) {
      expect(document.getElementById(id)).not.toBeNull()
      expect(within(nav).getByRole('link', { name: title })).toHaveAttribute(
        'href',
        `#${id}`
      )
      expect(
        screen.getByRole('region', { name: title }).getAttribute('id')
      ).toBe(id)
    }
  })

  it('scrolls to the section named in the URL and marks it current', () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    try {
      render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/docs#review-matches']}>
            <HZDRDocsPage />
          </MemoryRouter>
        </MantineProvider>
      )
      expect(scrolled).toContain('review-matches')
      const nav = screen.getByRole('navigation', { name: 'On this page' })
      expect(
        within(nav).getByRole('link', { name: 'Review matches' })
      ).toHaveAttribute('aria-current', 'location')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('shows captioned, lazy-loaded screenshots with alt text', () => {
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRDocsPage />
        </MemoryRouter>
      </MantineProvider>
    )
    const images = screen.getAllByRole('img')
    expect(images.length).toBeGreaterThanOrEqual(4)
    for (const image of images) {
      expect(image).toHaveAttribute('loading', 'lazy')
      expect(image.getAttribute('alt')).toBeTruthy()
      expect(image.closest('figure')?.querySelector('figcaption')).toBeTruthy()
    }
  })
})

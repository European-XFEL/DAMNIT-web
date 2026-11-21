import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { ReviewMatchesPage } from '../ReviewMatchesPage'
import type { HZDRReview, HZDRShot, HZDRSource } from '../../types'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

function shot(n: number, key: string, firedAt: string): HZDRShot {
  return {
    source_key: 'beta',
    shot_number: n,
    shot_key: key,
    fired_at: firedAt,
    metadata: {},
    events: [],
    data_products: [],
  }
}

const SOURCES: HZDRSource[] = [
  {
    key: 'alpha',
    title: 'HZDR canonical campaign (Alpha_2026)',
    damnit_path: '',
    metadata: {},
  } as HZDRSource,
  {
    key: 'beta',
    title: 'HZDR canonical campaign (Beta_2026)',
    damnit_path: '',
    metadata: {},
  } as HZDRSource,
  {
    key: 'broken',
    title: 'Broken_2026',
    damnit_path: '',
    metadata: {},
  } as HZDRSource,
]

const BETA_SHOTS = [
  shot(1, 'beta:1', '2026-05-05T08:15:00Z'),
  shot(2, 'beta:2', '2026-05-05T08:20:00Z'),
]

const REVIEWS: Record<string, HZDRReview> = {
  alpha: {
    match_summary: {
      matched: 16,
      ambiguous: 0,
      unmatched: 0,
      confirmed: 0,
      dismissed: 0,
    },
    review_events: [],
    unassigned_shots: [],
    experiment_rulings: [],
  },
  beta: {
    match_summary: {
      matched: 4,
      ambiguous: 1,
      unmatched: 1,
      confirmed: 0,
      dismissed: 0,
    },
    review_events: [
      {
        event_id: 'evt-amb',
        experiment_id: 'beta',
        source: 'DRACO-Trigger',
        kind: 'draco.trigger',
        timestamp: '2026-05-05T08:17:00Z',
        payload_ref: {},
        metadata: {},
        match_status: 'ambiguous',
        candidate_shot_keys: ['beta:1', 'beta:2'],
        acknowledged: false,
      },
      {
        event_id: 'evt-un',
        experiment_id: 'beta',
        source: 'DRACO-Trigger',
        kind: 'draco.trigger',
        timestamp: '2026-05-05T09:00:00Z',
        payload_ref: {},
        metadata: {},
        match_status: 'unmatched',
        candidate_shot_keys: [],
        acknowledged: false,
      },
    ],
    unassigned_shots: [],
    experiment_rulings: [],
  },
}

function respond(value: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(value),
  })
}

beforeEach(() => {
  // jsdom has no scrollIntoView; Mantine's combobox and the chip jump call it.
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/metadata/hzdr/sources') return respond(SOURCES)
      if (url === '/metadata/hzdr/campaigns') return respond([])
      const match = /^\/metadata\/hzdr\/sources\/([^/]+)(\/review)?$/.exec(url)
      const key = match?.[1] ?? ''
      if (key === 'broken') return respond({ detail: 'boom' }, false)
      if (match?.[2]) return respond(REVIEWS[key])
      const source = SOURCES.find((item) => item.key === key)
      return respond({
        ...source,
        shots: key === 'beta' ? BETA_SHOTS : [],
      })
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

function renderPage(path = '/review-matches') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/review-matches"
            element={
              <>
                <ReviewMatchesPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('ReviewMatchesPage', () => {
  it('opens the campaign with the most waiting and counts each in the picker', async () => {
    const user = userEvent.setup()
    renderPage()

    const picker = await screen.findByRole('textbox', { name: 'Campaign' })
    await waitFor(() => expect(picker).toHaveValue('Beta_2026 · 2 waiting'))
    expect(
      await screen.findByText(
        'Closest in time is highlighted; time alone never decides.'
      )
    ).toBeInTheDocument()
    // Empty sections fold to one line.
    expect(
      screen.getByText('No unassigned shots in this catalog.')
    ).toBeInTheDocument()
    // The automatic pick does not pretend to be a choice in the URL.
    expect(screen.getByTestId('where')).toHaveTextContent('')

    await user.click(picker)
    expect(
      await screen.findByRole('option', { name: 'Alpha_2026 · all clear' })
    ).toBeInTheDocument()
    // A catalog whose review failed just has no count.
    expect(
      screen.getByRole('option', { name: 'Broken_2026' })
    ).toBeInTheDocument()
  })

  it('lets an explicit choice win over the automatic pick', async () => {
    const user = userEvent.setup()
    renderPage()
    const picker = await screen.findByRole('textbox', { name: 'Campaign' })
    await waitFor(() => expect(picker).toHaveValue('Beta_2026 · 2 waiting'))

    await user.click(picker)
    await user.click(
      await screen.findByRole('option', { name: 'Alpha_2026 · all clear' })
    )
    expect(screen.getByTestId('where')).toHaveTextContent('?source=alpha')
    expect(
      await screen.findByText(
        'Alpha_2026: all clear. 16 events matched; nothing is waiting for a decision.'
      )
    ).toBeInTheDocument()
  })

  it('keeps the campaign in the URL and shows one all-clear banner', async () => {
    renderPage('/review-matches?source=alpha')
    expect(
      await screen.findByText(
        'Alpha_2026: all clear. 16 events matched; nothing is waiting for a decision.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Ambiguous matches')).not.toBeInTheDocument()
    expect(screen.queryByText('Unmatched events')).not.toBeInTheDocument()
    expect(screen.queryByText('Unassigned shots')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resolved/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Campaign' })).toHaveValue(
        'Alpha_2026 · all clear'
      )
    )
  })

  it('jumps to a section from its chip', async () => {
    const user = userEvent.setup()
    renderPage('/review-matches?source=beta')
    await user.click(await screen.findByRole('button', { name: '1 unmatched' }))
    expect(
      screen.getByRole('heading', { name: 'Unmatched events' })
    ).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: '0 unassigned shots' })
    ).not.toBeInTheDocument()
  })
})

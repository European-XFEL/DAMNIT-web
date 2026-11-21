import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router'

import { ReviewMatchesPage } from '../ReviewMatchesPage'
import type { HZDRReview, HZDRSourceSummary } from '../../types'

// The poll is driven by hand: the mock keeps the page's poll function.
const polling = vi.hoisted(() => ({
  poll: undefined as undefined | (() => Promise<unknown>),
  intervalMs: 0,
}))
vi.mock('../../hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks')>()),
  usePolling: (poll: () => Promise<unknown>, intervalMs: number) => {
    polling.poll = poll
    polling.intervalMs = intervalMs
  },
}))
vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EMPTY_REVIEW: HZDRReview = {
  match_summary: {
    matched: 1,
    ambiguous: 0,
    unmatched: 0,
    confirmed: 0,
    dismissed: 0,
  },
  review_events: [],
  unassigned_shots: [],
  experiment_rulings: [],
}

const summary = (
  key: string,
  waiting: number,
  shot_count = 1
): HZDRSourceSummary => ({
  key,
  title: `${key}_2026`,
  damnit_path: '',
  shot_count,
  last_shot_at: null,
  fired_since: 0,
  waiting,
  needs_review: 0,
  needs_revision: 0,
})

describe('Review matches refreshes itself', () => {
  it('keeps the open campaign and reloads it only when its summary changed', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    let summaries = [summary('alpha', 0), summary('beta', 2)]
    const fetchMock = vi.fn((url: string) => {
      const value = url.startsWith('/metadata/hzdr/source-summaries')
        ? summaries
        : url === '/metadata/hzdr/campaigns'
          ? []
          : url.endsWith('/review')
            ? EMPTY_REVIEW
            : {
                key: url.split('/').at(-1),
                title: `${url.split('/').at(-1)}_2026`,
                damnit_path: '',
                metadata: {},
                shots: [],
              }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(value),
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const reviewFetches = (key: string) =>
      fetchMock.mock.calls.filter(
        ([url]) => url === `/metadata/hzdr/sources/${key}/review`
      ).length

    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/review-matches']}>
          <Routes>
            <Route path="/review-matches" element={<ReviewMatchesPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    expect(polling.intervalMs).toBe(30_000)
    await act(() => polling.poll!())
    const picker = await screen.findByRole('textbox', { name: 'Campaign' })
    await waitFor(() => expect(picker.getAttribute('value')).toMatch(/^beta/))
    await waitFor(() => expect(reviewFetches('beta')).toBe(1))

    // Unchanged: nothing is fetched again.
    await act(() => polling.poll!())
    expect(reviewFetches('beta')).toBe(1)

    // Alpha becomes the busiest: the page stays on beta.
    summaries = [summary('alpha', 5), summary('beta', 2)]
    await act(() => polling.poll!())
    expect(picker.getAttribute('value')).toMatch(/^beta/)
    expect(reviewFetches('beta')).toBe(1)
    expect(reviewFetches('alpha')).toBe(0)

    // Beta's own summary changes: its lists are fetched again.
    summaries = [summary('alpha', 5), summary('beta', 3, 2)]
    await act(() => polling.poll!())
    await waitFor(() => expect(reviewFetches('beta')).toBe(2))
  })
})

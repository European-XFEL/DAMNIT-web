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

describe('Review matches batch actions', () => {
  it('acknowledges a group with one request per event and one reload', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const unmatched = ['a', 'b'].map((id) => ({
      event_id: `evt-${id}`,
      experiment_id: 'beta',
      source: 'TestFire',
      kind: 'draco.trigger',
      timestamp: '2026-11-21T10:00:00Z',
      payload_ref: {},
      metadata: {},
      match_status: 'unmatched',
      candidate_shot_keys: [],
      acknowledged: false,
    }))
    const review: HZDRReview = {
      ...EMPTY_REVIEW,
      match_summary: { ...EMPTY_REVIEW.match_summary, unmatched: 2 },
      review_events: unmatched,
    }
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const value = url.startsWith('/metadata/hzdr/source-summaries')
        ? [summary('beta', 2)]
        : url === '/metadata/hzdr/campaigns'
          ? []
          : url.endsWith('/review')
            ? review
            : init?.method === 'POST'
              ? { key: 'beta', title: 'beta_2026', damnit_path: '', shots: [] }
              : {
                  key: 'beta',
                  title: 'beta_2026',
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
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/review-matches']}>
          <Routes>
            <Route path="/review-matches" element={<ReviewMatchesPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    await act(() => polling.poll!())
    const reviewFetches = () =>
      fetchMock.mock.calls.filter(([url]) => url.endsWith('/review')).length
    await screen.findByRole('button', { name: 'Acknowledge all 2' })
    const before = reviewFetches()
    await act(async () => {
      screen.getByRole('button', { name: 'Acknowledge all 2' }).click()
    })
    await act(async () => {
      screen
        .getByRole('button', { name: 'Yes, acknowledge 2 with no shot' })
        .click()
    })
    await screen.findByText('2 events acknowledged with no shot.')
    const posts = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url]) => url)
    expect(posts).toEqual([
      '/metadata/hzdr/sources/beta/review/evt-a/dismiss',
      '/metadata/hzdr/sources/beta/review/evt-b/dismiss',
    ])
    await waitFor(() => expect(reviewFetches()).toBe(before + 1))
  })
})

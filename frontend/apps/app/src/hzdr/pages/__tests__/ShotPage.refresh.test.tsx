import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { HZDRShotPage } from '../ShotPage'
import type { HZDRShot, HZDRSourceSummary } from '../../types'

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
vi.mock('../../components/ShotCampaignStrip', () => ({
  ShotCampaignStrip: () => null,
}))
vi.mock('../../components/ShotDetailPanel', () => ({
  ShotDetailPanel: () => null,
}))
vi.mock('../../components/ShotTable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ShotTable')>()),
  SelectedCellPanel: () => null,
  HZDRShotSetsPanel: () => null,
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const makeShot = (n: number): HZDRShot => ({
  source_key: 'demo',
  shot_number: n,
  shot_key: `demo:20261121:${String(n).padStart(6, '0')}`,
  fired_at: `2026-11-21T10:0${n}:00Z`,
  metadata: { status: 'processed' },
  events: [],
  data_products: [],
})

const summary = (shots: HZDRShot[]): HZDRSourceSummary => ({
  key: 'demo',
  title: 'Demo',
  damnit_path: '',
  shot_count: shots.length,
  latest_shot_number: shots.at(-1)?.shot_number ?? null,
  last_shot_at: shots.at(-1)?.fired_at ?? null,
  fired_since: shots.length,
  waiting: 0,
  needs_review: 0,
  needs_revision: 0,
})

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>
}

describe('shot page refreshes itself', () => {
  it('fetches the shots again only when the summary changed', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    let served = [makeShot(1), makeShot(2)]
    const fetchMock = vi.fn((url: string) => {
      const value =
        url === '/metadata/hzdr/sources/demo/shots'
          ? served
          : url.startsWith('/metadata/hzdr/source-summaries')
            ? [summary(served)]
            : url === '/metadata/hzdr/sources/demo'
              ? { key: 'demo', title: 'Demo', shots: [], metadata: {} }
              : url.includes('/shots/')
                ? { shot: served[0], hdf5_datasets: [], hdf5_exists: false }
                : { columns: [], rows: [] }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const shotFetches = () =>
      fetchMock.mock.calls.filter(
        ([url]) => url === '/metadata/hzdr/sources/demo/shots'
      ).length

    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/source/demo']}>
          <Routes>
            <Route
              path="/source/:source_key"
              element={
                <>
                  <HZDRShotPage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    const table = await screen.findByRole('table')
    const rowCount = () => within(table).getAllByRole('row').length - 1
    await vi.waitFor(() => expect(rowCount()).toBe(2))
    expect(polling.intervalMs).toBe(20_000)
    expect(shotFetches()).toBe(1)

    // The first summary is the baseline; an unchanged one fetches nothing.
    await act(() => polling.poll!())
    await act(() => polling.poll!())
    expect(shotFetches()).toBe(1)

    // A new shot: the summary changes, the shots are fetched once more.
    served = [...served, makeShot(3)]
    await act(() => polling.poll!())
    await vi.waitFor(() => expect(rowCount()).toBe(3))
    expect(shotFetches()).toBe(2)
    await act(() => polling.poll!())
    expect(shotFetches()).toBe(2)

    // The notice names the arrival and selects it on click.
    expect(screen.queryByText(/new shots? arrived/)).not.toBeNull()
    fireEvent.click(screen.getByText('1 new shot arrived: show it'))
    await vi.waitFor(() =>
      expect(screen.getByTestId('location').textContent).toContain(
        encodeURIComponent('demo:20261121:000003')
      )
    )
    expect(screen.queryByText(/new shots? arrived/)).toBeNull()
  })

  it('shows no arrival notice for the first load', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const shots = [makeShot(1)]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url === '/metadata/hzdr/sources/demo/shots'
                ? shots
                : url.startsWith('/metadata/hzdr/source-summaries')
                  ? [summary(shots)]
                  : { columns: [], rows: [], key: 'demo', metadata: {} }
            ),
        })
      )
    )
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/source/demo']}>
          <Routes>
            <Route path="/source/:source_key" element={<HZDRShotPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    await screen.findByRole('table')
    await act(() => polling.poll!())
    expect(screen.queryByText(/new shots? arrived/)).toBeNull()
  })
})

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router'

import { HZDRShotPage } from '../ShotPage'
import type { HZDRShot } from '../../types'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))
vi.mock('../../components/CampaignCards', () => ({ CampaignCards: () => null }))
vi.mock('../../components/ShotTable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ShotTable')>()),
  SelectedCellPanel: () => null,
  HZDRShotSetsPanel: () => null,
  ShotDetailPanel: () => null,
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('shot table with repeated canonical keys', () => {
  it('preserves every record in time order and hides body cells after sorting', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const user = userEvent.setup()
    const shots: HZDRShot[] = [
      [14, '2026-04-29T11:41:04Z', 'a', 0],
      [14, '2026-04-29T11:41:54Z', 'b', 0],
      [40, '2026-06-17T10:38:36Z', 'c', 2],
      [40, '2026-06-17T10:38:36Z', 'd', 3],
      [50, '2026-06-17T10:56:45Z', 'e', 1],
      [50, '2026-06-17T10:57:46Z', 'f', 7],
    ].map(([number, time, record, version]) => ({
      source_key: 'radbio',
      shot_number: Number(number),
      shot_key: `radbio:${String(time).slice(0, 10)}:${number}`,
      fired_at: String(time),
      labfrog_record_id: String(record),
      metadata: { target: `target-${record}`, version },
      events: [],
      data_products: [],
    }))
    const base = '/metadata/hzdr/sources/radbio'
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const source = { key: 'radbio', title: 'Radbio', shots, metadata: {} }
        const value =
          url === `${base}/shots`
            ? shots
            : url === '/metadata/hzdr/sources'
              ? [source]
              : url === base
                ? source
                : url.includes('/shots/')
                  ? { shot: shots[0], hdf5_datasets: [], hdf5_exists: false }
                  : { columns: [{ name: 'owner', title: 'Owner' }], rows: [] }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
      })
    )
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/source/radbio']}>
          <Routes>
            <Route path="/source/:source_key" element={<HZDRShotPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    const table = await screen.findByRole('table')
    await waitFor(() =>
      expect(within(table).getAllByRole('row')).toHaveLength(7)
    )
    const rows = () => within(table).getAllByRole('row').slice(1)
    const targets = () =>
      rows().map((row) => within(row).getAllByRole('cell')[5].textContent)
    for (let pass = 0; pass < 2; pass++) {
      await user.click(screen.getByTitle('Sort by Fired at'))
      expect(targets()).toEqual([
        'target-a',
        'target-b',
        'target-c',
        'target-d',
        'target-e',
        'target-f',
      ])
      await user.click(screen.getByTitle('Sort by Fired at'))
      expect(targets()).toEqual([
        'target-f',
        'target-e',
        'target-c',
        'target-d',
        'target-b',
        'target-a',
      ])
    }
    await user.click(screen.getByText('Columns', { exact: true }))
    await user.click(screen.getByRole('checkbox', { name: 'Target' }))
    await user.click(screen.getByRole('checkbox', { name: 'Owner' }))
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5)
    expect(rows()).toHaveLength(6)
    for (const row of rows()) {
      expect(within(row).getAllByRole('cell')).toHaveLength(5)
    }
    expect(within(table).queryByText('target-a')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Target' }))
    expect(targets()).toEqual([
      'target-f',
      'target-e',
      'target-c',
      'target-d',
      'target-b',
      'target-a',
    ])
  })
})

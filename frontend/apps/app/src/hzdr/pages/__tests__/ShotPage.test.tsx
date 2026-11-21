import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { HZDRShotPage } from '../ShotPage'
import type { HZDRShot } from '../../types'

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
  HZDRShotSetsPanel: ({ shots }: { shots: HZDRShot[] }) => (
    <span>{shots.length} trend records</span>
  ),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('shot table with repeated canonical keys', () => {
  it('defaults to latest records, flags conflicts, and preserves sortable history and column hiding', async () => {
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
      metadata: { target: `target-${record}`, version, status: 'active' },
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
            : url.startsWith('/metadata/hzdr/source-summaries')
              ? [{ key: source.key, title: source.title, shot_count: 1 }]
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
      expect(within(table).getAllByRole('row')).toHaveLength(5)
    )
    const rows = () => within(table).getAllByRole('row').slice(1)
    const targets = () =>
      rows().map((row) => within(row).getAllByRole('cell')[5].textContent)
    expect(targets()).toEqual(['target-a', 'target-b', 'target-d', 'target-f'])
    expect(screen.getByText('4 trend records')).toBeInTheDocument()
    expect(within(table).getAllByText('Version conflict')).toHaveLength(2)
    expect(screen.getByText('2 older or archived records')).toBeInTheDocument()
    const history = screen.getByRole('checkbox', {
      name: 'Show older and archived versions',
    })
    expect(history).not.toBeChecked()
    await user.click(history)
    expect(rows()).toHaveLength(6)
    expect(screen.getByText('6 trend records')).toBeInTheDocument()
    expect(within(table).getAllByText('Older version')).toHaveLength(2)
    expect(
      JSON.parse(localStorage.getItem('hzdr:shot-table-view:radbio')!)
        .showHistoricalVersions
    ).toBe(true)
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
    await user.click(history)
    expect(targets()).toEqual(['target-f', 'target-d', 'target-b', 'target-a'])
    expect(screen.getByText('4 trend records')).toBeInTheDocument()
  })
})

describe('shot page quick filters and keyboard', () => {
  const statuses = [
    'processed',
    'needs-review',
    'needs-review',
    'revision-needed',
  ]
  const shots: HZDRShot[] = statuses.map((status, index) => {
    const day = index < 2 ? '2026-07-01' : '2026-07-02'
    return {
      source_key: 'demo',
      shot_number: index + 1,
      shot_key: `demo:${day.replace(/-/g, '')}:${String(index + 1).padStart(6, '0')}`,
      fired_at: `${day}T10:0${index}:00Z`,
      metadata: { status, target: `target-${index + 1}` },
      events: [],
      data_products: [],
    }
  })

  function LocationProbe() {
    const location = useLocation()
    return <output data-testid="location">{location.search}</output>
  }

  async function renderPage(entry = '/source/demo') {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const base = '/metadata/hzdr/sources/demo'
    const source = {
      key: 'demo',
      title: 'HZDR canonical campaign (Demo campaign)',
      shots,
      metadata: {},
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const value =
          url === `${base}/shots`
            ? shots
            : url.startsWith('/metadata/hzdr/source-summaries')
              ? [{ key: source.key, title: source.title, shot_count: 1 }]
              : url === base
                ? source
                : url.includes('/shots/')
                  ? { shot: shots[0], hdf5_datasets: [], hdf5_exists: false }
                  : { columns: [], rows: [] }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
      })
    )
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={[entry]}>
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
    await waitFor(() =>
      expect(within(table).getAllByRole('row')).toHaveLength(5)
    )
    return table
  }

  const shotNumbers = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent)

  it('shows the campaign name, a Campaign picker and Add columns', async () => {
    await renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Demo campaign' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Campaign' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add columns' })).toHaveAttribute(
      'href',
      '/source/demo/context-builder'
    )
    expect(
      screen.queryByRole('link', { name: 'Context builder' })
    ).not.toBeInTheDocument()
    // Shots with no LabFrog record or event: shots, just no known source.
    expect(
      await screen.findByText('No data source is known for these shots yet.')
    ).toBeInTheDocument()
  })

  it('offers the shots fired since your last visit as a quick filter', async () => {
    window.localStorage.setItem(
      'hzdr:shot-page:last-seen:demo',
      String(Date.parse('2026-07-01T10:01:00Z'))
    )
    try {
      const table = await renderPage()
      const chip = await screen.findByRole('checkbox', {
        name: 'New since your last visit 2',
      })
      fireEvent.click(chip)
      await waitFor(() => expect(shotNumbers(table)).toEqual(['3', '4']))
      // This visit's newest shot is remembered for the next one.
      expect(window.localStorage.getItem('hzdr:shot-page:last-seen:demo')).toBe(
        String(Date.parse('2026-07-02T10:03:00Z'))
      )
    } finally {
      window.localStorage.clear()
    }
  })

  it('shows no new-shots filter on a first visit', async () => {
    window.localStorage.clear()
    await renderPage()
    expect(screen.queryByRole('checkbox', { name: /New since/ })).toBeNull()
    window.localStorage.clear()
  })

  it('downloads the table as shown as CSV', async () => {
    await renderPage()
    await screen.findByRole('heading', { name: 'Demo campaign' })
    let saved: Blob | undefined
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob
      return 'blob:shots'
    })
    // jsdom has no object URLs; stand in for them for this one click.
    const original = {
      create: URL.createObjectURL,
      revoke: URL.revokeObjectURL,
    }
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
      expect(click).toHaveBeenCalledTimes(1)
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
      click.mockRestore()
    }
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(saved!)
    })
    const [header, first] = text.split('\r\n')
    expect(header).toBe('shot_key,Shot,Day,Fired at,Status,Energy,Target')
    expect(first.startsWith('demo:20260701:000001,1,')).toBe(true)
  })

  it('filters by status and day chips, combined with the text filter', async () => {
    const user = userEvent.setup()
    const table = await renderPage()
    expect(screen.getByRole('radio', { name: 'All 4' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Needs review 2' }))
    expect(shotNumbers(table)).toEqual(['2', '3'])
    await user.click(screen.getByRole('radio', { name: 'Day 2 1' }))
    expect(shotNumbers(table)).toEqual(['3'])
    expect(
      screen.getByRole('radio', { name: 'Needs revision 1' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'All days 2' }))
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'target-2')
    expect(shotNumbers(table)).toEqual(['2'])
    await user.click(screen.getByRole('radio', { name: 'Needs revision 0' }))
    expect(screen.getByText('No shots match the filter.')).toBeInTheDocument()
  })

  it('puts Trends at the top of the side panel, following the filters', async () => {
    const user = userEvent.setup()
    await renderPage()
    const summaries = screen
      .getAllByText(/^(Trends|Selected cell|Shot detail)$/)
      .map((node) => node.textContent)
    expect(summaries).toEqual(['Trends', 'Selected cell', 'Shot detail'])
    expect(screen.queryByText('Shot sets')).not.toBeInTheDocument()
    // the panel (stubbed here) gets the shots the table shows
    expect(screen.getByText('4 trend records')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Needs review 2' }))
    expect(screen.getByText('2 trend records')).toBeInTheDocument()
  })

  it('opens on the shot a link names, and keeps the selection in the URL', async () => {
    const user = userEvent.setup()
    const table = await renderPage('/source/demo?shot=demo:20260702:000003')
    const rows = () => within(table).getAllByRole('row').slice(1)
    const selected = () =>
      rows().findIndex((row) => row.getAttribute('aria-selected') === 'true')
    expect(selected()).toBe(2)
    const linked = () =>
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get(
        'shot'
      )
    expect(linked()).toBe('demo:20260702:000003')
    await user.click(within(rows()[0]).getAllByRole('button')[5])
    await waitFor(() => expect(linked()).toBe('demo:20260701:000001'))
  })

  it('moves the selection with Up and Down, not inside inputs', async () => {
    const user = userEvent.setup()
    const table = await renderPage()
    const rows = () => within(table).getAllByRole('row').slice(1)
    const selected = () =>
      rows().findIndex((row) => row.getAttribute('aria-selected') === 'true')
    expect(selected()).toBe(0)
    await user.click(within(rows()[0]).getAllByRole('button')[5])
    await user.keyboard('{ArrowDown}')
    expect(selected()).toBe(1)
    expect(document.activeElement).toBe(
      within(rows()[1]).getAllByRole('button')[5]
    )
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(selected()).toBe(3)
    await user.keyboard('{ArrowUp}')
    expect(selected()).toBe(2)
    await user.click(screen.getByRole('textbox', { name: 'Value' }))
    await user.keyboard('{ArrowUp}')
    expect(selected()).toBe(2)
  })
})

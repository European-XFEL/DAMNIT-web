import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import { SavedViewChips } from '../SavedViewChips'
import type { ShotTableView } from '../../utils/table-view'

const VIEW: ShotTableView = {
  filterColumn: 'all',
  filterOperator: 'includes',
  filterValue: '',
  sortState: { column: 'shot_number', direction: 'asc' },
  hiddenTableColumns: [],
  showHistoricalVersions: false,
  columnOrder: [],
}
const ENERGY_FIRST: ShotTableView = {
  ...VIEW,
  sortState: { column: 'laser_energy_j', direction: 'desc' },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubViews(records: unknown, ok = true) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'new', name: body.name }),
        })
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ deleted: true }),
        })
      }
      return Promise.resolve({ ok, json: () => Promise.resolve(records) })
    })
  )
  return calls
}

function renderChips(onApply = vi.fn(), current = VIEW) {
  render(
    <MantineProvider>
      <SavedViewChips sourceKey="c" currentView={current} onApply={onApply} />
    </MantineProvider>
  )
  return onApply
}

describe('SavedViewChips', () => {
  it('applies a saved view with one click and marks the current one', async () => {
    stubViews([
      { id: 'v1', name: 'Energy first', kind: 'table', state: ENERGY_FIRST },
      { id: 'v2', name: 'Broken', kind: 'table', state: { nope: 1 } },
    ])
    const onApply = renderChips(vi.fn(), ENERGY_FIRST)
    const chip = await screen.findByRole('button', { name: 'Energy first' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // A view whose state is not a table view is left out.
    expect(screen.queryByRole('button', { name: 'Broken' })).toBeNull()
    fireEvent.click(chip)
    expect(onApply).toHaveBeenCalledWith(ENERGY_FIRST)
  })

  it('saves the current view under a name and deletes one', async () => {
    const calls = stubViews([
      { id: 'v1', name: 'Energy first', kind: 'table', state: ENERGY_FIRST },
    ])
    renderChips()
    fireEvent.click(await screen.findByRole('button', { name: 'Save view' }))
    fireEvent.change(await screen.findByLabelText('View name'), {
      target: { value: 'Default' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByRole('button', { name: 'Default' })
    ).toBeInTheDocument()
    const post = calls.find((call) => call.init?.method === 'POST')
    expect(post?.url).toBe('/metadata/hzdr/sources/c/views')
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      name: 'Default',
      kind: 'table',
      state: VIEW,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete view Energy first' })
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Energy first' })).toBeNull()
    )
    expect(
      calls.some(
        (call) =>
          call.init?.method === 'DELETE' &&
          call.url === '/metadata/hzdr/sources/c/views/v1'
      )
    ).toBe(true)
  })

  it('shows nothing where the API keeps no views', async () => {
    stubViews({ detail: 'no view store' }, false)
    renderChips()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('button', { name: 'Save view' })).toBeNull()
  })
})

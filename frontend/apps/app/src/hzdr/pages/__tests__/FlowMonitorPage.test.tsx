import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import { DEMO_BANNER, HZDRFlowMonitorPage } from '../FlowMonitorPage'
import { FLOW_MODE_STORAGE_KEY } from '../../utils/flow-mode'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))

const SOURCE = {
  key: 'campaign-a',
  title: 'HZDR canonical campaign (Campaign A)',
  shots: [{ source_key: 'campaign-a', shot_number: 41, fired_at: '' }],
}

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response)
}

function mockApi(liveTraffic: boolean) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/config/runtime') {
      return json({
        flow_monitor: {
          receivers: { laser_data: true, watchdog: true, mongo: true },
          live_traffic: liveTraffic,
        },
        terminology: {},
      })
    }
    if (url === '/metadata/hzdr/sources') {
      return json([SOURCE])
    }
    if (url === '/metadata/hzdr/emulator/events') {
      return json(SOURCE)
    }
    if (url === '/config/health') {
      return json({
        asapo: { reachable: true, latency_ms: 1 },
        kafka: { reachable: true, latency_ms: 1 },
        mongo: { reachable: true, latency_ms: 1 },
      })
    }
    if (url === '/config/flow-activity') {
      return json({
        kafka: { available: true, topics: [] },
        spool: { files: [] },
        asapo: { available: false, detail: 'not configured' },
      })
    }
    return json(null)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  return render(
    <MantineProvider>
      <HZDRFlowMonitorPage />
    </MantineProvider>
  )
}

function modeRadio(name: 'Demo' | 'Live') {
  return screen.getByRole('radio', { name }) as HTMLInputElement
}

beforeEach(() => {
  window.localStorage.clear()
  // SegmentedControl's indicator measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('flow monitor mode', () => {
  it('opens in Live when the deployment receives live traffic', async () => {
    mockApi(true)
    renderPage()
    await waitFor(() => expect(modeRadio('Live').checked).toBe(true))
    expect(screen.queryByText(DEMO_BANNER)).toBeNull()
    expect(screen.getByText(/Shows real traffic reaching/)).toBeTruthy()
  })

  it('opens in Demo, with the banner, when no live traffic is configured', async () => {
    const fetchMock = mockApi(false)
    renderPage()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/config/runtime')
    )
    expect(modeRadio('Demo').checked).toBe(true)
    expect(screen.getByText(DEMO_BANNER)).toBeTruthy()
    expect(screen.getByText(/Try the flow with emulated events/)).toBeTruthy()
  })

  it('prefers the stored choice and remembers a new one', async () => {
    window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, 'demo')
    const fetchMock = mockApi(true)
    renderPage()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/config/runtime')
    )
    await screen.findByText('Shot table')
    expect(modeRadio('Demo').checked).toBe(true)
    expect(screen.getByText(DEMO_BANNER)).toBeTruthy()

    fireEvent.click(modeRadio('Live'))
    expect(modeRadio('Live').checked).toBe(true)
    expect(window.localStorage.getItem(FLOW_MODE_STORAGE_KEY)).toBe('live')
    expect(screen.queryByText(DEMO_BANNER)).toBeNull()
  })
})

describe('flow monitor layout', () => {
  it('uses plain labels and shows only the current campaign', async () => {
    mockApi(false)
    renderPage()
    expect(await screen.findByDisplayValue('Campaign A')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy()
    expect(screen.queryByText('Poll DAMNIT')).toBeNull()
    expect(screen.getByText('No traffic now')).toBeTruthy()
    expect(screen.queryByText(/traffic path/)).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Campaign' })).toBeTruthy()
    const shotTable = screen.getByText('Shot table').closest('a')
    expect(shotTable?.getAttribute('href')).toBe('/source/campaign-a')
    const addColumns = screen.getByText('Add columns').closest('a')
    expect(addColumns?.getAttribute('href')).toBe(
      '/source/campaign-a/context-builder'
    )
    // The campaign list from Home is no longer repeated here.
    expect(screen.queryByRole('link', { name: 'Campaign A' })).toBeNull()
    expect(screen.queryByText('Table data')).toBeNull()
  })

  it('logs traffic with time, source, what happened and the shot', async () => {
    mockApi(false)
    renderPage()
    await screen.findByDisplayValue('Campaign A')
    expect(screen.getByText(/No traffic yet/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New shot' }))

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(headers).toEqual(['Time', 'Source', 'What happened', 'Shot'])
    const row = within(table).getAllByText('Shot trigger')[0].closest('tr')
    expect(row).toBeTruthy()
    expect(within(row as HTMLElement).getByText('42')).toBeTruthy()
    expect(screen.getByText(/^\d+ paths? active$/)).toBeTruthy()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router'

import type { HZDRShot, HZDRShotDetail } from '../../types'
import { clearDatasetPreviewCache } from '../../utils/columnPreview'
import { ShotDetailPanel } from '../ShotDetailPanel'

const CAMPAIGN = 'demo-campaign'
const ENERGY = `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000007-energy/values`
const WAVEFORM = `entry/laserdata/waveform/laserdata-${CAMPAIGN}-shot-000007-waveform/values`

const shot: HZDRShot = {
  source_key: CAMPAIGN,
  shot_number: 7,
  fired_at: '2026-07-01T09:36:00Z',
  shot_key: `${CAMPAIGN}:20260701:000007`,
  match_quality: 'exact_kafka_event_id',
  metadata: { status: 'needs-review', shot_id: 'shot-000007' },
  events: [],
  data_products: [
    {
      product_id: 'waveform',
      source: 'LaserData',
      kind: 'hdf5_dataset',
      dataset_name: `/${WAVEFORM}`,
      preview_kind: 'line',
      shape: [64],
      dtype: 'float64',
      metadata: {},
    },
    {
      product_id: 'file',
      source: 'DAQ-File-Watchdog',
      kind: 'file',
      path: '/bigdata/raw/shot7.tif',
      shape: [],
      metadata: {},
      reachable: false,
    },
  ],
}

const ds = (name: string) => ({ name, shape: [1], dtype: 'float64' })
const detail: HZDRShotDetail = {
  shot,
  hdf5_exists: true,
  container: '20260701_000007',
  hdf5_datasets: [
    ds('20260701_000007/instrument/camera_1/data'),
    ds('20260701_000007/instrument/spectrometer/spectrum'),
    ds(ENERGY),
    ds(WAVEFORM),
    ds(
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000017-energy/values`
    ),
    ds(
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000070-energy/values`
    ),
    ds('entry/shots/shot_number'),
  ],
}

function renderPanel(onUpdateStatus = vi.fn(), panelShot: HZDRShot = shot) {
  render(
    <MantineProvider>
      <MemoryRouter>
        <ShotDetailPanel
          shot={panelShot}
          shotDetail={{ ...detail, shot: panelShot }}
          sourceKey={CAMPAIGN}
          availableSources={[]}
          onUpdateStatus={onUpdateStatus}
        />
      </MemoryRouter>
    </MantineProvider>
  )
  return onUpdateStatus
}

beforeEach(() => {
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
  clearDatasetPreviewCache()
  vi.unstubAllGlobals()
})

describe('ShotDetailPanel facts', () => {
  it('shows readable fields, Not recorded for gaps, and a copyable shot key', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderPanel()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    const quality = screen.getByText('Matched by its Kafka event id')
    expect(quality).toHaveAttribute('title', 'exact_kafka_event_id')
    expect(screen.getByTitle('2026-07-01T09:36:00Z')).toBeInTheDocument()
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
    expect(screen.getByText(`${CAMPAIGN}:20260701:000007`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(`${CAMPAIGN}:20260701:000007`)
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument()
  })

  it('says so when the clipboard refuses', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(
      await screen.findByRole('button', { name: 'Could not copy' })
    ).toBeInTheDocument()
  })
})

describe('ShotDetailPanel review', () => {
  it('saves the chosen status with the note, or the default note', async () => {
    const user = userEvent.setup()
    const onUpdateStatus = renderPanel()
    const rowKey = `${CAMPAIGN}:20260701:000007`
    await user.click(screen.getByText('Revise'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUpdateStatus).toHaveBeenLastCalledWith(
      rowKey,
      'revision-needed',
      'Processed data needs revision'
    )
    await user.click(screen.getByText('OK'))
    await user.type(
      screen.getByRole('textbox', { name: 'Review note' }),
      'fine'
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUpdateStatus).toHaveBeenLastCalledWith(rowKey, 'processed', 'fine')
  })
})

describe('ShotDetailPanel datasets', () => {
  it('lists only the shot’s datasets as a tree, the rest behind a toggle', async () => {
    const user = userEvent.setup()
    renderPanel()
    // The top level is open (a lone folder chain reads as one); deeper
    // folders are folded.
    expect(screen.getByText('20260701_000007/instrument')).toBeInTheDocument()
    expect(screen.getByText('entry/laserdata')).toBeInTheDocument()
    expect(screen.getByText('camera_1')).toBeInTheDocument()
    expect(screen.queryByText('data')).not.toBeInTheDocument()
    expect(screen.queryByText('shot_number')).not.toBeInTheDocument()
    await user.click(screen.getByText('camera_1'))
    expect(screen.getByText('data')).toBeInTheDocument()

    const toggle = screen.getByRole('button', {
      name: 'Show the campaign file (3 datasets)',
    })
    await user.click(toggle)
    expect(screen.getByText('entry')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Hide the campaign file' })
    )
    expect(screen.queryByText('entry')).not.toBeInTheDocument()
  })

  it('searches and opens every matching folder', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(
      screen.getByRole('textbox', { name: 'Search datasets' }),
      'spectrum'
    )
    expect(screen.getByText('spectrum')).toBeInTheDocument()
    expect(screen.queryByText('camera_1')).not.toBeInTheDocument()
    expect(screen.queryByText('entry/laserdata')).not.toBeInTheDocument()
  })
})

describe('ShotDetailPanel link', () => {
  it('copies a link that opens the campaign on this shot', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/source/${CAMPAIGN}?shot=${encodeURIComponent(shot.shot_key!)}`
    )
    expect(
      await screen.findByRole('button', { name: 'Link copied' })
    ).toBeInTheDocument()
  })
})

describe('ShotDetailPanel data products', () => {
  it('links Add as column for a per-shot dataset, with the shot', () => {
    const perShot = 'fixtures/by_shot/shot-000007/images/camera_raw'
    renderPanel(vi.fn(), {
      ...shot,
      data_products: [
        {
          product_id: 'camera',
          source: 'Camera',
          kind: 'hdf5_dataset',
          dataset_name: `/${perShot}`,
          preview_kind: 'image',
          shape: [64, 64],
          dtype: 'float32',
          metadata: {},
        },
      ],
    })
    const link = screen.getByRole('link', { name: 'Add as column' })
    const url = new URL(link.getAttribute('href')!, 'http://x')
    expect(url.pathname).toBe(`/source/${CAMPAIGN}/context-builder`)
    expect(url.searchParams.get('add')).toBe(
      'hdf5:fixtures/by_shot/{shot_id}/images/camera_raw'
    )
    expect(url.searchParams.get('shot')).toBe(shot.shot_key)
  })

  it('previews an in-file product on request; a one-shot dataset is no column', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            name: WAVEFORM,
            dtype: 'float64',
            shape: [64],
            preview: Array.from({ length: 64 }, (_, i) => Math.sin(i / 4)),
            preview_kind: 'line',
          }),
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()
    const products = screen
      .getByText('Data products')
      .closest('.mantine-Card-root') as HTMLElement
    // One previewable product: the file on disk has neither.
    expect(
      within(products).getAllByRole('button', { name: 'Preview' })
    ).toHaveLength(1)
    expect(within(products).getByText('missing')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    // the waveform's dataset is named for this shot's event: no column
    expect(
      within(products).queryByRole('link', { name: 'Add as column' })
    ).not.toBeInTheDocument()
    await user.click(within(products).getByRole('button', { name: 'Preview' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/metadata/hzdr/sources/${CAMPAIGN}/shots/7/datasets/${WAVEFORM}?shot_key=${encodeURIComponent(shot.shot_key!)}`
      )
    )
    await waitFor(() => expect(products.querySelector('svg')).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

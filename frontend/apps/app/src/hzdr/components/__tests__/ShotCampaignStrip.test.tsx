import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router'

import { ShotCampaignStrip } from '../ShotCampaignStrip'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderStrip() {
  render(
    <MantineProvider>
      <MemoryRouter>
        <ShotCampaignStrip sourceKey="radbio" />
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('ShotCampaignStrip', () => {
  it('links the SciCat dataset and the wiki, and counts producers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const value = url.endsWith('/scicat')
          ? {
              configured: true,
              registered: true,
              pid: 'pid-1',
              dataset_url: 'https://scicat.example/datasets/pid-1',
            }
          : url.endsWith('/wiki')
            ? {
                configured: true,
                page_title: 'FWKT:Radbio',
                page_url: 'https://wiki.example/radbio',
              }
            : {
                watchdog_hosts: [1, 2, 3, 4].map((n) => ({ host: `daq-${n}` })),
                shotcounter: { status: 'active', last_event_at: null },
              }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
      })
    )
    renderStrip()
    expect(
      await screen.findByRole('link', { name: 'SciCat: pid-1' })
    ).toHaveAttribute('href', 'https://scicat.example/datasets/pid-1')
    expect(
      await screen.findByRole('link', { name: 'Wiki: FWKT:Radbio' })
    ).toHaveAttribute('href', 'https://wiki.example/radbio')
    expect(await screen.findByText('Shotcounter active')).toBeInTheDocument()
    expect(screen.getByText('4 watchdog sources')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Flow monitor' })).toHaveAttribute(
      'href',
      '/flow-monitor'
    )
  })

  it('says what is missing when the endpoints fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')))
    )
    renderStrip()
    expect(
      await screen.findByText('SciCat: not registered yet')
    ).toBeInTheDocument()
    expect(screen.getByText('Wiki: none')).toBeInTheDocument()
    expect(screen.getByText('Shotcounter: unknown')).toBeInTheDocument()
    expect(screen.getByText('Watchdog sources: unknown')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Flow monitor' })
    ).toBeInTheDocument()
  })
})

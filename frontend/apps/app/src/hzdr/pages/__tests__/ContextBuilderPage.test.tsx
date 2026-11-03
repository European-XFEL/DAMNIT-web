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

import { ContextBuilderPage } from '../ContextBuilderPage'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))
vi.mock('../../components/previews', () => ({ VisualPreview: () => null }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('ContextBuilderPage example shots', () => {
  it.each([
    [true, 1],
    [false, 1],
    [true, 0],
  ] as const)(
    'keeps repeated shot numbers selectable (canonical keys: %s, number: %s)',
    async (withKeys, shotNumber) => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        }
      )
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
      })
      const user = userEvent.setup()
      const shots = ['2026-05-05', '2026-05-06'].map((day) => ({
        source_key: 'radbio',
        shot_number: shotNumber,
        fired_at: `${day}T08:15:00Z`,
        ...(withKeys ? { shot_key: `radbio:${day}:000001` } : {}),
        metadata: {
          [day === '2026-05-05' ? 'first_day' : 'second_day']: 2,
          labfrog_variables: {
            laser_energy: { value: day === '2026-05-05' ? 2 : 7.9, unit: 'J' },
          },
        },
        events: [],
        data_products: [],
      }))
      const base = '/metadata/hzdr/sources/radbio'
      const fetchMock = vi.fn((url: string) => {
        const value =
          url === `${base}/shots`
            ? shots
            : url === base
              ? { key: 'radbio', title: 'Radbio' }
              : url.endsWith('/files')
                ? []
                : url.includes('/shots/')
                  ? {
                      shot: shots[0],
                      hdf5_datasets: [
                        { name: 'signal', shape: [2], dtype: 'float64' },
                      ],
                      hdf5_exists: true,
                    }
                  : { fileContent: '' }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
      })
      vi.stubGlobal('fetch', fetchMock)
      render(
        <MantineProvider>
          <MemoryRouter initialEntries={['/source/radbio/context-builder']}>
            <Routes>
              <Route
                path="/source/:source_key/context-builder"
                element={<ContextBuilderPage />}
              />
            </Routes>
          </MemoryRouter>
        </MantineProvider>
      )

      // The selector lives in a disclosure; keep the real Mantine Select so
      // duplicate option values fail here just as they do in the browser.
      const selector = screen.getByRole('textbox', { name: 'Example shot' })
      await waitFor(() =>
        expect(selector).toHaveValue(`${shotNumber} - 2026-05-05T08:15:00Z`)
      )
      await user.click(selector)
      await user.click(
        await screen.findByRole('option', {
          name: `${shotNumber} - 2026-05-06T08:15:00Z`,
        })
      )
      expect(selector).toHaveValue(`${shotNumber} - 2026-05-06T08:15:00Z`)
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          withKeys
            ? `${base}/shots/by-key/${encodeURIComponent(shots[1].shot_key!)}`
            : `${base}/shots/${shotNumber}`
        )
      )
      const data = screen.getByRole('textbox', { name: 'Data to use' })
      await user.click(data)
      expect(
        await screen.findByRole('option', { name: 'Second day (1/2 shots)' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'First day (1/2 shots)' })
      ).toBeInTheDocument()
      await user.click(
        screen.getByRole('option', { name: 'Laser energy (2/2 shots)' })
      )
      expect(screen.getByRole('textbox', { name: 'Column title' })).toHaveValue(
        'Laser energy'
      )
      expect(
        within(
          screen.getByText('Value on example shot').parentElement!
        ).getByText('7.9000')
      ).toBeInTheDocument()
      await user.click(data)
      await user.click(
        screen.getByRole('option', { name: 'First day (1/2 shots)' })
      )
      expect(screen.getByText('Not available on this shot')).toBeInTheDocument()
      await user.click(
        screen.getByRole('button', { name: 'Use a shot with this field' })
      )
      expect(selector).toHaveValue(`${shotNumber} - 2026-05-05T08:15:00Z`)
      await user.click(selector)
      await user.click(
        await screen.findByRole('option', {
          name: `${shotNumber} - 2026-05-06T08:15:00Z`,
        })
      )
      await user.click(data)
      await user.click(
        await screen.findByRole('option', { name: 'signal (float64, 2)' })
      )
      await user.click(
        screen.getByRole('button', { name: 'Preview example data' })
      )
      const query = withKeys
        ? `?${new URLSearchParams({ shot_key: shots[1].shot_key! })}`
        : ''
      expect(fetchMock).toHaveBeenCalledWith(
        `${base}/shots/${shotNumber}/datasets/signal${query}`
      )
    }
  )
})

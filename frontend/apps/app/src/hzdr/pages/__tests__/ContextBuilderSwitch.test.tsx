import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import type { NavigateFunction } from 'react-router'

import { ContextBuilderPage } from '../ContextBuilderPage'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))
vi.mock('../../components/previews', () => ({
  MetadataTrendPreview: () => null,
  CanvasImage: () => null,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const suggestion = (campaign: string) => ({
  id: `labfrog:${campaign}`,
  title: `Only in ${campaign}`,
  function: `only_${campaign}`,
  origin: 'labfrog',
  originLabel: 'LabFrog record',
  field: `labfrog_variables.${campaign}.value`,
  path: `meta#labfrog_variables.${campaign}.value`,
  type: 'number',
  unit: '',
  count: 1,
  total: 1,
  examples: [],
  reason: 'Recorded on 1 of 1 shots',
  starter: false,
  block: '',
  display: 'number',
  displayLabel: 'Number column',
  displayHelp: '',
})

describe('Context Builder across campaigns', () => {
  it('drops the suggestions of the campaign it left', async () => {
    let releaseA: (value: unknown) => void = () => {}
    const fetchMock = vi.fn((url: string) => {
      if (url === '/contextfile/campaign/a/assist') {
        // campaign A answers late, after the page moved on to B
        return new Promise((resolve) => {
          releaseA = resolve
        })
      }
      const value = url.endsWith('/assist')
        ? { suggestions: [suggestion('b')] }
        : url.endsWith('/shots') || url.endsWith('/files')
          ? []
          : url.includes('/contextfile/')
            ? { fileContent: '' }
            : { key: 'x', title: 'x' }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    let navigate: NavigateFunction = () => {}
    function Navigator() {
      navigate = useNavigate()
      return null
    }
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/source/a/context-builder']}>
          <Navigator />
          <Routes>
            <Route
              path="/source/:source_key/context-builder"
              element={<ContextBuilderPage />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    )
    await act(async () => {
      navigate('/source/b/context-builder')
    })
    expect(await screen.findByText('Only in b')).toBeInTheDocument()
    await act(async () => {
      releaseA({
        ok: true,
        json: () => Promise.resolve({ suggestions: [suggestion('a')] }),
      })
    })
    expect(screen.queryByText('Only in a')).not.toBeInTheDocument()
    expect(screen.getByText('Only in b')).toBeInTheDocument()
  })
})

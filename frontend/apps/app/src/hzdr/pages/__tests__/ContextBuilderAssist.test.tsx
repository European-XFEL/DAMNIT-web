import type { ReactNode } from 'react'
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
import { MemoryRouter, Route, Routes } from 'react-router'

import { ContextBuilderPage } from '../ContextBuilderPage'
import { clearDatasetPreviewCache } from '../../utils/columnPreview'

vi.mock('@damnit-frontend/ui', () => ({
  HomePage: ({ main }: { main: ReactNode }) => main,
}))
vi.mock('../../components/AppHeader', () => ({ AppHeader: () => null }))
// Plotly is heavy in jsdom; the charts themselves are not under test here.
vi.mock('../../components/previews', () => ({
  MetadataTrendPreview: ({ title }: { title: string }) => (
    <div>Trend: {title}</div>
  ),
  CanvasImage: () => <div role="img" aria-label="Image preview" />,
}))

const base = '/metadata/hzdr/sources/radbio'
const filesBase = '/contextfile/campaign/radbio/me/files'
const chargeBlock = `from damnit_ctx import Skip, Variable


@Variable(title='ICT charge (nC)')
def ict_charge(run, value: 'meta#labfrog_variables.ICT charge.value' = None):
    return float(value)
`
const suggestions = [
  {
    id: 'labfrog:ICT charge',
    title: 'ICT charge (nC)',
    function: 'ict_charge',
    origin: 'labfrog',
    originLabel: 'LabFrog record',
    field: 'labfrog_variables.ICT charge.value',
    path: 'meta#labfrog_variables.ICT charge.value',
    type: 'number',
    unit: 'nC',
    count: 2,
    total: 2,
    examples: ['1,5', '3'],
    reason: 'Recorded on 2 of 2 shots, from 1.5 to 3 nC, 2 different values.',
    starter: true,
    block: chargeBlock,
    display: 'number',
    displayLabel: 'Number column',
    displayHelp: 'Shows the value in each shot’s row.',
  },
  {
    id: 'labfrog:Shot group',
    title: 'Shot group',
    function: 'shot_group',
    origin: 'labfrog',
    originLabel: 'LabFrog record',
    field: 'labfrog_variables.Shot group.value',
    path: 'meta#labfrog_variables.Shot group.value',
    type: 'text',
    unit: '',
    count: 2,
    total: 2,
    examples: ['A', 'B'],
    reason: 'Recorded on 2 of 2 shots as one of 2 labels: A (1), B (1).',
    starter: false,
    block: chargeBlock
      .replace('ICT charge (nC)', 'Shot group')
      .replace('ict_charge', 'shot_group')
      .replace('ICT charge.value', 'Shot group.value'),
    display: 'text',
    displayLabel: 'Label column',
    displayHelp: 'Shows the label.',
  },
]
const shots = [1, 2].map((number) => ({
  source_key: 'radbio',
  shot_number: number,
  fired_at: `2026-05-0${number}T08:15:00Z`,
  shot_key: `radbio:2026050${number}:00000${number}`,
  metadata: {
    labfrog_variables: {
      'ICT charge': { value: number === 1 ? '1,5' : '3', unit: 'nC' },
      'Shot group': { value: number === 1 ? 'A' : 'B' },
    },
  },
  events: [],
  data_products: [],
}))

const existingFile =
  'from damnit_ctx import Variable\n\n\n@Variable(title="Existing")\ndef existing(run):\n    return 1\n'

function setup({
  url = '/source/radbio/context-builder',
  fileContent = existingFile,
  failPut = false,
}: { url?: string; fileContent?: string; failPut?: boolean } = {}) {
  const saved: Record<string, string> = {}
  const puts: string[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const { fileContent } = JSON.parse(String(init.body)) as {
        fileContent: string
      }
      puts.push(fileContent)
      if (failPut) return Promise.reject(new Error('offline'))
      saved[url] = fileContent
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ fileContent, path: url }),
      })
    }
    const value =
      url === `${base}/shots`
        ? shots
        : url === base
          ? { key: 'radbio', title: 'HZDR canonical campaign (Radbio)' }
          : url.includes('/datasets/')
            ? {
                name: 'cam/image',
                dtype: 'uint16',
                shape: [64, 64],
                preview: [
                  [0, 1],
                  [1, 0],
                ],
                preview_kind: 'image',
                summary: 42,
                summary_exact: true,
              }
            : url.endsWith('/assist')
              ? { campaign: 'radbio', suggestions }
              : url.endsWith('/files')
                ? [{ name: 'context.py', active: true }]
                : url.includes('/shots/')
                  ? {
                      shot: shots[0],
                      hdf5_datasets: [
                        {
                          name: 'cam/image',
                          shape: [64, 64],
                          dtype: 'uint16',
                        },
                      ],
                      hdf5_exists: true,
                    }
                  : { fileContent }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(value) })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/source/:source_key/context-builder"
            element={<ContextBuilderPage />}
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
  return { fetchMock, saved, puts }
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
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
})

afterEach(() => {
  cleanup()
  clearDatasetPreviewCache()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.matchMedia = originalMatchMedia
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

/** A wide screen: the selected suggestion is previewed in the right column. */
function wideScreen() {
  window.matchMedia = ((query: string) => ({
    ...originalMatchMedia(query),
    matches: query.includes('min-width'),
  })) as typeof window.matchMedia
}

const card = (title: string) =>
  screen.findByRole('article', { name: `Suggestion: ${title}` })

/** Select a row: on a narrow screen its preview opens under it. */
async function openCard(
  user: ReturnType<typeof userEvent.setup>,
  title: string
) {
  const row = await card(title)
  await user.click(within(row).getByRole('button', { name: title }))
  return row
}

const status = () =>
  screen.getAllByRole('status').map((node) => node.textContent)

describe('Context Builder "Help me choose"', () => {
  it('lists each suggestion in one line and explains the selected one', async () => {
    const user = userEvent.setup()
    setup()
    const charge = await card('ICT charge (nC)')
    expect(within(charge).getByText('Top pick')).toBeInTheDocument()
    expect(within(charge).getByText('Number column')).toBeInTheDocument()
    expect(
      within(charge).getByText('2 of 2 shots · 1.5–3 nC')
    ).toBeInTheDocument()
    expect(within(charge).queryByText(/Recorded on 2 of 2 shots/)).toBeNull()
    await openCard(user, 'ICT charge (nC)')
    const detail = within(charge).getByRole('region', {
      name: 'Preview of ICT charge (nC)',
    })
    expect(
      within(detail).getByText(/Recorded on 2 of 2 shots, from 1.5 to 3 nC/)
    ).toBeInTheDocument()
    const image = await card('Image')
    expect(within(image).getByText('Image preview')).toBeInTheDocument()
    expect(
      within(image).getByText('An image on the example shot')
    ).toBeInTheDocument()
    await openCard(user, 'Image')
    expect(within(image).getByText(/On the example shot/)).toBeInTheDocument()
    // One preview open at a time.
    expect(
      screen.queryByRole('region', { name: 'Preview of ICT charge (nC)' })
    ).not.toBeInTheDocument()
  })

  it('adds a suggestion to the context file, which then drops it', async () => {
    const user = userEvent.setup()
    const { saved } = setup()
    const charge = await openCard(user, 'ICT charge (nC)')
    await user.click(
      within(charge).getByRole('button', { name: 'Add this column' })
    )
    await waitFor(() => expect(saved[`${filesBase}/context.py`]).toBeDefined())
    const content = saved[`${filesBase}/context.py`]
    expect(content).toContain('def existing(run)')
    expect(content).toContain(
      "def ict_charge(run, value: 'meta#labfrog_variables.ICT charge.value' = None):"
    )
    // The block's imports land at the top, before any column, so Skip is
    // defined for it (mergeImportsAtTop, as for "Add to context").
    const importLine = content.indexOf('from damnit_ctx import Skip, Variable')
    expect(importLine).toBeGreaterThanOrEqual(0)
    expect(importLine).toBeLessThan(content.indexOf('@Variable'))
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Suggestion: ICT charge (nC)' })
      ).not.toBeInTheDocument()
    )
    expect(screen.getByText(/1 already in context.py/)).toBeInTheDocument()
  })

  it('adds every ticked suggestion in one save', async () => {
    const user = userEvent.setup()
    const { puts } = setup()
    await card('ICT charge (nC)')
    const add = screen.getByRole('button', { name: 'Add ticked columns' })
    expect(add).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', { name: 'Tick ICT charge (nC)' })
    )
    await user.click(screen.getByRole('checkbox', { name: 'Tick Shot group' }))
    await user.click(screen.getByRole('button', { name: 'Add 2 columns' }))
    await waitFor(() =>
      expect(status()).toContain(
        'Added 2 columns to context.py: ICT charge (nC), Shot group.'
      )
    )
    expect(puts).toHaveLength(1)
    const content = puts[0]
    expect(content).toContain('def existing(run)')
    expect(content).toContain('def ict_charge(')
    expect(content).toContain('def shot_group(')
    // The blocks' shared import is added once, at the top.
    expect(
      content.match(/from damnit_ctx import Skip, Variable/g)
    ).toHaveLength(1)
    expect(content.indexOf('import Skip')).toBeLessThan(
      content.indexOf('@Variable')
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Suggestion: Shot group' })
      ).not.toBeInTheDocument()
    )
    expect(screen.getByText(/2 already in context.py/)).toBeInTheDocument()
  })

  it('says nothing was added when the save fails, and keeps the ticks', async () => {
    const user = userEvent.setup()
    setup({ failPut: true })
    await card('ICT charge (nC)')
    await user.click(
      screen.getByRole('checkbox', { name: 'Tick ICT charge (nC)' })
    )
    await user.click(screen.getByRole('checkbox', { name: 'Tick Shot group' }))
    await user.click(screen.getByRole('button', { name: 'Add 2 columns' }))
    await waitFor(() =>
      expect(status()).toContain(
        'Save failed: none of the 2 columns was added to context.py.'
      )
    )
    expect(
      screen.getByRole('checkbox', { name: 'Tick Shot group' })
    ).toBeChecked()
    expect(await card('ICT charge (nC)')).toBeInTheDocument()
  })

  it('ignores a suggestion until it is asked for again', async () => {
    const user = userEvent.setup()
    const { saved } = setup()
    const group = await openCard(user, 'Shot group')
    await user.click(
      within(group).getByRole('button', { name: 'Ignore this suggestion' })
    )
    expect(
      screen.queryByRole('article', { name: 'Suggestion: Shot group' })
    ).not.toBeInTheDocument()
    expect(saved).toEqual({})
    expect(
      window.localStorage.getItem('hzdr.contextAssist.ignored.radbio')
    ).toBe(JSON.stringify(['labfrog:Shot group']))
    await user.click(
      screen.getByRole('button', { name: 'Show ignored suggestions again' })
    )
    expect(await card('Shot group')).toBeInTheDocument()
  })

  it('ignores the ticked suggestions together', async () => {
    const user = userEvent.setup()
    const { saved } = setup()
    await card('Image')
    await user.click(screen.getByRole('checkbox', { name: 'Tick Shot group' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tick Image' }))
    await user.click(screen.getByRole('button', { name: 'Ignore ticked' }))
    expect(
      JSON.parse(
        window.localStorage.getItem('hzdr.contextAssist.ignored.radbio') ?? ''
      )
    ).toEqual(['labfrog:Shot group', 'hdf5:cam/image'])
    expect(status()).toContain('Ignored 2 suggestions.')
    expect(saved).toEqual({})
    expect(
      screen.queryByRole('article', { name: 'Suggestion: Image' })
    ).toBeNull()
    expect(await card('ICT charge (nC)')).toBeInTheDocument()
  })

  it('previews a suggestion on the example shot before adding it', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup()
    const charge = await openCard(user, 'ICT charge (nC)')
    expect(within(charge).getByText('1.5 nC')).toBeInTheDocument()
    expect(
      within(charge).getByText('Across the campaign: 2 of 2 shots')
    ).toBeInTheDocument()

    const image = await openCard(user, 'Image')
    expect(await within(image).findByText('42')).toBeInTheDocument()
    expect(
      within(image).getByRole('img', { name: 'Image preview' })
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `${base}/shots/1/datasets/cam/image?${new URLSearchParams({ shot_key: shots[0].shot_key })}`
    )
  })

  it('previews the selected suggestion in the right column on wide screens', async () => {
    wideScreen()
    const user = userEvent.setup()
    setup()
    const charge = await card('ICT charge (nC)')
    // The first suggestion is previewed until another is picked, beside the
    // list rather than inside it.
    const first = await screen.findByRole('region', {
      name: 'Preview of ICT charge (nC)',
    })
    expect(charge).not.toContainElement(first)
    expect(within(first).getByText('1.5 nC')).toBeInTheDocument()
    const group = await card('Shot group')
    await user.click(within(group).getByRole('button', { name: 'Shot group' }))
    const second = screen.getByRole('region', { name: 'Preview of Shot group' })
    expect(group).not.toContainElement(second)
    expect(
      screen.queryByRole('region', { name: 'Preview of ICT charge (nC)' })
    ).not.toBeInTheDocument()
    await user.click(within(second).getByRole('button', { name: 'Show code' }))
    expect(within(second).getByText(/def shot_group/)).toBeInTheDocument()
  })

  it('customises a suggestion in the builder form', async () => {
    const user = userEvent.setup()
    setup()
    const group = await openCard(user, 'Shot group')
    await user.click(within(group).getByRole('button', { name: 'Customise' }))
    expect(screen.getByRole('textbox', { name: 'Column title' })).toHaveValue(
      'Shot group'
    )
    expect(screen.getByRole('textbox', { name: 'Data to use' })).toHaveValue(
      'Shot group (2/2 shots)'
    )
  })

  it('names the campaign in the subtitle', async () => {
    setup()
    expect(
      await screen.findByText(/Choose columns for the Radbio shot table/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Add columns' })
    ).toBeInTheDocument()
  })
})

const twoColumns = `from damnit_ctx import Variable


@Variable(title="First")
def first(run):
    return 1


@Variable(title="Second")
def second(run):
    return 2
`

describe('Context Builder existing columns', () => {
  it('lists the file’s columns and moves one', async () => {
    const user = userEvent.setup()
    const { puts } = setup({ fileContent: twoColumns })
    const first = await screen.findByRole('listitem', { name: 'Column: First' })
    expect(
      within(first).getByRole('button', { name: 'Move First up' })
    ).toBeDisabled()
    await user.click(
      within(first).getByRole('button', { name: 'Move First down' })
    )
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].indexOf('def second')).toBeLessThan(
      puts[0].indexOf('def first')
    )
    expect(status()).toContain('Moved first')
    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Column: Second',
      'Column: First',
    ])
  })

  it('deletes a column only after confirming', async () => {
    const user = userEvent.setup()
    const { puts } = setup({ fileContent: twoColumns })
    const second = await screen.findByRole('listitem', {
      name: 'Column: Second',
    })
    await user.click(
      within(second).getByRole('button', { name: 'Delete Second' })
    )
    const confirm = within(second).getByRole('group', {
      name: 'Confirm deleting Second',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(puts).toHaveLength(0)
    await user.click(
      within(second).getByRole('button', { name: 'Delete Second' })
    )
    await user.click(
      within(
        within(second).getByRole('group', { name: 'Confirm deleting Second' })
      ).getByRole('button', { name: 'Delete' })
    )
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toContain('def first')
    expect(puts[0]).not.toContain('def second')
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Column: Second' })
      ).not.toBeInTheDocument()
    )
  })

  it('loads a column into the builder to replace it', async () => {
    const user = userEvent.setup()
    setup({ fileContent: twoColumns })
    const second = await screen.findByRole('listitem', {
      name: 'Column: Second',
    })
    await user.click(
      within(second).getByRole('button', { name: 'Edit Second' })
    )
    expect(screen.getByRole('textbox', { name: 'Column title' })).toHaveValue(
      'Second'
    )
    expect(within(second).getByText('Editing')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Replace Second' })
    ).toBeInTheDocument()
    await user.click(
      within(second).getByRole('button', { name: 'Stop editing' })
    )
    expect(
      screen.queryByRole('button', { name: 'Replace Second' })
    ).not.toBeInTheDocument()
  })
})

describe('Context Builder deep link (?add=)', () => {
  it('opens the builder with an HDF5 dataset chosen', async () => {
    const { fetchMock } = setup({
      url: '/source/radbio/context-builder?add=hdf5:cam/image',
    })
    expect(
      await screen.findByRole('textbox', { name: 'Column title' })
    ).toHaveValue('Image')
    expect(screen.getByRole('textbox', { name: 'Data to use' })).toHaveValue(
      'cam/image (uint16, 64x64)'
    )
    expect(
      screen.getByRole('textbox', { name: 'What should this column do?' })
    ).toHaveValue('Image with reduced preview')
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/datasets/cam/image')
      )
    )
  })

  it('opens the builder with a recorded field chosen', async () => {
    setup({
      url: `/source/radbio/context-builder?add=${encodeURIComponent('metadata:labfrog_variables.ICT charge.value')}`,
    })
    expect(
      await screen.findByRole('textbox', { name: 'Column title' })
    ).toHaveValue('ICT charge')
    expect(screen.getByRole('textbox', { name: 'Data to use' })).toHaveValue(
      'ICT charge (2/2 shots)'
    )
  })

  it('stays in "Help me choose" with a note for an unknown input', async () => {
    setup({ url: '/source/radbio/context-builder?add=hdf5:missing/data' })
    expect(
      await screen.findByText(/Could not find .* in this campaign/)
    ).toBeInTheDocument()
    expect(await card('ICT charge (nC)')).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Column title' })
    ).not.toBeInTheDocument()
  })
})

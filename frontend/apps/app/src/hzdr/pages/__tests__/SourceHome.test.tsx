import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router'

import type { HZDRSourceSummary } from '../../components/homeCampaignSummary'
import {
  filterCampaigns,
  localMidnightIso,
  sortNewestFirst,
  sourceSummariesUrl,
  summarizeCampaign,
} from '../../components/homeCampaignSummary'
import { HZDRSourceHome } from '../SourceHome'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SOURCES: HZDRSourceSummary[] = [
  {
    key: 'old',
    title: 'HZDR canonical campaign (Pilot_Old_01.2026)',
    damnit_path: '/data/old',
    shot_count: 2,
    last_shot_at: '2026-01-11T09:00:00Z',
    fired_since: 0,
    waiting: 0,
    needs_review: 1,
    needs_revision: 1,
    unreadable_times: 2,
  },
  {
    key: 'new',
    title: 'HZDR canonical campaign (Target_Alignment_11.2026)',
    damnit_path: '/data/new',
    shot_count: 3,
    last_shot_at: new Date().toISOString(),
    fired_since: 2,
    waiting: 3,
    needs_review: 0,
    needs_revision: 0,
  },
]

describe('home campaign summary', () => {
  it('maps the API summary to what Home shows', () => {
    const summary = summarizeCampaign(SOURCES[1])
    expect(summary.title).toBe('Target_Alignment_11.2026')
    expect(summary.shotCount).toBe(3)
    expect(summary.firedToday).toBe(2)
    expect(summary.waiting).toBe(3)
    const old = summarizeCampaign(SOURCES[0])
    expect(old.needsReview).toBe(1)
    expect(old.needsRevision).toBe(1)
    expect(old.lastShotAt).toBe('2026-01-11T09:00:00Z')
    expect(old.lastShotMs).toBe(Date.parse('2026-01-11T09:00:00Z'))
    const broken = summarizeCampaign({ ...SOURCES[0], last_shot_at: 'x' })
    expect(broken.lastShotAt).toBeNull()
    expect(broken.lastShotMs).toBeNull()
  })

  it('asks for today from local midnight, with the local offset', () => {
    const now = new Date(2026, 10, 21, 15, 30)
    const iso = localMidnightIso(now)
    expect(iso).toMatch(/^2026-11-21T00:00:00[+-]\d\d:\d\d$/)
    expect(new Date(iso).getTime()).toBe(new Date(2026, 10, 21).getTime())
    expect(sourceSummariesUrl(now)).toBe(
      `/metadata/hzdr/source-summaries?since=${encodeURIComponent(iso)}`
    )
  })

  it('sorts newest first and filters by title, ignoring case', () => {
    const summaries = SOURCES.map((s) => summarizeCampaign(s))
    const sorted = sortNewestFirst([
      ...summaries,
      { ...summaries[0], key: 'none', title: 'Empty', lastShotMs: null },
    ])
    expect(sorted.map((c) => c.key)).toEqual(['new', 'old', 'none'])
    expect(filterCampaigns(sorted, 'pilot').map((c) => c.key)).toEqual(['old'])
    expect(filterCampaigns(sorted, '  ').length).toBe(3)
  })
})

describe('HZDRSourceHome', () => {
  it('lists campaigns newest first with chips and a filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(SOURCES) })
      )
    )
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRSourceHome />
        </MemoryRouter>
      </MantineProvider>
    )
    expect(screen.getByRole('heading', { name: 'Campaigns' })).toBeTruthy()
    await screen.findAllByTestId('home-campaign-row')
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /^\/metadata\/hzdr\/source-summaries\?since=/
    )
    const rows = screen.getAllByTestId('home-campaign-row')
    expect(rows).toHaveLength(2)
    expect(
      within(rows[0]).getByRole('link', { name: 'Target_Alignment_11.2026' })
    ).toHaveAttribute('href', '/source/new')
    expect(within(rows[0]).getByText('+2 today')).toBeInTheDocument()
    expect(
      within(rows[0]).getByRole('link', { name: '3 waiting in Review matches' })
    ).toHaveAttribute('href', '/review-matches?source=new')
    expect(within(rows[1]).queryByText(/today/)).toBeNull()
    expect(within(rows[1]).queryByText(/waiting/)).toBeNull()
    expect(within(rows[1]).getByText('1 shot needs review')).toBeInTheDocument()
    expect(
      within(rows[1]).getByText('1 shot needs revision')
    ).toBeInTheDocument()
    expect(
      within(rows[1]).getByText('2 shot times unreadable')
    ).toBeInTheDocument()
    expect(within(rows[0]).queryByText(/unreadable/)).toBeNull()
    // The old emulator cards that repeated the header are gone.
    expect(screen.queryByText('Watch the flow')).toBeNull()

    fireEvent.change(screen.getByLabelText('Filter campaigns'), {
      target: { value: 'PILOT' },
    })
    expect(screen.getAllByTestId('home-campaign-row')).toHaveLength(1)
    expect(
      within(screen.getByTestId('home-campaign-row')).getByRole('link', {
        name: 'Pilot_Old_01.2026',
      })
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter campaigns'), {
      target: { value: 'nothing here' },
    })
    expect(screen.queryAllByTestId('home-campaign-row')).toHaveLength(0)
    expect(screen.getByText(/No campaign matches/)).toBeInTheDocument()
  })

  it('helps people get oriented: figures, the last campaign and a guide', async () => {
    window.localStorage.setItem('hzdr.home.lastCampaign', 'old')
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(SOURCES) })
      )
    )
    render(
      <MantineProvider>
        <MemoryRouter>
          <HZDRSourceHome />
        </MemoryRouter>
      </MantineProvider>
    )
    await screen.findAllByTestId('home-campaign-row')
    expect(
      screen.getByRole('heading', { name: 'DAMNIT-web at HZDR' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Continue with Pilot_Old_01.2026' })
    ).toHaveAttribute('href', '/source/old')
    expect(screen.getByText('Waiting for a decision')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open Review matches' })
    ).toHaveAttribute('href', '/review-matches?source=new')
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Your own columns' })
    ).toHaveAttribute('href', '/docs#own-columns')
    window.localStorage.clear()
  })
})

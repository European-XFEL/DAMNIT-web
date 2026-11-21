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

import type { HomeSource } from '../../components/homeCampaignSummary'
import {
  filterCampaigns,
  sortNewestFirst,
  summarizeCampaign,
} from '../../components/homeCampaignSummary'
import { HZDRSourceHome } from '../SourceHome'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function shot(
  fired_at: string,
  extra: Record<string, unknown> = {},
  status?: string
) {
  return {
    source_key: 'x',
    shot_number: 1,
    fired_at,
    metadata: status ? { status } : {},
    events: [],
    data_products: [],
    ...extra,
  }
}

function event(match_status: string, acknowledged = false) {
  return {
    event_id: `${match_status}-${acknowledged}`,
    experiment_id: 'x',
    source: 'watchdog',
    kind: 'file',
    timestamp: '2026-07-01T09:00:00Z',
    payload_ref: {},
    metadata: {},
    match_status,
    candidate_shot_keys: [],
    acknowledged,
  }
}

const today = new Date()
const todayIso = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  0,
  5
).toISOString()

const SOURCES = [
  {
    key: 'old',
    title: 'HZDR canonical campaign (Pilot_Old_01.2026)',
    damnit_path: '/data/old',
    metadata: {},
    shots: [
      shot('2026-01-10T09:00:00Z', {}, 'needs-review'),
      shot('2026-01-11T09:00:00Z', {}, 'revision-needed'),
    ],
    review_events: [],
  },
  {
    key: 'new',
    title: 'HZDR canonical campaign (Target_Alignment_11.2026)',
    damnit_path: '/data/new',
    metadata: {},
    shots: [
      shot('2026-06-01T09:00:00Z'),
      shot(todayIso),
      shot(todayIso, { experiment_id_source: 'unassigned' }),
    ],
    review_events: [
      event('ambiguous'),
      event('unmatched'),
      event('unmatched', true),
    ],
  },
] as unknown as HomeSource[]

describe('home campaign summary', () => {
  it('counts today, waiting decisions and shots to review', () => {
    const summary = summarizeCampaign(SOURCES[1], today)
    expect(summary.title).toBe('Target_Alignment_11.2026')
    expect(summary.shotCount).toBe(3)
    expect(summary.firedToday).toBe(2)
    // ambiguous + unacknowledged unmatched + unassigned shot
    expect(summary.waiting).toBe(3)
    const old = summarizeCampaign(SOURCES[0], today)
    expect(old.needsReview).toBe(1)
    expect(old.needsRevision).toBe(1)
    expect(old.firedToday).toBe(0)
    expect(old.lastShotAt).toBe('2026-01-11T09:00:00Z')
  })

  it('sorts newest first and filters by title, ignoring case', () => {
    const summaries = SOURCES.map((s) => summarizeCampaign(s, today))
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

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import {
  AmbiguousMatchesCard,
  ResolvedCard,
  UnassignedShotsCard,
  UnmatchedEventsCard,
} from '../ReviewMatches'
import { LegacyReviewMatchesRedirect } from '../../pages/LegacyReviewMatchesRedirect'
import type { HZDRReviewEvent, HZDRShot } from '../../types'

beforeAll(() => {
  // Mantine's Autocomplete dropdown measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(cleanup)

function withMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

function makeEvent(overrides: Partial<HZDRReviewEvent> = {}): HZDRReviewEvent {
  return {
    event_id: 'evt-ambiguous-1',
    experiment_id: 'exp',
    source: 'DRACO-Trigger',
    kind: 'draco.trigger',
    timestamp: '2026-05-05T08:17:00Z',
    payload_ref: {},
    metadata: {},
    match_status: 'ambiguous',
    candidate_shot_keys: ['exp:20260505:000001', 'exp:20260505:000002'],
    acknowledged: false,
    ...overrides,
  }
}

function makeShot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'src',
    shot_number: 1,
    fired_at: '2026-05-05T08:15:00Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

describe('AmbiguousMatchesCard', () => {
  it('lists the candidates and confirms the chosen one with the note', () => {
    const onConfirm = vi.fn()
    const shots = new Map([
      [
        'exp:20260505:000001',
        makeShot({
          shot_number: 1,
          shot_key: 'exp:20260505:000001',
          labfrog_local_count: 17,
          metadata: { target: { name: 'Ti foil' } },
        }),
      ],
      [
        'exp:20260505:000002',
        makeShot({
          shot_number: 2,
          shot_key: 'exp:20260505:000002',
          fired_at: '2026-05-05T08:20:00Z',
        }),
      ],
    ])
    withMantine(
      <AmbiguousMatchesCard
        events={[makeEvent({ shot_number: 701 })]}
        shotsByKey={shots}
        busyKey={null}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Ti foil')).toBeInTheDocument()
    expect(screen.getByText('Trigger shot 701')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('+2 min')).toBeInTheDocument()
    expect(screen.getByText('-3 min')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'logbook' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm shot 2' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'evt-ambiguous-1' }),
      'exp:20260505:000002',
      'logbook'
    )
  })

  it('will not confirm a candidate missing from the catalog', () => {
    withMantine(
      <AmbiguousMatchesCard
        events={[makeEvent({ candidate_shot_keys: ['gone'] })]}
        shotsByKey={new Map()}
        busyKey={null}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('shot not in catalog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm shot/ })).toBeDisabled()
  })

  it('says so when nothing is ambiguous', () => {
    withMantine(
      <AmbiguousMatchesCard
        events={[]}
        shotsByKey={new Map()}
        busyKey={null}
        onConfirm={vi.fn()}
      />
    )
    expect(
      screen.getByText('Nothing ambiguous in this campaign.')
    ).toBeInTheDocument()
  })
})

describe('UnmatchedEventsCard', () => {
  it('acknowledges an event, and disables buttons while saving', () => {
    const onDismiss = vi.fn()
    const event = makeEvent({
      event_id: 'evt-unmatched-1',
      match_status: 'unmatched',
      candidate_shot_keys: [],
    })
    const { rerender } = withMantine(
      <UnmatchedEventsCard
        events={[event]}
        busyKey={null}
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Acknowledge, no shot' })
    )
    expect(onDismiss).toHaveBeenCalledWith(event)

    rerender(
      <MantineProvider>
        <UnmatchedEventsCard
          events={[event]}
          busyKey="dismiss:evt-unmatched-1"
          onDismiss={onDismiss}
        />
      </MantineProvider>
    )
    expect(
      screen.getByRole('button', { name: 'Acknowledge, no shot' })
    ).toBeDisabled()
  })
})

describe('UnassignedShotsCard', () => {
  it('assigns a shot to a campaign and shows a recorded ruling', () => {
    const onAssign = vi.fn()
    const waiting = makeShot({ shot_number: 9, shot_key: 'unassigned:9' })
    const ruled = makeShot({ shot_number: 10, shot_key: 'unassigned:10' })
    withMantine(
      <UnassignedShotsCard
        shots={[waiting, ruled]}
        rulings={
          new Map([
            [
              10,
              {
                shot_number: 10,
                experiment_id: 'Pilot_2026',
                by: 'kim',
                at: '2026-10-03T08:00:00Z',
              },
            ],
          ])
        }
        suggestions={['Beamline_radbio_2026']}
        busyKey={null}
        onAssign={onAssign}
      />
    )

    expect(screen.getByText('Pilot_2026')).toBeInTheDocument()
    expect(screen.getByText(/by kim/)).toBeInTheDocument()
    const assign = screen.getByRole('button', { name: 'Assign' })
    expect(assign).toBeDisabled()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Campaign for shot 9' }),
      {
        target: { value: 'Beamline_radbio_2026' },
      }
    )
    fireEvent.click(assign)
    expect(onAssign).toHaveBeenCalledWith(waiting, 'Beamline_radbio_2026')
  })
})

describe('ResolvedCard', () => {
  it('shows who decided and when', () => {
    withMantine(
      <ResolvedCard
        confirmations={[
          {
            shot_number: 4,
            shot_key: 'k4',
            event_id: 'e1',
            by: 'kim',
            at: '2026-10-01T08:00:00Z',
            note: 'logbook',
          },
        ]}
        acknowledged={[
          makeEvent({
            event_id: 'e2',
            match_status: 'unmatched',
            acknowledged: true,
            acknowledged_by: 'lee',
            acknowledged_at: '2026-10-02T08:00:00Z',
          }),
        ]}
      />
    )
    expect(screen.getByText('Event e1 → shot 4')).toBeInTheDocument()
    expect(screen.getByText('kim')).toBeInTheDocument()
    expect(
      screen.getByText('Event e2 acknowledged, no shot')
    ).toBeInTheDocument()
    expect(screen.getByText('lee')).toBeInTheDocument()
  })
})

describe('LegacyReviewMatchesRedirect', () => {
  it('sends the old path to /review-matches, keeping the query', () => {
    function Where() {
      const location = useLocation()
      return <p>{`${location.pathname}${location.search}`}</p>
    }
    render(
      <MemoryRouter initialEntries={['/link-shot-records?source=hzdr-local']}>
        <Routes>
          <Route
            path="/link-shot-records"
            element={<LegacyReviewMatchesRedirect />}
          />
          <Route path="/review-matches" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(
      screen.getByText('/review-matches?source=hzdr-local')
    ).toBeInTheDocument()
  })
})

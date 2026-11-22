import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import {
  AmbiguousMatchesCard,
  ResolvedCard,
  ReviewAllClear,
  ReviewSummary,
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
    // Shot 1 is 2 min from the event, shot 2 is 3 min: shot 1 is highlighted.
    expect(
      screen.getByText(
        'Closest in time is highlighted; time alone never decides.'
      )
    ).toBeInTheDocument()
    const closest = screen.getByText('closest in time').closest('tr')
    expect(closest).toHaveAttribute('data-closest')
    expect(closest).toHaveTextContent('Confirm shot 1')
    expect(
      screen.getByRole('button', { name: 'Confirm shot 2' }).closest('tr')
    ).not.toHaveAttribute('data-closest')
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

  it('highlights nothing when the gap is unknown, and confirms nothing itself', () => {
    const onConfirm = vi.fn()
    const naive = (n: number) =>
      makeShot({
        shot_number: n,
        shot_key: `exp:20260505:00000${n}`,
        fired_at: '',
        labfrog_date_time: `2026-05-05T08:1${n}:00`,
      })
    withMantine(
      <AmbiguousMatchesCard
        events={[makeEvent()]}
        shotsByKey={
          new Map([
            ['exp:20260505:000001', naive(1)],
            ['exp:20260505:000002', naive(2)],
          ])
        }
        busyKey={null}
        onConfirm={onConfirm}
      />
    )
    expect(screen.queryByText('closest in time')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
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

describe('AmbiguousMatchesCard clear time choices', () => {
  it('lists the clear cases, then confirms them on a second click', () => {
    const onConfirmMany = vi.fn()
    const shots = new Map(
      [1, 2].map((n) => [
        `exp:20260505:00000${n}`,
        makeShot({ shot_number: n, shot_key: `exp:20260505:00000${n}` }),
      ])
    )
    const clear = makeEvent({ event_id: 'evt-clear' })
    const unclear = makeEvent({ event_id: 'evt-unclear' })
    withMantine(
      <AmbiguousMatchesCard
        events={[clear, unclear]}
        shotsByKey={shots}
        gaps={{
          'evt-clear': {
            'exp:20260505:000001': -8,
            'exp:20260505:000002': 400,
          },
          'evt-unclear': {
            'exp:20260505:000001': 20,
            'exp:20260505:000002': 60,
          },
        }}
        runnerUp={{ 'evt-clear': 400, 'evt-unclear': 60 }}
        busyKey={null}
        onConfirm={vi.fn()}
        onConfirmMany={onConfirmMany}
      />
    )
    expect(screen.getByText(/one shot clearly closest in time/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Confirm these/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review the 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm these 1' }))
    expect(onConfirmMany).toHaveBeenCalledWith([
      expect.objectContaining({
        event: clear,
        shotKey: 'exp:20260505:000001',
        gapS: -8,
        note: expect.stringContaining('closest in time'),
      }),
    ])
  })

  it('offers nothing in bulk when no case is clear', () => {
    withMantine(
      <AmbiguousMatchesCard
        events={[makeEvent()]}
        shotsByKey={new Map()}
        busyKey={null}
        onConfirm={vi.fn()}
        onConfirmMany={vi.fn()}
      />
    )
    expect(screen.queryByText(/clearly closest in time/)).toBeNull()
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
        onDismissMany={vi.fn()}
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
          onDismissMany={vi.fn()}
        />
      </MantineProvider>
    )
    expect(
      screen.getByRole('button', { name: 'Acknowledge, no shot' })
    ).toBeDisabled()
  })
})

describe('UnmatchedEventsCard batch', () => {
  it('acknowledges a producer and kind in one go after a second click', () => {
    const onDismissMany = vi.fn()
    const tests = [1, 2, 3].map((n) =>
      makeEvent({
        event_id: `evt-test-${n}`,
        source: 'TestFire',
        kind: 'draco.trigger',
        match_status: 'unmatched',
        candidate_shot_keys: [],
      })
    )
    const single = makeEvent({
      event_id: 'evt-other',
      source: 'Watchdog',
      kind: 'daq.file',
      match_status: 'unmatched',
      candidate_shot_keys: [],
    })
    withMantine(
      <UnmatchedEventsCard
        events={[...tests, single]}
        busyKey={null}
        onDismiss={vi.fn()}
        onDismissMany={onDismissMany}
      />
    )
    // Only groups of two or more get a batch button.
    expect(
      screen.getAllByRole('button', { name: /^Acknowledge all/ })
    ).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge all 3' }))
    expect(onDismissMany).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Yes, acknowledge 3 with no shot',
      })
    )
    expect(onDismissMany).toHaveBeenCalledWith(tests)
  })
})

describe('UnassignedShotsCard batch', () => {
  it('assigns one day of waiting shots to one campaign', () => {
    const onAssignMany = vi.fn()
    const dayOne = [1, 2].map((n) =>
      makeShot({
        shot_number: n,
        shot_key: `u:${n}`,
        shot_date: '2026-11-20',
      })
    )
    const dayTwo = makeShot({
      shot_number: 3,
      shot_key: 'u:3',
      shot_date: '2026-11-21',
    })
    withMantine(
      <UnassignedShotsCard
        shots={[...dayOne, dayTwo]}
        rulings={new Map()}
        suggestions={['Pilot_2026']}
        busyKey={null}
        onAssign={vi.fn()}
        onAssignMany={onAssignMany}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Assign 3 shots' })
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('textbox', { name: 'Assign several' }))
    fireEvent.click(screen.getByRole('option', { name: '2026-11-20 (2)' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'to campaign' }), {
      target: { value: 'Pilot_2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Assign 2 shots' }))
    expect(onAssignMany).toHaveBeenCalledWith(dayOne, 'Pilot_2026')
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
        onAssignMany={vi.fn()}
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
    // Folded by default, with its count.
    expect(screen.queryByText('Event e1 → shot 4')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Resolved/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Event e1 → shot 4')).toBeInTheDocument()
    expect(screen.getByText('kim')).toBeInTheDocument()
    expect(
      screen.getByText('Event e2 acknowledged, no shot')
    ).toBeInTheDocument()
    expect(screen.getByText('lee')).toBeInTheDocument()
  })
})

describe('ReviewSummary', () => {
  it('makes chips with something behind them jump; zero chips are inert', () => {
    const onJump = vi.fn()
    withMantine(
      <ReviewSummary
        summary={{
          matched: 16,
          ambiguous: 2,
          unmatched: 0,
          confirmed: 1,
          dismissed: 0,
        }}
        ambiguous={2}
        unmatched={0}
        unassigned={3}
        onJump={onJump}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '2 ambiguous' }))
    expect(onJump).toHaveBeenLastCalledWith('ambiguous')
    fireEvent.click(screen.getByRole('button', { name: '3 unassigned shots' }))
    expect(onJump).toHaveBeenLastCalledWith('unassigned')
    fireEvent.click(
      screen.getByRole('button', { name: '1 confirmed by a reviewer' })
    )
    expect(onJump).toHaveBeenLastCalledWith('resolved')
    expect(
      screen.queryByRole('button', { name: '0 unmatched' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('0 unmatched')).toBeInTheDocument()
    // Matched has no section to jump to.
    expect(
      screen.queryByRole('button', { name: '16 matched' })
    ).not.toBeInTheDocument()
  })
})

describe('ReviewAllClear', () => {
  it('says the campaign is clear and how many events matched', () => {
    withMantine(<ReviewAllClear campaign="Pilot_2026" matched={16} />)
    expect(
      screen.getByText(
        'Pilot_2026: all clear. 16 events matched; nothing is waiting for a decision.'
      )
    ).toBeInTheDocument()
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

describe('suggestions from evidence other than time', () => {
  it('marks the suggested candidate and confirms suggestions in bulk', () => {
    const onConfirmMany = vi.fn()
    const shots = new Map(
      [1, 2].map((n) => [
        `exp:20260505:00000${n}`,
        makeShot({ shot_number: n, shot_key: `exp:20260505:00000${n}` }),
      ])
    )
    const suggested = makeEvent({
      event_id: 'evt-suggested',
      suggested_shot_key: 'exp:20260505:000002',
      suggestion_reason: 'watchdog_attribution',
    })
    withMantine(
      <AmbiguousMatchesCard
        events={[suggested]}
        shotsByKey={shots}
        gaps={{
          // Clear by time too, but it is offered once, as a suggestion.
          'evt-suggested': {
            'exp:20260505:000001': 5,
            'exp:20260505:000002': 600,
          },
        }}
        busyKey={null}
        onConfirm={vi.fn()}
        onConfirmMany={onConfirmMany}
      />
    )
    expect(
      screen.getByText(/suggested: the watchdog named this shot/)
    ).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Review the/ })).toHaveLength(
      1
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review the 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm these 1' }))
    expect(onConfirmMany).toHaveBeenCalledWith([
      expect.objectContaining({
        shotKey: 'exp:20260505:000002',
        note: 'Confirmed in bulk: suggested because the watchdog named this shot.',
      }),
    ])
  })
})

describe('review reasons', () => {
  it('says why an event waits, in words', () => {
    withMantine(
      <UnmatchedEventsCard
        events={[
          makeEvent({
            match_status: 'unmatched',
            candidate_shot_keys: [],
            review_reason: 'no_shot_in_tolerance',
          }),
        ]}
        busyKey={null}
        onDismiss={vi.fn()}
        onDismissMany={vi.fn()}
      />
    )
    expect(screen.getByTestId('review-reason').textContent).toContain(
      'No LabFrog shot within the time tolerance'
    )
  })
})

describe('campaign suggestions for unassigned shots', () => {
  it('pre-fills the suggestion and assigns the suggested ones on a second click', () => {
    const onAssignSuggested = vi.fn()
    const suggestedShot = makeShot({ shot_number: 1, shot_key: 'u:1' })
    const plainShot = makeShot({ shot_number: 2, shot_key: 'u:2' })
    withMantine(
      <UnassignedShotsCard
        shots={[suggestedShot, plainShot]}
        rulings={new Map()}
        suggestions={['Pilot_2026']}
        campaignSuggestions={{
          'u:1': {
            experiment_id: 'Pilot_2026',
            before_shot_key: 'p:1',
            after_shot_key: 'p:2',
          },
        }}
        busyKey={null}
        onAssign={vi.fn()}
        onAssignMany={vi.fn()}
        onAssignSuggested={onAssignSuggested}
      />
    )
    expect(
      screen.getByRole('textbox', { name: 'Campaign for shot 1' })
    ).toHaveValue('Pilot_2026')
    expect(
      screen.getByRole('textbox', { name: 'Campaign for shot 2' })
    ).toHaveValue('')
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign the 1 suggested' })
    )
    expect(onAssignSuggested).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Yes, assign 1 as suggested' })
    )
    expect(onAssignSuggested).toHaveBeenCalledWith([
      [suggestedShot, 'Pilot_2026'],
    ])
  })
})

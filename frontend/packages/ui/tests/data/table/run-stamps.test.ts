import { afterEach, expect, test, vi } from 'vitest'

import { liveRunStamps, stampLiveRuns } from '#src/data/table/run-stamps'

const PROPOSAL = '900405'

afterEach(() => {
  liveRunStamps(new Map())
  vi.restoreAllMocks()
})

test('a run stamped by a recent push still flashes on the next one', () => {
  stampLiveRuns([{ proposal: PROPOSAL, run: 1 }])
  stampLiveRuns([{ proposal: PROPOSAL, run: 2 }])

  expect([...liveRunStamps().keys()].sort()).toEqual([
    `${PROPOSAL}:1`,
    `${PROPOSAL}:2`,
  ])
})

test('a stamp too old to still be fading is dropped on the next push', () => {
  stampLiveRuns([{ proposal: PROPOSAL, run: 1 }])

  const wellPastTheFade = performance.now() + 5000
  vi.spyOn(performance, 'now').mockReturnValue(wellPastTheFade)
  stampLiveRuns([{ proposal: PROPOSAL, run: 2 }])

  // Otherwise every run ever pushed is carried, and copied, forever.
  expect([...liveRunStamps().keys()]).toEqual([`${PROPOSAL}:2`])
})

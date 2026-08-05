import { afterEach, expect, test, vi } from 'vitest'

import {
  forgetRunsTruncation,
  warnIfRunsTruncated,
} from '#src/data/table/runs-truncation'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'

const PROPOSAL = '900405'
const OTHER_PROPOSAL = '900406'

afterEach(() => {
  vi.restoreAllMocks()
  forgetRunsTruncation(PROPOSAL)
  forgetRunsTruncation(OTHER_PROPOSAL)
})

test('warns once per proposal when a full page comes back', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  // The unpaginated table and the summary plots both read the same capped list.
  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)
  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)

  expect(warn).toHaveBeenCalledTimes(1)
})

test('warns again for a proposal it has not reported yet', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)
  warnIfRunsTruncated(OTHER_PROPOSAL, ALL_RUNS_PAGE_SIZE)

  expect(warn).toHaveBeenCalledTimes(2)
})

test('stays quiet for a proposal that fits inside the cap', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE - 1)

  expect(warn).not.toHaveBeenCalled()
})

test('hedges the message, because a count cannot tell full from truncated', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)

  expect(warn).toHaveBeenCalledWith(expect.stringContaining('may be missing'))
})

test('names the cap, not a count that can come in above it', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  // Both callers read a cache field shared with the paginated table, so the
  // count they pass can exceed what one request returned.
  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE + 4)

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(`Loaded ${ALL_RUNS_PAGE_SIZE} runs`)
  )
})

test('warns again once the proposal has been left', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  // Leaving evicts the proposal's runs, so the next visit loads them afresh and
  // has to hear about the cap again.
  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)
  forgetRunsTruncation(PROPOSAL)
  warnIfRunsTruncated(PROPOSAL, ALL_RUNS_PAGE_SIZE)

  expect(warn).toHaveBeenCalledTimes(2)
})

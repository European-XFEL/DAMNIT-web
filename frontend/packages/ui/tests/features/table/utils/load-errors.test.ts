import { expect, test } from 'vitest'

import { describeLoadErrors } from '#src/features/table/utils/load-errors'
import type { LoadErrors } from '#src/features/table/types/table.types'

// Runs numbered from 1 with no gaps, one per row.
const runsUpTo = (count: number) =>
  Array.from({ length: count }, (_, row) => ({
    proposal: '6996',
    run: row + 1,
  }))

const page = (number: number) => ({
  first: (number - 1) * 10,
  last: number * 10 - 1,
})

const failed = (errors: Partial<LoadErrors>): LoadErrors => ({
  rows: [],
  values: [],
  waitsForRetry: true,
  ...errors,
})

test('says nothing when no page failed', () => {
  expect(describeLoadErrors(failed({}), runsUpTo(2649))).toBeNull()
})

test('names the first and last run of a failed page', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(5)] }), runsUpTo(2649))
  ).toEqual({ name: "Some runs didn't load", runs: 'Runs 41 to 50.' })
})

test('reads failed pages side by side as one stretch', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(5), page(6)] }), runsUpTo(2649))
      ?.runs
  ).toBe('Runs 41 to 60.')
})

test('lists failed pages apart from each other with commas and an and', () => {
  expect(
    describeLoadErrors(
      failed({ rows: [page(1), page(5), page(10)] }),
      runsUpTo(2649)
    )?.runs
  ).toBe('Runs 1 to 10, 41 to 50 and 91 to 100.')
})

test('names the one run on a last page that holds only one', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(265)] }), runsUpTo(2641))?.runs
  ).toBe('Run 2641.')
})

test('ends a partly full last page on the last run', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(265)] }), runsUpTo(2649))?.runs
  ).toBe('Runs 2641 to 2649.')
})

test('lists a lone run beside a stretch as a bare number', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(5), page(265)] }), runsUpTo(2641))
      ?.runs
  ).toBe('Runs 41 to 50 and 2641.')
})

test('names only the first and last run of a page whose run numbers skip', () => {
  const runs = runsUpTo(100).map((identity, row) =>
    row >= 45 ? { ...identity, run: identity.run + 2 } : identity
  )

  expect(describeLoadErrors(failed({ rows: [page(5)] }), runs)?.runs).toBe(
    'Runs 41 to 52.'
  )
})

test("names every run of the demo's one page", () => {
  const allRuns = { first: 0, last: 9999 }

  expect(
    describeLoadErrors(failed({ rows: [allRuns] }), runsUpTo(428))?.runs
  ).toBe('Runs 1 to 428.')
})

test('says nothing about a failed page past the last run', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(266)] }), runsUpTo(2649))
  ).toBeNull()
})

test('names the values when only heavy values failed', () => {
  expect(
    describeLoadErrors(failed({ values: [page(7)] }), runsUpTo(2649))
  ).toEqual({ name: "Some values didn't load", runs: 'Runs 61 to 70.' })
})

test('names only the rows when rows and heavy values both failed', () => {
  expect(
    describeLoadErrors(
      failed({ rows: [page(5)], values: [page(7)] }),
      runsUpTo(2649)
    )
  ).toEqual({ name: "Some runs didn't load", runs: 'Runs 41 to 50.' })
})

// The active proposal's runs first, then a guest's, as the API orders them.
const withGuest = (active: number, guest: number) => [
  ...runsUpTo(active),
  ...Array.from({ length: guest }, (_, row) => ({
    proposal: '7001',
    run: row + 1,
  })),
]

test('names the proposal of each stretch when a guest shares the table', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(1)] }), withGuest(8, 4))?.runs
  ).toBe('Proposal 6996 runs 1 to 8; proposal 7001 runs 1 to 2.')
})

test('names a lone guest run apart from the same number in the active proposal', () => {
  expect(
    describeLoadErrors(failed({ rows: [page(1)] }), withGuest(2, 1))?.runs
  ).toBe('Proposal 6996 runs 1 to 2; proposal 7001 run 1.')
})

test("lists a guest's failed pages under its proposal alone", () => {
  expect(
    describeLoadErrors(failed({ rows: [page(3), page(5)] }), withGuest(20, 50))
      ?.runs
  ).toBe('Proposal 7001 runs 1 to 10 and 21 to 30.')
})

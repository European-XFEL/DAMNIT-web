import { InMemoryCache } from '@apollo/client'
import { beforeEach, expect, test } from 'vitest'

import {
  TABLE_DATA_QUERY,
  type TableDataResult,
} from '#src/data/table/table-data.queries'
import { typePolicies } from '#src/graphql/type-policies'
import { serverCell } from '#tests/support/cells'

const PROPOSAL = '900405'

let cache: InMemoryCache

beforeEach(() => {
  cache = new InMemoryCache({ typePolicies })
})

type CellError = { cls: string; message: string }

// A cell before `run` stamps it with the identity it is keyed by.
type CellInput = {
  name: string
  value: unknown
  dtype: string
  error: CellError | null
}

function cell({
  name,
  value,
  dtype = 'number',
  error = null,
}: CellOptions): CellInput {
  return { name, value, dtype, error }
}

type CellOptions = {
  name: string
  value: unknown
  dtype?: string
  error?: CellError | null
}

function run(proposal: string, number: number, cells: CellInput[]) {
  return {
    __typename: 'DamnitRun',
    database: PROPOSAL,
    proposal,
    run: number,
    cells: cells.map((entry) =>
      serverCell({ database: PROPOSAL, proposal, run: number, ...entry })
    ),
  }
}

function writeRuns(runs: ReturnType<typeof run>[]) {
  cache.writeQuery({
    query: TABLE_DATA_QUERY,
    variables: { proposal: PROPOSAL, page: 1, per_page: 10 },
    data: { runs },
  })
}

function readRuns() {
  return cache.readQuery<TableDataResult>({
    query: TABLE_DATA_QUERY,
    variables: { proposal: PROPOSAL, page: 1, per_page: 10 },
  })!.runs
}

const summaryOf = (
  runs: TableDataResult['runs'],
  identity: number,
  name: string
) =>
  runs
    .find((entry) => entry.run === identity)
    ?.cells.find((entry) => entry.name === name)?.summary

const valueOf = (
  runs: TableDataResult['runs'],
  identity: number,
  name: string
) => summaryOf(runs, identity, name)?.value

const dtypeOf = (
  runs: TableDataResult['runs'],
  identity: number,
  name: string
) => summaryOf(runs, identity, name)?.dtype

const blanked = cell({ name: 'spectrum', value: null, dtype: 'array1d' })
const filled = cell({ name: 'spectrum', value: [1, 2, 3], dtype: 'array1d' })

test('the lightweight, deferred, and pushed cell sets share one run', () => {
  // The lightweight pass lands the run with its heavy value blanked.
  writeRuns([run(PROPOSAL, 1, [cell({ name: 'energy', value: 10 }), blanked])])
  expect(valueOf(readRuns(), 1, 'spectrum')).toBeNull()

  // The deferred pass fills only the heavy value, keyed onto the same run. The
  // cells list unions by identity, so `energy` survives even though this pass
  // did not carry it.
  writeRuns([run(PROPOSAL, 1, [cell({ name: 'run', value: 1 }), filled])])
  expect(valueOf(readRuns(), 1, 'spectrum')).toEqual([1, 2, 3])
  expect(valueOf(readRuns(), 1, 'energy')).toBe(10)
})

test('a held-back blank does not overwrite a value already in place', () => {
  writeRuns([run(PROPOSAL, 1, [filled])])

  // A cache-and-network refetch of the lightweight pass blanks the heavy value
  // again; the CellSummary.value merge keeps the value the deferred pass filled.
  writeRuns([run(PROPOSAL, 1, [blanked])])

  expect(valueOf(readRuns(), 1, 'spectrum')).toEqual([1, 2, 3])
})

test('a retyped variable clears the value that no longer describes it', () => {
  writeRuns([run(PROPOSAL, 1, [filled])])

  // A context-file edit retypes `spectrum` from an array to an image, so the
  // next lightweight pass blanks it under the new dtype. Keeping the array here
  // would pair it with a dtype that cannot draw it, and the cell would never be
  // fetched again because it would still look like it had a value.
  writeRuns([
    run(PROPOSAL, 1, [cell({ name: 'spectrum', value: null, dtype: 'image' })]),
  ])

  expect(valueOf(readRuns(), 1, 'spectrum')).toBeNull()
  expect(dtypeOf(readRuns(), 1, 'spectrum')).toBe('image')
})

test('a null scalar clears the value it had rather than keeping it', () => {
  writeRuns([run(PROPOSAL, 1, [cell({ name: 'energy', value: 10 })])])
  expect(valueOf(readRuns(), 1, 'energy')).toBe(10)

  // Unlike a held-back heavy blank, a null scalar is DAMNIT clearing the value
  // for this run, so the merge must let it through instead of keeping the stale
  // number.
  writeRuns([run(PROPOSAL, 1, [cell({ name: 'energy', value: null })])])
  expect(valueOf(readRuns(), 1, 'energy')).toBeNull()
})

test('a blank still lands on a cell that has no value yet', () => {
  // The grid draws a null as a loading skeleton until the deferred pass fills it.
  writeRuns([run(PROPOSAL, 1, [blanked])])

  expect(valueOf(readRuns(), 1, 'spectrum')).toBeNull()
})

test('a cell that fails after computing clears the value it had', () => {
  const error = { cls: 'ValueError', message: 'boom' }
  writeRuns([run(PROPOSAL, 1, [filled])])

  // DAMNIT stores a failed variable with a null value and no summary type, so
  // it comes back as a null string, not a held-back heavy blank: the error
  // lands and the array it had goes with it.
  writeRuns([
    run(PROPOSAL, 1, [
      cell({ name: 'spectrum', value: null, dtype: 'string', error }),
    ]),
  ])

  const spectrum = readRuns()[0].cells.find(
    (entry) => entry.name === 'spectrum'
  )
  expect(spectrum?.error).toEqual(error)
  expect(spectrum?.summary.value).toBeNull()
})

test('an error alone cannot clear a value under a heavy dtype', () => {
  writeRuns([run(PROPOSAL, 1, [filled])])

  // The merge sees only the summary, so the error beside it is invisible here
  // and the blank still reads as one @lightweight held back. Nothing on the
  // client can close this: what keeps it unreachable is the API dropping the
  // summary type of a failed cell (`DamnitRun._iter_cells`), which turns the
  // case above into the null string the previous test covers. If that guarantee
  // goes, this is the value that gets pinned behind the error.
  writeRuns([
    run(PROPOSAL, 1, [
      cell({
        name: 'spectrum',
        value: null,
        dtype: 'array1d',
        error: { cls: 'ValueError', message: 'boom' },
      }),
    ]),
  ])

  expect(valueOf(readRuns(), 1, 'spectrum')).toEqual([1, 2, 3])
})

test('paginated runs accumulate into one list, deduped by identity', () => {
  writeRuns([run(PROPOSAL, 1, [cell({ name: 'energy', value: 1 })])])
  writeRuns([
    run(PROPOSAL, 1, [cell({ name: 'energy', value: 1 })]),
    run(PROPOSAL, 2, [cell({ name: 'energy', value: 2 })]),
  ])

  const runs = readRuns()
  expect(runs.map((entry) => entry.run)).toEqual([1, 2])
})

test('runs that share a number across proposals stay separate', () => {
  writeRuns([
    run('900405', 1, [cell({ name: 'energy', value: 1.2 })]),
    run('900485', 1, [cell({ name: 'energy', value: 9.9 })]),
  ])

  const runs = readRuns()
  expect(runs).toHaveLength(2)
  expect(cache.identify(runs[0])).not.toBe(cache.identify(runs[1]))
})

test('cells sharing a name across runs are separate normalized entities', () => {
  // The id folds in the run's identity, so one variable's cell in two runs
  // never collapses onto a single cache object.
  writeRuns([
    run(PROPOSAL, 1, [cell({ name: 'energy', value: 1.2 })]),
    run(PROPOSAL, 2, [cell({ name: 'energy', value: 9.9 })]),
  ])

  expect(valueOf(readRuns(), 1, 'energy')).toBe(1.2)
  expect(valueOf(readRuns(), 2, 'energy')).toBe(9.9)
})

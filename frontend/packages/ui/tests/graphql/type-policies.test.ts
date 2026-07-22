import { InMemoryCache } from '@apollo/client'
import { beforeEach, expect, test } from 'vitest'

import {
  TABLE_DATA_QUERY,
  type TableDataResult,
} from '#src/data/table/table-data.queries'
import { typePolicies } from '#src/graphql/type-policies'

const PROPOSAL = '900405'

let cache: InMemoryCache

beforeEach(() => {
  cache = new InMemoryCache({ typePolicies })
})

// A cell as it sits in the cache, under its wire __typename.
type Cell = {
  name: string
  value: unknown
  dtype: string
  error: { cls: string; message: string } | null
}

function cell(
  name: string,
  value: unknown,
  dtype = 'number',
  error: Cell['error'] = null
): Cell {
  return { __typename: 'Cell', name, value, dtype, error } as Cell
}

function run(proposal: string, number: number, cells: Cell[]) {
  return {
    __typename: 'DamnitRun',
    database: PROPOSAL,
    proposal,
    run: number,
    cells,
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

const valueOf = (
  runs: TableDataResult['runs'],
  identity: number,
  name: string
) =>
  runs
    .find((entry) => entry.run === identity)
    ?.cells.find((entry) => entry.name === name)?.value

const blanked = cell('spectrum', null, 'array')
const filled = cell('spectrum', [1, 2, 3], 'array')

test('the lightweight, deferred, and pushed cell sets share one run', () => {
  // The lightweight pass lands the run with its heavy value blanked.
  writeRuns([run(PROPOSAL, 1, [cell('energy', 10), blanked])])
  expect(valueOf(readRuns(), 1, 'spectrum')).toBeNull()

  // The deferred pass fills only the heavy value, keyed onto the same run.
  writeRuns([run(PROPOSAL, 1, [cell('run', 1), filled])])
  expect(valueOf(readRuns(), 1, 'spectrum')).toEqual([1, 2, 3])
  expect(valueOf(readRuns(), 1, 'energy')).toBe(10)
})

test('a held-back blank does not overwrite a value already in place', () => {
  writeRuns([run(PROPOSAL, 1, [filled])])

  // A cache-and-network refetch of the lightweight pass blanks the heavy value
  // again; the merge keeps the value the deferred pass filled in.
  writeRuns([run(PROPOSAL, 1, [blanked])])

  expect(valueOf(readRuns(), 1, 'spectrum')).toEqual([1, 2, 3])
})

test('a blank still lands on a cell that has no value yet', () => {
  // The grid draws a null as a loading skeleton until the deferred pass fills it.
  writeRuns([run(PROPOSAL, 1, [blanked])])

  expect(valueOf(readRuns(), 1, 'spectrum')).toBeNull()
})

test('an errored blank replaces a value already in place', () => {
  // A blank carrying an error is a real result, not a value held back.
  const error = { cls: 'ValueError', message: 'boom' }
  writeRuns([run(PROPOSAL, 1, [filled])])

  writeRuns([run(PROPOSAL, 1, [cell('spectrum', null, 'array', error)])])

  const spectrum = readRuns()[0].cells.find((c) => c.name === 'spectrum')
  expect(spectrum?.value).toBeNull()
  expect(spectrum?.error).toEqual(error)
})

test('paginated runs accumulate into one list, deduped by identity', () => {
  writeRuns([run(PROPOSAL, 1, [cell('energy', 1)])])
  writeRuns([
    run(PROPOSAL, 1, [cell('energy', 1)]),
    run(PROPOSAL, 2, [cell('energy', 2)]),
  ])

  const runs = readRuns()
  expect(runs.map((entry) => entry.run)).toEqual([1, 2])
})

test('runs that share a number across proposals stay separate', () => {
  writeRuns([
    run('900405', 1, [cell('energy', 1.2)]),
    run('900485', 1, [cell('energy', 9.9)]),
  ])

  const runs = readRuns()
  expect(runs).toHaveLength(2)
  expect(cache.identify(runs[0])).not.toBe(cache.identify(runs[1]))
})

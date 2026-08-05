import { print } from 'graphql'
import { describe, expect, test } from 'vitest'

import {
  aliasForRun,
  buildPreviewQuery,
  chunkRuns,
  PREVIEW_CHUNK_SIZE,
  runForAlias,
} from '#src/features/plots/preview-chunks'

const runsFrom = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => start + i)

describe('chunkRuns', () => {
  test('keeps runs that fall inside one boundary together', () => {
    expect(chunkRuns(runsFrom(1, 49))).toEqual([runsFrom(1, 49)])
  })

  test('splits runs at the boundary rather than at the chunk size', () => {
    // Boundaries fall on multiples of the size, so run 50 opens the second
    // chunk even though only 49 runs precede it.
    expect(chunkRuns(runsFrom(1, 51))).toEqual([runsFrom(1, 49), [50, 51]])
  })

  test('gives a run the same chunk however many runs come after it', () => {
    // What the position-based split cost: one new run at the end shifted every
    // run behind it into a new chunk, rebuilding those documents and refetching
    // every heavy payload they already held.
    const before = chunkRuns(runsFrom(1, 120))
    const after = chunkRuns(runsFrom(1, 121))

    expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
  })

  test('preserves every run, in order, across chunk boundaries', () => {
    const runs = runsFrom(1, 125)

    expect(chunkRuns(runs).flat()).toEqual(runs)
  })

  test('asks for a run once however often it was selected', () => {
    expect(chunkRuns([7, 9, 7])).toEqual([[7, 9]])
  })

  test('chunks a scattered selection by value, not by count', () => {
    expect(chunkRuns([1, 500, 1000])).toEqual([[1], [500], [1000]])
  })

  test('has no chunk to load for an empty run set', () => {
    expect(chunkRuns([])).toEqual([])
  })
})

describe('aliasForRun / runForAlias', () => {
  test('reads back the run number an alias was built from', () => {
    expect(runForAlias(aliasForRun(142))).toBe(142)
  })

  test('reports a field that is not a run alias', () => {
    expect(runForAlias('__typename')).toBeNull()
  })
})

describe('buildPreviewQuery', () => {
  test('asks for one aliased run per field, with the run inlined', () => {
    const query = print(buildPreviewQuery([7, 9]))

    expect(query).toContain('r7: extracted_data')
    expect(query).toContain('r9: extracted_data')
    expect(query).toContain('run: 7')
    expect(query).toContain('run: 9')
    // The discrete set is the point: run 8 sits between them and must not be
    // fetched just because it falls in the range.
    expect(query).not.toContain('run: 8')
  })

  test('threads the proposal and variable as query variables', () => {
    const query = print(buildPreviewQuery([7]))

    expect(query).toContain(
      'query PreviewDataQuery($proposal: String, $variable: String!)'
    )
    expect(query).toContain('database: {proposal: $proposal}')
    expect(query).toContain('variable: $variable')
  })

  test('builds a sendable document for a full chunk of runs', () => {
    const runs = runsFrom(1, PREVIEW_CHUNK_SIZE)

    // print() only succeeds on a parsed document, so this pins that a full
    // chunk stays valid GraphQL rather than tripping on the field count.
    const query = print(buildPreviewQuery(runs))

    expect(query).toContain('r1: extracted_data')
    expect(query).toContain(`r${PREVIEW_CHUNK_SIZE}: extracted_data`)
  })

  test('builds a document with no run fields for an empty run set', () => {
    const query = print(buildPreviewQuery([]))

    expect(query).not.toContain('extracted_data')
  })
})

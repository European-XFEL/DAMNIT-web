import { describe, expect, test } from 'vitest'

import {
  computeColumnVisibility,
  type ColumnVisibilityInputs,
} from '#src/features/table/hooks/use-column-visibility'
import type { RunId, Tag } from '#src/data/table/table-data.types'

const tag = (name: string, variables: string[]): Tag => ({
  id: 0,
  name,
  variables,
})

const runs = (proposal: string, numbers: number[]): RunId[] =>
  numbers.map((run) => ({ proposal, run }))

const MIXED_RUNS = [...runs('6996', [40]), ...runs('5397', [40])]

const inputs = (
  overrides: Partial<ColumnVisibilityInputs> = {}
): ColumnVisibilityInputs => ({
  variableNames: ['proposal', 'energy'],
  visibility: {},
  tags: {},
  tagSelection: {},
  runs: runs('6996', [39, 40]),
  proposal: '6996',
  ...overrides,
})

describe('computeColumnVisibility', () => {
  test('drops the nonconfigurable variables but keeps proposal', () => {
    const result = computeColumnVisibility(
      inputs({ variableNames: ['proposal', 'added_at', 'run', 'energy', 'x'] })
    )
    expect(Object.keys(result)).toEqual(['proposal', 'energy', 'x'])
  })

  test('an ordinary variable is visible unless it is turned off', () => {
    const result = computeColumnVisibility(
      inputs({ variableNames: ['a', 'b'], visibility: { a: false } })
    )
    expect(result).toEqual({ a: false, b: true })
  })

  test("the proposal column stays hidden when every run is the opened proposal's", () => {
    const result = computeColumnVisibility(inputs())
    expect(result).toEqual({ proposal: false, energy: true })
  })

  test('the proposal column shows when a run belongs to another proposal', () => {
    const result = computeColumnVisibility(inputs({ runs: MIXED_RUNS }))
    expect(result).toEqual({ proposal: true, energy: true })
  })

  test.each([
    ['006996', '6996'],
    ['p6996', '6996'],
    ['xpcs', 'xpcs'],
  ])('the address proposal %s matches runs of %s', (proposal, runProposal) => {
    const result = computeColumnVisibility(
      inputs({
        proposal,
        runs: runs(runProposal, [1, 2]),
      })
    )
    expect(result).toEqual({ proposal: false, energy: true })
  })

  test("the user's hidden proposal column stays hidden beside guest runs", () => {
    const result = computeColumnVisibility(
      inputs({
        visibility: { proposal: false },
        runs: MIXED_RUNS,
      })
    )
    expect(result).toEqual({ proposal: false, energy: true })
  })

  test('with no selected tags there is no tag filter', () => {
    const result = computeColumnVisibility(
      inputs({
        variableNames: ['a', 'b'],
        tags: { hot: tag('hot', ['a']) },
        tagSelection: { hot: false },
      })
    )
    expect(result).toEqual({ a: true, b: true })
  })

  test('only variables in a selected tag pass the tag filter', () => {
    const result = computeColumnVisibility(
      inputs({
        variableNames: ['a', 'b', 'c', 'd'],
        tags: { hot: tag('hot', ['a', 'b']), cold: tag('cold', ['c']) },
        tagSelection: { hot: true, cold: false },
      })
    )
    expect(result).toEqual({ a: true, b: true, c: false, d: false })
  })

  test('the proposal column passes the tag filter beside guest runs', () => {
    const result = computeColumnVisibility(
      inputs({
        variableNames: ['proposal', 'energy', 'x'],
        tags: { hot: tag('hot', ['energy']) },
        tagSelection: { hot: true },
        runs: MIXED_RUNS,
      })
    )
    expect(result).toEqual({ proposal: true, energy: true, x: false })
  })

  test('a hidden variable stays hidden even inside a selected tag', () => {
    const result = computeColumnVisibility(
      inputs({
        variableNames: ['a', 'b'],
        visibility: { a: false },
        tags: { hot: tag('hot', ['a', 'b']) },
        tagSelection: { hot: true },
      })
    )
    expect(result).toEqual({ a: false, b: true })
  })

  // Selecting a tag that carries no variables leaves the set empty, which reads
  // as "no filter" rather than "hide everything".
  test('a selected tag with no variables applies no filter', () => {
    const result = computeColumnVisibility(
      inputs({
        variableNames: ['a'],
        tags: { empty: tag('empty', []) },
        tagSelection: { empty: true },
      })
    )
    expect(result).toEqual({ a: true })
  })
})

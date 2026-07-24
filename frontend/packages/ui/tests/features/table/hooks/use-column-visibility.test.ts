import { describe, expect, test } from 'vitest'

import { computeColumnVisibility } from '#src/features/table/hooks/use-column-visibility'
import type { Tag } from '#src/data/table/table-data.types'

const tag = (name: string, variables: string[]): Tag => ({
  id: 0,
  name,
  variables,
})

describe('computeColumnVisibility', () => {
  test('drops the nonconfigurable variables but keeps proposal', () => {
    const result = computeColumnVisibility({
      variableNames: ['proposal', 'added_at', 'run', 'energy', 'x'],
      visibility: {},
      tags: {},
      tagSelection: {},
    })
    expect(Object.keys(result)).toEqual(['proposal', 'energy', 'x'])
  })

  test('proposal is hidden by default', () => {
    const result = computeColumnVisibility({
      variableNames: ['proposal', 'energy'],
      visibility: {},
      tags: {},
      tagSelection: {},
    })
    expect(result).toEqual({ proposal: false, energy: true })
  })

  test('proposal becomes visible once it is turned on', () => {
    const result = computeColumnVisibility({
      variableNames: ['proposal', 'energy'],
      visibility: { proposal: true },
      tags: {},
      tagSelection: {},
    })
    expect(result).toEqual({ proposal: true, energy: true })
  })

  test('a variable is visible unless it is explicitly turned off', () => {
    const result = computeColumnVisibility({
      variableNames: ['a', 'b'],
      visibility: { a: false },
      tags: {},
      tagSelection: {},
    })
    expect(result).toEqual({ a: false, b: true })
  })

  test('with no selected tags there is no tag filter', () => {
    const result = computeColumnVisibility({
      variableNames: ['a', 'b'],
      visibility: {},
      tags: { hot: tag('hot', ['a']) },
      tagSelection: { hot: false },
    })
    expect(result).toEqual({ a: true, b: true })
  })

  test('only variables in a selected tag pass the tag filter', () => {
    const result = computeColumnVisibility({
      variableNames: ['a', 'b', 'c', 'd'],
      visibility: {},
      tags: { hot: tag('hot', ['a', 'b']), cold: tag('cold', ['c']) },
      tagSelection: { hot: true, cold: false },
    })
    expect(result).toEqual({ a: true, b: true, c: false, d: false })
  })

  test('a hidden variable stays hidden even inside a selected tag', () => {
    const result = computeColumnVisibility({
      variableNames: ['a', 'b'],
      visibility: { a: false },
      tags: { hot: tag('hot', ['a', 'b']) },
      tagSelection: { hot: true },
    })
    expect(result).toEqual({ a: false, b: true })
  })

  // Selecting a tag that carries no variables leaves the set empty, which reads
  // as "no filter" rather than "hide everything".
  test('a selected tag with no variables applies no filter', () => {
    const result = computeColumnVisibility({
      variableNames: ['a'],
      visibility: {},
      tags: { empty: tag('empty', []) },
      tagSelection: { empty: true },
    })
    expect(result).toEqual({ a: true })
  })
})

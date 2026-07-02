import { describe, expect, test } from 'vitest'

import { isArrayEqual, sorted, sortedInsert, sortedSearch } from '@/utils/array'

describe('sortedSearch', () => {
  test('returns the index of a value that is present', () => {
    expect(sortedSearch([1, 2, 3, 4, 5], 3)).toBe(2)
  })

  test('returns -1 when the value is absent', () => {
    expect(sortedSearch([1, 2, 3], 9)).toBe(-1)
  })

  test('returns -1 for an empty array', () => {
    expect(sortedSearch([], 1)).toBe(-1)
  })

  test('finds values at the first and last positions', () => {
    expect(sortedSearch([10, 20, 30], 10)).toBe(0)
    expect(sortedSearch([10, 20, 30], 30)).toBe(2)
  })
})

describe('sortedInsert', () => {
  test('inserts while keeping the array sorted', () => {
    const array = [1, 3, 5]
    sortedInsert(array, 4)
    expect(array).toEqual([1, 3, 4, 5])
  })

  test('does not insert a duplicate when unique (the default)', () => {
    const array = [1, 2, 3]
    sortedInsert(array, 2)
    expect(array).toEqual([1, 2, 3])
  })

  test('allows a duplicate when unique is false', () => {
    const array = [1, 2, 3]
    sortedInsert(array, 2, false)
    expect(array).toEqual([1, 2, 2, 3])
  })

  test('inserts into an empty array', () => {
    const array: number[] = []
    sortedInsert(array, 5)
    expect(array).toEqual([5])
  })
})

describe('isArrayEqual', () => {
  test('treats two nullish arrays as equal', () => {
    expect(isArrayEqual(null, undefined)).toBe(true)
  })

  test('treats one nullish array as not equal', () => {
    expect(isArrayEqual([1], null)).toBe(false)
  })

  test('is not equal when the lengths differ', () => {
    expect(isArrayEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  test('is equal when every element matches', () => {
    expect(isArrayEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  })

  test('is not equal when a single element differs', () => {
    expect(isArrayEqual([1, 2, 3], [1, 9, 3])).toBe(false)
  })
})

describe('sorted', () => {
  test('sorts numerically rather than lexically', () => {
    expect(sorted([10, 2, 1])).toEqual([1, 2, 10])
  })

  test('returns a copy without mutating the input', () => {
    const array = [3, 1, 2]
    const result = sorted(array)
    expect(result).toEqual([1, 2, 3])
    expect(array).toEqual([3, 1, 2])
    expect(result).not.toBe(array)
  })
})

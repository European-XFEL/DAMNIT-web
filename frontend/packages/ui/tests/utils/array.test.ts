import { describe, expect, test } from 'vitest'

import { isArrayEqual, sorted } from '#src/utils/array'

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

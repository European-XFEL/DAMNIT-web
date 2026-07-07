import { describe, expect, test } from 'vitest'

import { orderBy } from '@/utils/objects'

describe('orderBy', () => {
  test('sorts by multiple keys with mixed directions', () => {
    const people = [
      { name: 'b', age: 30 },
      { name: 'a', age: 20 },
      { name: 'a', age: 40 },
    ]

    const result = [...people].sort(orderBy(['name', 'age'], ['asc', 'desc']))

    expect(result).toEqual([
      { name: 'a', age: 40 },
      { name: 'a', age: 20 },
      { name: 'b', age: 30 },
    ])
  })
})

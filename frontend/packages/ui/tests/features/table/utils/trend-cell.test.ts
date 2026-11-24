import { describe, expect, test } from 'vitest'

import { normalizedXAt } from '#src/features/table/utils/trend-cell'

describe('normalizedXAt', () => {
  // A 116 px cell leaves 100 px between the 8 px pads.
  test('measures the pointer across the content between the pads', () => {
    expect(normalizedXAt({ hoverX: 8, width: 116 })).toBe(0)
    expect(normalizedXAt({ hoverX: 58, width: 116 })).toBe(0.5)
    expect(normalizedXAt({ hoverX: 108, width: 116 })).toBe(1)
  })

  test('clamps a pointer in the padding to the ends', () => {
    expect(normalizedXAt({ hoverX: 0, width: 116 })).toBe(0)
    expect(normalizedXAt({ hoverX: 116, width: 116 })).toBe(1)
  })
})

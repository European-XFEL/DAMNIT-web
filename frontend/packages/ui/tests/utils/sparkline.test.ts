import { describe, expect, test } from 'vitest'

import { hoveredIndexAt, scaleToBox } from '#src/utils/sparkline'

describe('hoveredIndexAt', () => {
  const wide = { x: [0, 1, 2, 10, 11, 12], y: [0, 0, 0, 0, 0, 0] }
  const contentWidth = 100

  test('picks the nearer point across a wide x step', () => {
    expect(hoveredIndexAt(wide, { normalizedX: 5 / 12, contentWidth })).toBe(2)
    expect(hoveredIndexAt(wide, { normalizedX: 7 / 12, contentWidth })).toBe(3)
  })

  test('picks the end points at the ends of the cell', () => {
    expect(hoveredIndexAt(wide, { normalizedX: 0, contentWidth })).toBe(0)
    expect(hoveredIndexAt(wide, { normalizedX: 1, contentWidth })).toBe(5)
  })
})

describe('scaleToBox', () => {
  const box = { left: 8, top: 3, width: 100, height: 30 }

  test('puts the lowest y at the bottom and the highest at the top', () => {
    const scale = scaleToBox({ x: [0, 4], y: [-1, 1] }, box)

    expect([scale.x(0), scale.y(-1)]).toEqual([8, 33])
    expect([scale.x(4), scale.y(1)]).toEqual([108, 3])
  })

  test('puts a single point in the center of the box', () => {
    const scale = scaleToBox({ x: [3], y: [7] }, box)

    expect([scale.x(3), scale.y(7)]).toEqual([58, 18])
  })
})

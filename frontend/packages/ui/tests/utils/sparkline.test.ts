import { describe, expect, test } from 'vitest'

import {
  hoveredIndexAt,
  isAtOneX,
  pointerInContent,
  pointsInBox,
} from '#src/utils/sparkline'

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

  test('picks a spike less than a pixel from its neighbors', () => {
    const spike = { x: [0, 40.1, 40.45, 40.8, 100], y: [1, 1, 8, 1, 1] }

    expect(hoveredIndexAt(spike, { normalizedX: 0.4, contentWidth })).toBe(2)
  })

  test('picks a spike just after a long fall from a far point', () => {
    const fall = { x: [0, 40.1, 40.45, 40.8, 100], y: [20, 1, 8, 1, 1] }

    expect(hoveredIndexAt(fall, { normalizedX: 0.4, contentWidth })).toBe(2)
    expect(
      hoveredIndexAt(fall, { normalizedX: 34 / 84, contentWidth: 84 })
    ).toBe(2)
  })

  test('picks the far end of a stack of samples at one x', () => {
    const stack = { x: [1, 2, 2, 2, 3], y: [0, 5, 9, -4, 1] }

    expect(hoveredIndexAt(stack, { normalizedX: 0.5, contentWidth })).toBe(2)
  })

  test('picks the sample furthest from the mean when every x is the same', () => {
    const column = { x: [2, 2, 2], y: [5, 9, -4] }

    expect(hoveredIndexAt(column, { normalizedX: 0.5, contentWidth })).toBe(2)
  })

  test('breaks a tie toward the point nearer the pointer', () => {
    const flat = { x: [0, 49.7, 50.2, 100], y: [1, 1, 1, 1] }

    expect(hoveredIndexAt(flat, { normalizedX: 0.5, contentWidth })).toBe(2)
  })
})

describe('pointsInBox', () => {
  const box = { left: 8, top: 3, width: 100, height: 30 }

  test('puts the lowest y at the bottom and the highest at the top', () => {
    expect(pointsInBox({ x: [0, 4], y: [-1, 1] }, box)).toEqual([
      [8, 33],
      [108, 3],
    ])
  })

  test('puts a single point in the center of the box', () => {
    expect(pointsInBox({ x: [3], y: [7] }, box)).toEqual([[58, 18]])
  })
})

describe('isAtOneX', () => {
  test.each([
    { x: [3], dots: true },
    { x: [3, 3, 3], dots: true },
    { x: [0, 1, 2], dots: false },
  ])('a sparkline at x $x draws dots: $dots', ({ x, dots }) => {
    expect(isAtOneX(x)).toBe(dots)
  })
})

describe('pointerInContent', () => {
  // A 116 px cell leaves 100 px between its 8 px pads.
  const content = { left: 8, width: 100 }

  test('measures the pointer across the content between the pads', () => {
    expect(pointerInContent(8, content)).toEqual({
      normalizedX: 0,
      contentWidth: 100,
    })
    expect(pointerInContent(58, content)).toEqual({
      normalizedX: 0.5,
      contentWidth: 100,
    })
    expect(pointerInContent(108, content)).toEqual({
      normalizedX: 1,
      contentWidth: 100,
    })
  })

  test('clamps a pointer in the padding to the ends', () => {
    expect(pointerInContent(0, content).normalizedX).toBe(0)
    expect(pointerInContent(116, content).normalizedX).toBe(1)
  })
})

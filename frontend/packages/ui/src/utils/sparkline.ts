import {
  ascending,
  bisectCenter,
  bisectLeft,
  bisectRight,
  descending,
  extent,
  greatest,
  mean,
  range,
} from 'd3-array'
import { constant } from 'lodash-es'

export const SPARKLINE_COLOR = '#4C78A8'
export const LINE_WIDTH = 1
export const RING_RADIUS = 3
export const RING_WIDTH = 0.75

// An array1d summary: the points DAMNIT stored, sorted by x.
export type SparklineValue = { x: number[]; y: number[] }

// d3-scale's scaleLinear does the same, but adds 25 kB minified (10 kB
// gzipped) to the bundle, measured with esbuild.
const linear = (
  [min, max]: [number, number] | [undefined, undefined],
  { start, length }: { start: number; length: number }
) => {
  if (min === undefined || min === max) {
    return () => start + length / 2
  }

  return (value: number) => start + ((value - min) / (max - min)) * length
}

/**
 * Maps a sparkline's x and y extents onto the box, with y growing upwards. A
 * constant x or y sits in the middle of the box.
 */
export const scaleToBox = (
  sparkline: SparklineValue,
  box: { left: number; top: number; width: number; height: number }
) => ({
  x: linear(extent(sparkline.x), { start: box.left, length: box.width }),
  y: linear(extent(sparkline.y), {
    start: box.top + box.height,
    length: -box.height,
  }),
})

const valueAt = ({ x, y }: SparklineValue, at: number) => {
  const next = bisectRight(x, at)
  if (next === 0) {
    return y[0]
  }
  if (next === x.length) {
    return y[x.length - 1]
  }

  const previous = next - 1
  const slope = (y[next] - y[previous]) / (x[next] - x[previous])

  return y[previous] + slope * (at - x[previous])
}

export type HoveredIndexAtParams = { normalizedX: number; contentWidth: number }

/**
 * The index of the stored point to ring with the pointer `normalizedX` of the
 * way across a sparkline drawn `contentWidth` px wide. It picks the point
 * within half a pixel of the pointer that lies furthest from the baseline. The
 * baseline is the straight line between the sparkline's y a pixel left of the
 * pointer and a pixel right of it. That point is the tip of the stroke the
 * sparkline draws across the pointer's pixel. A sparkline at one x measures
 * from the window's mean y instead. A tie goes to the point nearer the
 * pointer, and an empty window to the nearest point.
 */
export const hoveredIndexAt = (
  sparkline: SparklineValue,
  { normalizedX, contentWidth }: HoveredIndexAtParams
): number => {
  const { x, y } = sparkline
  const [min = 0, max = 0] = extent(x)
  const target = min + normalizedX * (max - min)
  const halfPixel = (0.5 * (max - min)) / contentWidth
  const lo = bisectLeft(x, target - halfPixel)
  const hi = bisectRight(x, target + halfPixel)
  if (lo >= hi) {
    return bisectCenter(x, target)
  }

  const from = target - 2 * halfPixel
  const to = target + 2 * halfPixel
  const start = valueAt(sparkline, from)
  const slope = (valueAt(sparkline, to) - start) / (to - from)
  const baselineAt =
    min === max
      ? constant(mean(y.slice(lo, hi)) ?? 0)
      : (at: number) => start + slope * (at - from)
  const distance = (i: number) => Math.abs(y[i] - baselineAt(x[i]))

  return greatest(
    range(lo, hi),
    (a, b) =>
      ascending(distance(a), distance(b)) ||
      descending(Math.abs(x[a] - target), Math.abs(x[b] - target))
  ) as number
}

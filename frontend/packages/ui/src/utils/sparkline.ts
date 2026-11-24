import { bisectCenter, extent } from 'd3-array'

export type Trend = { x: readonly number[]; y: readonly number[] }

export type Box = { left: number; top: number; width: number; height: number }

export type TrendScale = {
  x: (value: number) => number
  y: (value: number) => number
}

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
 * Maps a trend's x and y extents onto the box, with y growing upwards. A
 * constant x or y sits in the middle of the box.
 */
export const scaleToBox = (trend: Trend, box: Box): TrendScale => ({
  x: linear(extent(trend.x), { start: box.left, length: box.width }),
  y: linear(extent(trend.y), {
    start: box.top + box.height,
    length: -box.height,
  }),
})

/**
 * The index of the stored point nearest to a pointer `fraction` of the way
 * across the trend's x extent, which `x` holds sorted.
 */
export const nearestIndexAt = (
  x: readonly number[],
  fraction: number
): number => {
  const [min = 0, max = 0] = extent(x)
  return bisectCenter(x, min + fraction * (max - min))
}

import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from '@glideapps/glide-data-grid'
import { range } from 'd3-array'
import { line } from 'd3-shape'
import { clamp } from 'lodash-es'

import { nearestIndexAt, scaleToBox, type Trend } from '#src/utils/sparkline'

export const TREND_CELL_KIND = 'trend-cell'
const TREND_COLOR = '#4C78A8'
const LINE_WIDTH = 1
const RING_RADIUS = 3
const RING_WIDTH = 0.75

// Glide pads every cell's content by 8px on each side (the default
// cellHorizontalPadding, which our theme doesn't change).
const CELL_PADDING_X = 8
const CELL_PADDING_Y = 3

export type TrendCellProps = Trend & { readonly kind: typeof TREND_CELL_KIND }

export type TrendCell = CustomCell<TrendCellProps>

type NormalizedXAtParams = { hoverX: number; width: number }

// Where the pointer is across the cell's content, from 0 at its left edge to 1
// at its right, when the pointer is `hoverX` px into the cell.
export const normalizedXAt = ({
  hoverX,
  width,
}: NormalizedXAtParams): number => {
  const contentWidth = width - 2 * CELL_PADDING_X
  return clamp((hoverX - CELL_PADDING_X) / contentWidth, 0, 1)
}

type MakeTrendCellRendererOptions = { ringColor: string; width: number }

export const makeTrendCellRenderer = ({
  ringColor,
  width,
}: MakeTrendCellRendererOptions): CustomRenderer<TrendCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TrendCell =>
    (cell.data as Partial<TrendCellProps>).kind === TREND_CELL_KIND,
  needsHover: true,
  needsHoverPosition: true,
  // A trend has no width of its own, so a fit would land on Glide's 150px.
  measure: () => width,
  draw: ({ ctx, rect, hoverX }, cell) => {
    const { x, y } = cell.data
    if (x.length === 0) {
      return
    }

    const scale = scaleToBox(cell.data, {
      left: rect.x + CELL_PADDING_X,
      top: rect.y + CELL_PADDING_Y,
      width: rect.width - 2 * CELL_PADDING_X,
      height: rect.height - 2 * CELL_PADDING_Y,
    })

    ctx.save()
    // A ring on a peak reaches past the cell, and Glide repaints only the cell,
    // so the part outside would stay behind when the pointer moves on.
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    if (hoverX !== undefined) {
      const fraction = normalizedXAt({ hoverX, width: rect.width })
      const index = nearestIndexAt(x, fraction)
      ctx.beginPath()
      ctx.arc(scale.x(x[index]), scale.y(y[index]), RING_RADIUS, 0, 2 * Math.PI)
      ctx.lineWidth = RING_WIDTH
      ctx.strokeStyle = ringColor
      ctx.stroke()
    }

    const path = line<number>()
      .x((index) => scale.x(x[index]))
      .y((index) => scale.y(y[index]))
      .context(ctx)
    ctx.lineWidth = LINE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = TREND_COLOR
    ctx.fillStyle = TREND_COLOR

    ctx.beginPath()
    // Canvas strokes nothing for a path of no length, round cap or not, and
    // a trend at one x is one point or many samples of it.
    if (x[0] === x[x.length - 1]) {
      for (const index of range(x.length)) {
        const [dotX, dotY] = [scale.x(x[index]), scale.y(y[index])]
        ctx.moveTo(dotX + LINE_WIDTH, dotY)
        ctx.arc(dotX, dotY, LINE_WIDTH, 0, 2 * Math.PI)
      }
      ctx.fill()
    } else {
      path(range(x.length))
      ctx.stroke()
    }

    ctx.restore()
  },
})

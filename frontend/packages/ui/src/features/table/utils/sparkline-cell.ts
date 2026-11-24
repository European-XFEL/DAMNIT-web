import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from '@glideapps/glide-data-grid'
import { line } from 'd3-shape'
import { clamp } from 'lodash-es'

import {
  nearestIndexAt,
  scaleToBox,
  type SparklineValue,
} from '#src/utils/sparkline'

export const SPARKLINE_CELL_KIND = 'sparkline-cell'
const SPARKLINE_COLOR = '#4C78A8'
const LINE_WIDTH = 1
const RING_RADIUS = 3
const RING_WIDTH = 0.75

export type SparklineCellProps = SparklineValue & {
  readonly kind: typeof SPARKLINE_CELL_KIND
}

export type SparklineCell = CustomCell<SparklineCellProps>

type NormalizedXAtParams = { hoverX: number; width: number; padding: number }

// Where the pointer is across the cell's content, from 0 at its left edge to 1
// at its right, when the pointer is `hoverX` px into the cell.
export const normalizedXAt = ({
  hoverX,
  width,
  padding,
}: NormalizedXAtParams): number => {
  const contentWidth = width - 2 * padding
  return clamp((hoverX - padding) / contentWidth, 0, 1)
}

type Point = [number, number]

type DrawRingOptions = { center: Point; color: string }

const drawRing = (
  ctx: CanvasRenderingContext2D,
  { center: [ringX, ringY], color }: DrawRingOptions
) => {
  ctx.beginPath()
  ctx.arc(ringX, ringY, RING_RADIUS, 0, 2 * Math.PI)
  ctx.lineWidth = RING_WIDTH
  ctx.strokeStyle = color
  ctx.stroke()
}

const drawDots = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  ctx.beginPath()
  for (const [dotX, dotY] of points) {
    ctx.moveTo(dotX + LINE_WIDTH, dotY)
    ctx.arc(dotX, dotY, LINE_WIDTH, 0, 2 * Math.PI)
  }
  ctx.fillStyle = SPARKLINE_COLOR
  ctx.fill()
}

const drawLine = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  ctx.beginPath()
  line().context(ctx)(points)
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = SPARKLINE_COLOR
  ctx.stroke()
}

type MakeSparklineCellRendererOptions = { ringColor: string; width: number }

export const makeSparklineCellRenderer = ({
  ringColor,
  width,
}: MakeSparklineCellRendererOptions): CustomRenderer<SparklineCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is SparklineCell =>
    (cell.data as Partial<SparklineCellProps>).kind === SPARKLINE_CELL_KIND,
  needsHover: true,
  needsHoverPosition: true,
  // A sparkline has no width of its own, so a fit would land on Glide's 150px.
  measure: () => width,
  draw: ({ ctx, rect, theme, hoverX }, cell) => {
    const { x, y } = cell.data
    if (x.length === 0) {
      return
    }

    const paddingX = theme.cellHorizontalPadding
    const paddingY = theme.cellVerticalPadding
    const scale = scaleToBox(cell.data, {
      left: rect.x + paddingX,
      top: rect.y + paddingY,
      width: rect.width - 2 * paddingX,
      height: rect.height - 2 * paddingY,
    })
    const points = x.map((value, index): Point => [
      scale.x(value),
      scale.y(y[index]),
    ])

    ctx.save()

    // A ring on a peak reaches past the cell. Glide repaints a hovered cell from
    // inside its top and left grid lines, so ink on them would stay behind.
    ctx.beginPath()
    ctx.rect(rect.x + 1, rect.y + 1, rect.width - 1, rect.height - 1)
    ctx.clip()

    if (hoverX !== undefined) {
      const fraction = normalizedXAt({
        hoverX,
        width: rect.width,
        padding: paddingX,
      })
      const index = nearestIndexAt(x, fraction)
      drawRing(ctx, { center: points[index], color: ringColor })
    }

    // Canvas strokes nothing for a path of no length, round cap or not, and
    // a sparkline at one x is one point or many samples of it.
    if (x[0] === x[x.length - 1]) {
      drawDots(ctx, points)
    } else {
      drawLine(ctx, points)
    }

    ctx.restore()
  },
})

import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from '@glideapps/glide-data-grid'
import { line } from 'd3-shape'

import {
  LINE_WIDTH,
  RING_RADIUS,
  RING_WIDTH,
  SPARKLINE_COLOR,
  hoveredIndexAt,
  isAtOneX,
  pointerInContent,
  pointsInBox,
  type Point,
  type SparklineValue,
} from '#src/utils/sparkline'

export const SPARKLINE_CELL_KIND = 'sparkline-cell'

export type SparklineCellProps = SparklineValue & {
  readonly kind: typeof SPARKLINE_CELL_KIND
}

export type SparklineCell = CustomCell<SparklineCellProps>

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
    if (cell.data.x.length === 0) {
      return
    }

    const paddingX = theme.cellHorizontalPadding
    const paddingY = theme.cellVerticalPadding
    const content = {
      left: rect.x + paddingX,
      top: rect.y + paddingY,
      width: rect.width - 2 * paddingX,
      height: rect.height - 2 * paddingY,
    }
    const points = pointsInBox(cell.data, content)

    ctx.save()

    // A ring on a peak reaches past the cell. Glide repaints a hovered cell from
    // inside its top and left grid lines, so ink on them would stay behind.
    ctx.beginPath()
    ctx.rect(rect.x + 1, rect.y + 1, rect.width - 1, rect.height - 1)
    ctx.clip()

    if (hoverX !== undefined) {
      const pointer = pointerInContent(rect.x + hoverX, content)
      const index = hoveredIndexAt(cell.data, pointer)
      drawRing(ctx, { center: points[index], color: ringColor })
    }

    if (isAtOneX(cell.data.x)) {
      drawDots(ctx, points)
    } else {
      drawLine(ctx, points)
    }

    ctx.restore()
  },
})

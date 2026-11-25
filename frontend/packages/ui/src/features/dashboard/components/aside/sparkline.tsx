import { useState, type PointerEvent, type RefObject } from 'react'
import { Tooltip } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import cx from 'clsx'
import { line } from 'd3-shape'
import { clamp } from 'lodash-es'

import { SparklinePoint } from '#src/components/tooltips/sparkline-point'
import {
  LINE_WIDTH,
  RING_RADIUS,
  RING_WIDTH,
  SPARKLINE_COLOR,
  hoveredIndexAt,
  scaleToBox,
  type SparklineValue,
} from '#src/utils/sparkline'

import classes from './sparkline.module.css'

// Room for the ring on a point at the box's edge, which a scroll area would
// otherwise cut.
const INSET = 4

// An 11 px square turned on its corner pokes out 8 px, the table card's arrow,
// so a 7.5 px gap puts its tip on the box.
const ARROW_SIZE = 11
const CARD_OFFSET = { mainAxis: 7.5 }

type SparklineProps = SparklineValue & {
  label: string
  className?: string
}

type Point = [number, number]

// Drawn in the box's own px, never through a scaled viewBox, which would
// stretch the ring and the stroke with the line.
function Sparkline({ x, y, label, className }: SparklineProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>()
  // Mantine types the ref as React 19's RefObject<T | null>, which a div's
  // ref under @types/react 18.3 does not take.
  const boxRef = ref as RefObject<HTMLDivElement>
  // Kept with the array it indexes, so new data drops it before a render
  // reads past the end.
  const [hover, setHover] = useState<{ x: number[]; index: number } | null>(
    null
  )
  const hovered = hover?.x === x ? hover.index : null

  const contentWidth = width - 2 * INSET
  const scale = scaleToBox(
    { x, y },
    {
      left: INSET,
      top: INSET,
      width: contentWidth,
      height: height - 2 * INSET,
    }
  )
  const points = x.map((value, index): Point => [
    scale.x(value),
    scale.y(y[index]),
  ])
  const ring = hovered != null ? points[hovered] : undefined

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget
    const offsetX = event.clientX - box.getBoundingClientRect().left
    const normalizedX = clamp((offsetX - INSET) / contentWidth, 0, 1)
    const index = hoveredIndexAt({ x, y }, { normalizedX, contentWidth })
    if (index === hovered) {
      return
    }

    setHover({ x, index })
  }

  return (
    <div ref={boxRef} className={cx(classes.box, className)}>
      {/* While the panel opens, the box can be narrower than its insets,
          which would draw the line mirrored. */}
      {contentWidth > 0 && (
        <svg
          role="img"
          aria-label={label}
          className={classes.svg}
          width={width}
          height={height}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
        >
          {ring && (
            <circle
              cx={ring[0]}
              cy={ring[1]}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--mantine-color-gray-7)"
              strokeWidth={RING_WIDTH}
            />
          )}
          {/* A path of no length strokes nothing, round cap or not, and a
              sparkline at one x is one point or many samples of it. */}
          {x[0] === x.at(-1) ? (
            points.map(([dotX, dotY], index) => (
              <circle
                key={index}
                cx={dotX}
                cy={dotY}
                r={LINE_WIDTH}
                fill={SPARKLINE_COLOR}
              />
            ))
          ) : (
            <path
              d={line()(points) ?? undefined}
              fill="none"
              stroke={SPARKLINE_COLOR}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
      {/* A line down the box at the ring's x, so the card sits over its top
          edge or under its bottom one, and never covers the sparkline. */}
      {hovered != null && ring && (
        <Tooltip
          opened
          label={<SparklinePoint x={x[hovered]} y={y[hovered]} />}
          position="top"
          withArrow
          arrowSize={ARROW_SIZE}
          offset={CARD_OFFSET}
          transitionProps={{ duration: 0 }}
          positionDependencies={[ring[0]]}
          classNames={{ tooltip: classes.card }}
        >
          <span className={classes.anchor} style={{ left: ring[0] }} />
        </Tooltip>
      )}
    </div>
  )
}

export default Sparkline

import { useMemo, useState, type PointerEvent, type RefObject } from 'react'
import { Tooltip } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import cx from 'clsx'
import { line } from 'd3-shape'

import { SparklinePoint } from '#src/components/tooltips/sparkline-point'
import {
  LINE_WIDTH,
  RING_RADIUS,
  RING_WIDTH,
  SPARKLINE_COLOR,
  hoveredIndexAt,
  isAtOneX,
  pointerInContent,
  pointsInBox,
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

  // A hover moves only the ring, and the points and the path take about 130 ms
  // to build at the 240,000 points a dense run sends.
  const { content, points, path } = useMemo(() => {
    const content = {
      left: INSET,
      top: INSET,
      width: width - 2 * INSET,
      height: height - 2 * INSET,
    }
    const inBox = pointsInBox({ x, y }, content)

    return { content, points: inBox, path: line()(inBox) ?? undefined }
  }, [x, y, width, height])
  const ring = hovered != null ? points[hovered] : undefined

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget
    const offsetX = event.clientX - box.getBoundingClientRect().left
    const pointer = pointerInContent(offsetX, content)
    const index = hoveredIndexAt({ x, y }, pointer)
    if (index === hovered) {
      return
    }

    setHover({ x, index })
  }

  return (
    <div ref={boxRef} className={cx(classes.box, className)}>
      {/* While the panel opens, the box can be narrower than its insets,
          which would draw the line mirrored. */}
      {content.width > 0 && (
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
          {isAtOneX(x) ? (
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
              d={path}
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

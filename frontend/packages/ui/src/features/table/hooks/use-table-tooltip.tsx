import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type GridMouseEventArgs } from '@glideapps/glide-data-grid'
import { type IBounds, useLayer } from 'react-laag'

import {
  TableTooltip,
  type CellTooltip,
} from '#src/features/table/components/tooltips/table-tooltip'
import { ZERO_BOUNDS, toBounds } from '#src/features/table/utils/bounds'
import { assertNever } from '#src/utils/helpers'

const DELAY = { open: 200, switch: 60, close: 200 }
const ARROW_DEPTH = 8

type TooltipState = { target: CellTooltip; bounds: IBounds }
type UseTableTooltipOptions = { suppressed?: boolean }

const sameContent = (a: CellTooltip, b: CellTooltip): boolean => {
  switch (a.kind) {
    case 'error':
      return (
        b.kind === 'error' &&
        a.error.cls === b.error.cls &&
        a.error.message === b.error.message
      )
    case 'image':
      return b.kind === 'image' && a.src === b.src
    case 'sparkline':
      return b.kind === 'sparkline' && a.x === b.x && a.y === b.y
    default:
      return assertNever(a)
  }
}

const sameCell = (
  a: TooltipState | null | undefined,
  b: TooltipState
): boolean =>
  !!a && a.bounds.left === b.bounds.left && a.bounds.top === b.bounds.top

const sameTarget = (
  a: TooltipState | null | undefined,
  b: TooltipState
): boolean => !!a && sameCell(a, b) && sameContent(a.target, b.target)

// `hover` is the pointer's x offset into the cell and the cell width, for
// tooltips that depend on the pointer position (e.g. sparklines).
export type ResolveTooltip = (
  col: number,
  row: number,
  hover: { x: number; width: number }
) => CellTooltip | undefined

export const useTableTooltip = (
  resolve: ResolveTooltip,
  { suppressed = false }: UseTableTooltipOptions = {}
) => {
  const [tooltip, setTooltip] = useState<TooltipState>()
  const tooltipRef = useRef<TooltipState | undefined>(tooltip)
  const closeTimerRef = useRef<number>(0)
  const openTimerRef = useRef<number>(0)
  const rehoverFrameRef = useRef<number>(0)
  const pendingTargetRef = useRef<TooltipState | null>(null)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    tooltipRef.current = tooltip
  }, [tooltip])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
  }, [])

  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setTooltip(undefined)
    }, DELAY.close)
  }, [])

  const cancelOpen = useCallback(() => {
    window.clearTimeout(openTimerRef.current)
    pendingTargetRef.current = null
  }, [])

  // Cold first-open waits DELAY.open; switching while one is already showing
  // (warm) waits the shorter DELAY.switch so the tooltip follows the cursor
  // down a column without re-incurring the full delay.
  const scheduleOpen = useCallback((next: TooltipState) => {
    window.clearTimeout(openTimerRef.current)
    const delay = tooltipRef.current ? DELAY.switch : DELAY.open
    pendingTargetRef.current = next
    openTimerRef.current = window.setTimeout(() => {
      // Read the ref because onMouseMove may have changed the target.
      const next = pendingTargetRef.current
      if (!next) {
        return
      }
      pendingTargetRef.current = null
      // Sync the bounds ref before the state commit so react-laag positions
      // against the new cell on first paint instead of flashing at the old one.
      tooltipRef.current = next
      setTooltip(next)
    }, delay)
  }, [])

  const dismiss = useCallback(() => {
    cancelOpen()
    cancelClose()
    setTooltip(undefined)
  }, [cancelClose, cancelOpen])

  useEffect(() => {
    if (suppressed) {
      dismiss()
    }
  }, [suppressed, dismiss])

  // Glide doesn't refire hover after a layout shift. Wait one frame for the
  // tooltip portal to unmount, then dispatch a synthetic mousemove so Glide
  // re-evaluates which cell is under the cursor.
  const rehoverAtCursor = useCallback(() => {
    const cursor = cursorRef.current
    if (!cursor) {
      return
    }
    cancelAnimationFrame(rehoverFrameRef.current)
    rehoverFrameRef.current = requestAnimationFrame(() => {
      const target = document.elementFromPoint(cursor.x, cursor.y)
      if (!target) {
        return
      }
      target.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: cursor.x,
          clientY: cursor.y,
          bubbles: true,
          cancelable: true,
          view: window,
        })
      )
    })
  }, [])

  const dismissOnScroll = useCallback(() => {
    dismiss()
    rehoverAtCursor()
  }, [dismiss, rehoverAtCursor])

  const onBodyEnter = useCallback(() => {
    cancelOpen()
    cancelClose()
  }, [cancelClose, cancelOpen])

  const onBodyLeave = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  const resolveAt = useCallback(
    (args: GridMouseEventArgs): TooltipState | undefined => {
      if (args.kind !== 'cell') {
        return undefined
      }
      const [col, row] = args.location
      const content = resolve(col, row, {
        x: args.localEventX,
        width: args.bounds.width,
      })
      if (!content) {
        return undefined
      }
      return { target: content, bounds: toBounds(args.bounds) }
    },
    [resolve]
  )

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (suppressed) {
        return
      }
      const next = resolveAt(args)
      if (!next) {
        cancelOpen()
        scheduleClose()
        return
      }
      cancelClose()
      if (sameTarget(tooltipRef.current, next)) {
        cancelOpen()
        return
      }
      if (sameTarget(pendingTargetRef.current, next)) {
        return
      }
      scheduleOpen(next)
    },
    [
      resolveAt,
      cancelClose,
      cancelOpen,
      scheduleClose,
      scheduleOpen,
      suppressed,
    ]
  )

  // Glide only fires onItemHovered when the pointer moves to another cell, so
  // this updates tooltips that depend on the pointer position within a cell.
  // Opening and closing tooltips is left to onItemHovered, so that moving
  // within a cell doesn't restart the open timer or reopen a tooltip closed
  // with Escape.
  const onMouseMove = useCallback(
    (args: GridMouseEventArgs) => {
      if (suppressed) {
        return
      }
      const next = resolveAt(args)
      if (!next || sameTarget(tooltipRef.current, next)) {
        return
      }
      // The tooltip is already open on this cell, so update it immediately.
      if (sameCell(tooltipRef.current, next)) {
        cancelOpen()
        tooltipRef.current = next
        setTooltip(next)
        return
      }
      // The tooltip is about to open on this cell, so just update the target.
      if (sameCell(pendingTargetRef.current, next)) {
        pendingTargetRef.current = next
      }
    },
    [resolveAt, cancelOpen, suppressed]
  )

  useEffect(
    () => () => {
      window.clearTimeout(closeTimerRef.current)
      window.clearTimeout(openTimerRef.current)
      cancelAnimationFrame(rehoverFrameRef.current)
    },
    []
  )

  useEffect(() => {
    if (!tooltip) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss()
      }
    }
    // Capture phase: Glide's hidden input swallows keydown in the bubble phase.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [tooltip, dismiss])

  // Stable identity so react-laag does not re-subscribe scroll/resize
  // listeners on every render.
  const trigger = useMemo(
    () => ({ getBounds: () => tooltipRef.current?.bounds ?? ZERO_BOUNDS }),
    []
  )

  const { renderLayer, layerProps, arrowProps } = useLayer({
    isOpen: tooltip !== undefined,
    placement: 'right-start',
    possiblePlacements: ['right-start', 'left-start', 'right-end', 'left-end'],
    auto: true,
    triggerOffset: ARROW_DEPTH,
    container: 'portal',
    trigger,
  })

  return {
    onItemHovered,
    onMouseMove,
    dismiss,
    dismissOnScroll,
    tooltip: tooltip
      ? renderLayer(
          <TableTooltip
            target={tooltip.target}
            layerProps={layerProps}
            arrowProps={arrowProps}
            arrowSize={ARROW_DEPTH}
            onMouseEnter={onBodyEnter}
            onMouseLeave={onBodyLeave}
          />
        )
      : null,
  }
}

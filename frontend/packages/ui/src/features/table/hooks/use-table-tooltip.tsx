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
} from '../components/tooltips/table-tooltip'
import { ZERO_BOUNDS, toBounds } from '../bounds'
import { assertNever } from '../../../utils/helpers'

const DELAY = { open: 250, switch: 80, close: 400 }
const TRIGGER_OFFSET = 8

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
    default:
      return assertNever(a)
  }
}

const sameTarget = (
  a: TooltipState | null | undefined,
  b: TooltipState
): boolean =>
  !!a &&
  a.bounds.left === b.bounds.left &&
  a.bounds.top === b.bounds.top &&
  sameContent(a.target, b.target)

export const useTableTooltip = (
  resolve: (col: number, row: number) => CellTooltip | undefined,
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
      pendingTargetRef.current = null
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

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (suppressed) {
        return
      }
      if (args.kind !== 'cell') {
        cancelOpen()
        scheduleClose()
        return
      }
      const [col, row] = args.location
      const content = resolve(col, row)
      if (!content) {
        cancelOpen()
        scheduleClose()
        return
      }
      cancelClose()
      const next: TooltipState = {
        target: content,
        bounds: toBounds(args.bounds),
      }
      if (sameTarget(tooltipRef.current, next)) {
        cancelOpen()
        return
      }
      if (sameTarget(pendingTargetRef.current, next)) {
        return
      }
      scheduleOpen(next)
    },
    [resolve, cancelClose, cancelOpen, scheduleClose, scheduleOpen, suppressed]
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
    triggerOffset: TRIGGER_OFFSET,
    container: 'portal',
    trigger,
  })

  return {
    onItemHovered,
    dismiss,
    dismissOnScroll,
    tooltip: tooltip
      ? renderLayer(
          <TableTooltip
            target={tooltip.target}
            layerProps={layerProps}
            arrowProps={arrowProps}
            onMouseEnter={onBodyEnter}
            onMouseLeave={onBodyLeave}
          />
        )
      : null,
  }
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type IBounds, useLayer } from 'react-laag'

import {
  TableTooltip,
  type CellTooltip,
} from '#src/features/table/components/tooltips/table-tooltip'
import type { HoveredCell } from '#src/features/table/types/table.types'
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

export type ResolveTooltip = (cell: HoveredCell) => CellTooltip | undefined

export const useTableTooltip = (
  resolve: ResolveTooltip,
  { suppressed = false }: UseTableTooltipOptions = {}
) => {
  const [tooltip, setTooltip] = useState<TooltipState>()
  const tooltipRef = useRef<TooltipState | undefined>(tooltip)
  const closeTimerRef = useRef<number>(0)
  const openTimerRef = useRef<number>(0)
  const pendingTargetRef = useRef<TooltipState | null>(null)

  useLayoutEffect(() => {
    tooltipRef.current = tooltip
  }, [tooltip])

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
      // Read the ref because onCellMouseMove may have changed the target.
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

  const onBodyEnter = useCallback(() => {
    cancelOpen()
    cancelClose()
  }, [cancelClose, cancelOpen])

  const onBodyLeave = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  const resolveAt = useCallback(
    (cell: HoveredCell | undefined): TooltipState | undefined => {
      if (!cell) {
        return undefined
      }

      const content = resolve(cell)
      if (!content) {
        return undefined
      }

      return { target: content, bounds: toBounds(cell.bounds) }
    },
    [resolve]
  )

  const onCellHovered = useCallback(
    (cell: HoveredCell | undefined) => {
      if (suppressed) {
        return
      }

      const next = resolveAt(cell)
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
  // Opening and closing tooltips is left to onCellHovered, so that moving
  // within a cell doesn't restart the open timer or reopen a tooltip closed
  // with Escape.
  const onCellMouseMove = useCallback(
    (cell: HoveredCell | undefined) => {
      if (suppressed) {
        return
      }

      const next = resolveAt(cell)
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
    onCellHovered,
    onCellMouseMove,
    dismiss,
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

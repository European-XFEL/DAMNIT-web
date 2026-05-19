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

import { ErrorTooltip } from '../components/error-tooltip'

import { type VariableError } from '../../../types'

type TooltipState = { error: VariableError; bounds: IBounds }

const ZERO_BOUNDS: IBounds = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
}

const CLOSE_GRACE_MS = 1000
const OPEN_DWELL_MS = 500
const TRIGGER_OFFSET = 8
const ICON_SIZE = 20
const ICON_PADDING = 8
// 10px tooltip right padding + 26/2 ActionIcon(sm), so `bottom-end` lands
// the Copy button on the icon column.
const COPY_BUTTON_RIGHT_INSET = 23

const sameTarget = (
  a: TooltipState | null | undefined,
  b: TooltipState
): boolean =>
  !!a &&
  a.error === b.error &&
  a.bounds.left === b.bounds.left &&
  a.bounds.top === b.bounds.top

export const useErrorTooltip = (
  lookupError: (col: number, row: number) => VariableError | undefined
) => {
  const [tooltip, setTooltip] = useState<TooltipState>()
  const tooltipRef = useRef<TooltipState | undefined>(tooltip)
  const closeTimerRef = useRef<number>(0)
  const openTimerRef = useRef<number>(0)
  const pendingTargetRef = useRef<TooltipState | null>(null)
  const engagedRef = useRef(false)

  useLayoutEffect(() => {
    tooltipRef.current = tooltip
  }, [tooltip])

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
  }, [])

  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      engagedRef.current = false
      setTooltip(undefined)
    }, CLOSE_GRACE_MS)
  }, [])

  const cancelOpen = useCallback(() => {
    window.clearTimeout(openTimerRef.current)
    pendingTargetRef.current = null
  }, [])

  const scheduleOpen = useCallback((target: TooltipState) => {
    window.clearTimeout(openTimerRef.current)
    if (engagedRef.current) {
      pendingTargetRef.current = null
      setTooltip(target)
      return
    }
    pendingTargetRef.current = target
    openTimerRef.current = window.setTimeout(() => {
      pendingTargetRef.current = null
      setTooltip(target)
    }, OPEN_DWELL_MS)
  }, [])

  const dismiss = useCallback(() => {
    cancelOpen()
    cancelClose()
    engagedRef.current = false
    setTooltip(undefined)
  }, [cancelClose, cancelOpen])

  // Body touched: pin the tooltip and treat further switches as deliberate.
  const onBodyEnter = useCallback(() => {
    engagedRef.current = true
    cancelOpen()
    cancelClose()
  }, [cancelClose, cancelOpen])

  // Glide doesn't re-fire onItemHovered for the cell behind the body, so
  // engagement must pin; close instead comes from off-grid, Escape, or scroll.
  const onBodyLeave = useCallback(() => {
    if (engagedRef.current) {
      return
    }
    scheduleClose()
  }, [scheduleClose])

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== 'cell') {
        cancelOpen()
        scheduleClose()
        return
      }
      const [col, row] = args.location
      const error = lookupError(col, row)
      if (!error) {
        cancelOpen()
        scheduleClose()
        return
      }
      cancelClose()
      const iconCenterX =
        args.bounds.x + args.bounds.width - ICON_PADDING - ICON_SIZE / 2
      const target: TooltipState = {
        error,
        bounds: {
          left: iconCenterX - COPY_BUTTON_RIGHT_INSET,
          top: args.bounds.y,
          width: COPY_BUTTON_RIGHT_INSET * 2,
          height: args.bounds.height,
          right: iconCenterX + COPY_BUTTON_RIGHT_INSET,
          bottom: args.bounds.y + args.bounds.height,
        },
      }
      if (sameTarget(tooltipRef.current, target)) {
        cancelOpen()
        return
      }
      if (sameTarget(pendingTargetRef.current, target)) {
        return
      }
      scheduleOpen(target)
    },
    [lookupError, cancelClose, cancelOpen, scheduleClose, scheduleOpen]
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
    placement: 'bottom-end',
    possiblePlacements: ['bottom-end', 'top-end', 'bottom-start', 'top-start'],
    auto: true,
    triggerOffset: TRIGGER_OFFSET,
    container: 'portal',
    trigger,
  })

  return {
    onItemHovered,
    dismiss,
    tooltip: tooltip
      ? renderLayer(
          <ErrorTooltip
            error={tooltip.error}
            layerProps={layerProps}
            arrowProps={arrowProps}
            onMouseEnter={onBodyEnter}
            onMouseLeave={onBodyLeave}
          />
        )
      : null,
  }
}

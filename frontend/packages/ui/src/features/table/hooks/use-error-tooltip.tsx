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

const CLOSE_GRACE_MS = 80
const TRIGGER_OFFSET = 4
const ICON_SIZE = 20
const ICON_PADDING = 8
// 10px tooltip right padding + 26/2 ActionIcon(sm), so `bottom-end` lands
// the Copy button on the icon column.
const COPY_BUTTON_RIGHT_INSET = 23

export const useErrorTooltip = (
  lookupError: (col: number, row: number) => VariableError | undefined
) => {
  const [tooltip, setTooltip] = useState<TooltipState>()
  const closeTimerRef = useRef<number>(0)

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
  }, [])

  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setTooltip(undefined)
    }, CLOSE_GRACE_MS)
  }, [])

  const dismiss = useCallback(() => {
    cancelClose()
    setTooltip(undefined)
  }, [cancelClose])

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== 'cell') {
        scheduleClose()
        return
      }
      const [col, row] = args.location
      const error = lookupError(col, row)
      if (!error) {
        scheduleClose()
        return
      }
      cancelClose()
      const iconCenterX =
        args.bounds.x + args.bounds.width - ICON_PADDING - ICON_SIZE / 2
      const bounds: IBounds = {
        left: iconCenterX - COPY_BUTTON_RIGHT_INSET,
        top: args.bounds.y,
        width: COPY_BUTTON_RIGHT_INSET * 2,
        height: args.bounds.height,
        right: iconCenterX + COPY_BUTTON_RIGHT_INSET,
        bottom: args.bounds.y + args.bounds.height,
      }
      setTooltip((prev) => {
        if (
          prev &&
          prev.error === error &&
          prev.bounds.left === bounds.left &&
          prev.bounds.top === bounds.top
        ) {
          return prev
        }
        return { error, bounds }
      })
    },
    [lookupError, cancelClose, scheduleClose]
  )

  useEffect(
    () => () => {
      window.clearTimeout(closeTimerRef.current)
    },
    []
  )

  // Stable identity so react-laag does not re-subscribe scroll/resize
  // listeners on every render.
  const tooltipRef = useRef(tooltip)
  useLayoutEffect(() => {
    tooltipRef.current = tooltip
  }, [tooltip])
  const trigger = useMemo(
    () => ({ getBounds: () => tooltipRef.current?.bounds ?? ZERO_BOUNDS }),
    []
  )

  const { renderLayer, layerProps, layerSide, arrowProps } = useLayer({
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
            layerSide={layerSide}
            arrowProps={arrowProps}
            bridgePx={TRIGGER_OFFSET}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />
        )
      : null,
  }
}

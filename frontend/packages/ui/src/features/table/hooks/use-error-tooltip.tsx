import { useCallback, useEffect, useState } from 'react'
import { type GridMouseEventArgs } from '@glideapps/glide-data-grid'

import {
  ErrorTooltip,
  type ErrorTooltipState,
} from '../components/error-tooltip'
import { errorText } from '../cells'

import { type VariableError } from '../../../types'

/**
 * Wires the error-tooltip to a `DataEditor`. `lookupError` maps a hovered
 * (col, row) to its `VariableError`, or undefined for cells without an error.
 * Returns the `onItemHovered` handler and the tooltip element to render. While
 * a tooltip is shown, Ctrl/⌘+C copies its message.
 */
export const useErrorTooltip = (
  lookupError: (col: number, row: number) => VariableError | undefined
) => {
  const [tooltip, setTooltip] = useState<ErrorTooltipState>()
  const [copied, setCopied] = useState(false)

  // Dismiss the tooltip when the cell is no longer under the mouse for reasons
  // other than mouse movement (e.g. scrolling, where `onItemHovered` doesn't
  // fire because the pointer is stationary). Bails out when already hidden so
  // scroll frames don't schedule needless renders.
  const dismiss = useCallback(
    () => setTooltip((prev) => (prev ? undefined : prev)),
    []
  )

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== 'cell') {
        dismiss()
        return
      }
      const [col, row] = args.location
      const error = lookupError(col, row)
      if (!error) {
        dismiss()
        return
      }
      // onItemHovered fires on every pointer move; skip the state update (and
      // the re-render + keydown re-subscribe it triggers) while the pointer
      // stays on the same error cell.
      const x = args.bounds.x + args.bounds.width / 2
      const y = args.bounds.y + args.bounds.height
      setTooltip((prev) =>
        prev && prev.error === error && prev.x === x && prev.y === y
          ? prev
          : { error, x, y }
      )
      setCopied((prev) => (prev ? false : prev))
    },
    [lookupError, dismiss]
  )

  useEffect(() => {
    if (!tooltip) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void navigator.clipboard
          .writeText(errorText(tooltip.error))
          .then(() => setCopied(true))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tooltip])

  return {
    onItemHovered,
    dismiss,
    tooltip: tooltip ? <ErrorTooltip {...tooltip} copied={copied} /> : null,
  }
}

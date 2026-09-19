import { useEffect, useRef, type RefObject } from 'react'
import { useDidUpdate } from '@mantine/hooks'

import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'

// Glide's canvas, which holds the grid's keyboard focus.
const GRID_CANVAS = '[data-testid="data-grid-canvas"]'

type UseAsideFocusOptions = {
  viewRef: RefObject<HTMLDivElement>
  opened: boolean
  onTable: boolean
}

// Hands focus between the view and the run panel beside it. The panel and its
// close button take the refs this returns.
export function useAsideFocus({
  viewRef,
  opened,
  onTable,
}: UseAsideFocusOptions) {
  const isMobile = useIsMobile()
  const asideRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Weak, so the element of a view that has since unmounted can be freed.
  const lastViewFocus = useRef<WeakRef<HTMLElement> | null>(null)

  // Below `sm` the run hides the table, so focus in it moves to the close
  // button, including the focus Glide gives its canvas a frame after a click.
  const coversTable = opened && onTable && isMobile
  useEffect(() => {
    const view = viewRef.current
    if (view == null) {
      return
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        lastViewFocus.current = new WeakRef(event.target)
      }
      if (coversTable) {
        closeRef.current?.focus()
      }
    }

    view.addEventListener('focusin', handleFocusIn)
    return () => view.removeEventListener('focusin', handleFocusIn)
  }, [viewRef, coversTable])

  useDidUpdate(() => {
    if (coversTable && viewRef.current?.contains(document.activeElement)) {
      closeRef.current?.focus()
    }
  }, [coversTable])

  // Closing from the panel hands focus back to where it last was in the view,
  // or to the grid when another view has replaced that element since.
  useDidUpdate(() => {
    const active = document.activeElement
    const focusOnPanel =
      active === document.body || asideRef.current?.contains(active)
    if (opened || !focusOnPanel) {
      return
    }

    const lastFocused = lastViewFocus.current?.deref()
    const target = lastFocused?.isConnected
      ? lastFocused
      : viewRef.current?.querySelector<HTMLElement>(GRID_CANVAS)
    target?.focus()
  }, [opened])

  return { asideRef, closeRef }
}

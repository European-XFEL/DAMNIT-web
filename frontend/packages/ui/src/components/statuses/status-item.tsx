import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { Box, Popover, Tooltip, UnstyledButton } from '@mantine/core'

import classes from './status-item.module.css'

// Touch users open the tooltip too, since it carries the words. A prop
// replaces the theme's whole events object, so hover and focus stay listed.
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: true }

// The table tooltip's, long enough for the pointer to cross onto the bubble.
const BUBBLE_DELAY = 200

type StatusItemProps = {
  tooltip: ReactNode
  icon?: ReactNode
  label?: ReactNode
  value?: ReactNode
  // Names an item that shows only an icon.
  'aria-label'?: string
  // A button beside the tooltip's words, in a bubble the pointer can reach.
  // A click on the item presses it too.
  action?: {
    label: string
    icon: ReactNode
    onClick: () => void
  }
  // An error is a solid red ground, for an item that shows only an icon: words
  // on it read under 4.5:1.
  level?: 'warning' | 'error'
}

function StatusItem({
  tooltip,
  icon,
  label,
  value,
  'aria-label': ariaLabel,
  action,
  level,
}: StatusItemProps) {
  const { opened, open, close, itemRef, setBubble, itemProps, bubbleProps } =
    useBubble({ enabled: action != null })
  const wordsId = useId()

  // The bubble opens too, so the press shows what it did.
  const press = () => {
    open()
    action?.onClick()
  }

  // One element whether or not there is an action, so a state change that
  // adds or removes it keeps keyboard focus where it was.
  return (
    <Popover
      opened={opened}
      onDismiss={close}
      disabled={action == null}
      position="top"
      offset={5}
      // Beside the item in the page, so Tab goes from it to the button.
      withinPortal={false}
      withRoles={false}
      closeOnEscape={false}
    >
      <Popover.Target>
        <Tooltip
          label={tooltip}
          events={TOOLTIP_EVENTS}
          multiline
          maw={320}
          disabled={action != null}
        >
          <Box
            ref={itemRef}
            component="span"
            className={`${classes.item} mantine-focus-auto`}
            mod={{ action: action != null, level }}
            tabIndex={0}
            role={action ? 'button' : ariaLabel ? 'img' : undefined}
            aria-label={
              ariaLabel && action ? `${ariaLabel} ${action.label}` : ariaLabel
            }
            // Only while open, since the words leave the page with the bubble.
            // Left off with no action: even undefined beats the Tooltip's own.
            {...(action && {
              'aria-describedby': opened ? wordsId : undefined,
            })}
            {...itemProps}
            onClick={press}
            onKeyDown={(event) => {
              if (action && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                if (!event.repeat) {
                  press()
                }
              }
            }}
          >
            {icon}
            {label != null && (
              <span>
                {label}
                {value != null && (
                  <>
                    : <b>{value}</b>
                  </>
                )}
              </span>
            )}
          </Box>
        </Tooltip>
      </Popover.Target>
      {/* Focusable, so a click on its words keeps focus inside it. */}
      <Popover.Dropdown
        ref={setBubble}
        className={classes.bubble}
        role="dialog"
        aria-labelledby={wordsId}
        tabIndex={-1}
        {...bubbleProps}
      >
        <div id={wordsId}>{tooltip}</div>
        {action && (
          <UnstyledButton
            className={classes.action}
            // A press can swap the action under the pointer, so the second
            // click of a double click presses nothing.
            onClick={(event) => {
              if (event.detail < 2) {
                action.onClick()
              }
            }}
            // A held Enter would press it again on every repeat.
            onKeyDown={(event) => {
              if (event.repeat) {
                event.preventDefault()
              }
            }}
          >
            {action.icon}
            {action.label}
          </UnstyledButton>
        )}
      </Popover.Dropdown>
    </Popover>
  )
}

// Opens on hover, keyboard focus or a tap, and stays open while the pointer or
// focus is on the item or its bubble.
function useBubble({ enabled }: { enabled: boolean }) {
  const [opened, setOpened] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()
  const itemRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  // React lets go of the bubble before it takes it out, so focus still in it
  // moves to the item. Stable, or React would let go of it on every render.
  const setBubble = useCallback((bubble: HTMLDivElement | null) => {
    if (bubble == null && bubbleRef.current?.contains(document.activeElement)) {
      itemRef.current?.focus()
    }
    bubbleRef.current = bubble
  }, [])

  const open = () => {
    clearTimeout(timeout.current)
    setOpened(true)
  }

  const close = useCallback(() => {
    clearTimeout(timeout.current)
    setOpened(false)
  }, [])

  // Focus in the bubble, or on the item from the keyboard, holds it open, so
  // a keyboard user can still Tab to the button.
  const heldByFocus = () =>
    bubbleRef.current?.contains(document.activeElement) ||
    itemRef.current?.matches(':focus-visible')

  const setOpenedSoon = (next: boolean) => {
    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => {
      if (!next && heldByFocus()) {
        return
      }

      setOpened(next)
    }, BUBBLE_DELAY)
  }

  // A window coming back focuses the item too, and a click opens it anyway.
  const openOnKeyboardFocus = (event: FocusEvent) => {
    if (event.currentTarget.matches(':focus-visible')) {
      open()
    }
  }

  const closeUnlessInside = (event: FocusEvent) => {
    const next = event.relatedTarget
    const inside =
      next instanceof Node &&
      (itemRef.current?.contains(next) || bubbleRef.current?.contains(next))
    if (!inside) {
      close()
    }
  }

  useEffect(() => () => clearTimeout(timeout.current), [])

  // The bubble leaves with its action and fires no leave or blur on the way
  // out, so it stays open only while the item still holds it.
  useLayoutEffect(() => {
    if (!enabled && !itemRef.current?.matches(':hover, :focus-visible')) {
      close()
    }
  }, [enabled, close])

  // Escape closes it wherever focus is, as it does a tooltip. Focus in the
  // bubble moves back to the item first, so the close lands after its open.
  useEffect(() => {
    if (!opened) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (bubbleRef.current?.contains(document.activeElement)) {
        itemRef.current?.focus()
      }

      // Marked handled, so the run panel keeps its run open.
      event.preventDefault()
      close()
    }

    // Capture phase: Glide's hidden input swallows keydown in the bubble phase.
    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [opened, close])

  const hoverProps = {
    onMouseEnter: () => setOpenedSoon(true),
    onMouseLeave: () => setOpenedSoon(false),
  }

  return {
    opened,
    open,
    close,
    itemRef,
    setBubble,
    itemProps: {
      ...hoverProps,
      onFocus: openOnKeyboardFocus,
      onBlur: closeUnlessInside,
    },
    // Focus can land in it while it fades out, so it opens again.
    bubbleProps: { ...hoverProps, onFocus: open, onBlur: closeUnlessInside },
  }
}

export default StatusItem

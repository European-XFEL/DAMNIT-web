import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { Box, Loader, Popover, UnstyledButton } from '@mantine/core'

import { useShownAfter } from '#src/hooks/use-shown-after'
import { FLOATING_ARROW } from '#src/styles/theme'

import classes from './status-item.module.css'

// The table tooltip's, long enough for the pointer to cross onto the bubble.
const BUBBLE_DELAY = 200

type StatusItemProps = {
  tooltip: ReactNode
  icon?: ReactNode
  label?: ReactNode
  value?: ReactNode
  // Names an item that shows only an icon.
  'aria-label'?: string
  // A click on the item presses it too, unless it is pressed from the bubble
  // only: a costly action, such as a page reload, a tap must not set off.
  action?: {
    label: string
    icon: ReactNode
    onClick: () => void
    // Its work is under way: presses are ignored at once, and a loader shows
    // a second in. Not Button's `loading`, which drops the button's focus.
    busy?: boolean
    bubbleOnly?: boolean
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
  const {
    opened,
    open,
    close,
    itemRef,
    setBubble,
    setButton,
    itemProps,
    bubbleProps,
  } = useBubble()
  const wordsId = useId()
  const loaderShown = useShownAfter(action?.busy ?? false)
  const runAction = action?.busy ? undefined : action?.onClick
  const pressesAction = action != null && !action.bubbleOnly

  // The bubble opens too, so the press shows what it did.
  const press = () => {
    open()
    if (pressesAction) {
      runAction?.()
    }
  }

  // One bubble whether or not there is an action, so a state change that adds
  // or removes it changes only the button.
  return (
    <Popover
      opened={opened}
      onDismiss={close}
      position="top"
      {...FLOATING_ARROW}
      // Gone at once, so it never shows beside the next item's bubble.
      transitionProps={{ exitDuration: 0 }}
      // Beside the item in the page, so Tab goes from it to the button.
      withinPortal={false}
      withRoles={false}
      closeOnEscape={false}
    >
      <Popover.Target>
        <Box
          ref={itemRef}
          component="span"
          className={`${classes.item} mantine-focus-auto`}
          mod={{ action: action != null, level }}
          tabIndex={0}
          role={action ? 'button' : ariaLabel ? 'img' : undefined}
          aria-disabled={loaderShown || undefined}
          aria-label={
            ariaLabel && pressesAction
              ? `${ariaLabel} ${action.label}`
              : ariaLabel
          }
          // Only while open, since the words leave the page with the bubble.
          aria-describedby={opened ? wordsId : undefined}
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
      </Popover.Target>
      {/* Focusable, so a click on its words keeps focus inside it. */}
      <Popover.Dropdown
        ref={setBubble}
        className={classes.bubble}
        role={action ? 'dialog' : 'tooltip'}
        aria-labelledby={action ? wordsId : undefined}
        tabIndex={-1}
        {...bubbleProps}
      >
        <div id={wordsId}>{tooltip}</div>
        {action && (
          <UnstyledButton
            ref={setButton}
            className={classes.action}
            aria-disabled={loaderShown || undefined}
            // A press can swap the action under the pointer, so the second
            // click of a double click presses nothing.
            onClick={(event) => {
              if (event.detail < 2) {
                runAction?.()
              }
            }}
            // A held Enter would press it again on every repeat.
            onKeyDown={(event) => {
              if (event.repeat) {
                event.preventDefault()
              }
            }}
          >
            <span className={classes.actionLabel}>
              {action.icon}
              {action.label}
            </span>
            {loaderShown && (
              <Loader
                className={classes.actionLoader}
                type="dots"
                size="xs"
                color="white"
              />
            )}
          </UnstyledButton>
        )}
      </Popover.Dropdown>
    </Popover>
  )
}

// Opens on hover, keyboard focus or a tap, and stays open while the pointer or
// focus is on the item or its bubble.
function useBubble() {
  const [opened, setOpened] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>()
  const itemRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // React lets go of the bubble before it takes it out, so focus still in it
  // moves to the item. Stable, or React would let go of it on every render.
  const setBubble = useCallback((bubble: HTMLDivElement | null) => {
    if (bubble == null && bubbleRef.current?.contains(document.activeElement)) {
      itemRef.current?.focus()
    }
    bubbleRef.current = bubble
  }, [])

  // The button leaves with its action while the bubble stays, in the same way.
  const setButton = useCallback((button: HTMLButtonElement | null) => {
    if (button == null && buttonRef.current === document.activeElement) {
      itemRef.current?.focus()
    }
    buttonRef.current = button
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
    setButton,
    itemProps: {
      ...hoverProps,
      onFocus: openOnKeyboardFocus,
      onBlur: closeUnlessInside,
    },
    // Mantine takes it out a render after it closes, so focus can still land
    // in it; it opens again.
    bubbleProps: { ...hoverProps, onFocus: open, onBlur: closeUnlessInside },
  }
}

export default StatusItem

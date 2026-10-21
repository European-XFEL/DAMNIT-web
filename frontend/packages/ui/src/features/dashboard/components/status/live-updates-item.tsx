import { useEffect, useRef, useState } from 'react'
import { useReactiveVar } from '@apollo/client/react'
import { Box, Indicator, rem, Text, VisuallyHidden } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconBroadcast, IconBroadcastOff } from '@tabler/icons-react'

import StatusItem from '#src/components/statuses/status-item'
import {
  LONGEST_RETRY_DELAY,
  liveUpdates,
  retryNow,
  type LiveUpdatesState,
  type LiveUpdatesStatus,
} from '#src/graphql/live-updates'
import { formatClockTime, formatLongDate } from '#src/utils/time'

import classes from './live-updates-item.module.css'

// Most connects take well under a second, and a spinner for that long would
// only flicker.
const CONNECTING_DELAY = 1000

const ICON_STYLE = { width: rem(16), height: rem(16) }

function LiveUpdatesItem() {
  const state = useReactiveVar(liveUpdates)
  const hidden = useConnectingHidden(state)
  const lost = state.status === 'reconnecting'
  const { name, detail } = describe(state)

  // A new icon once shown, so a quick first connect shows it already live,
  // not easing and fading out of a spin it ran while hidden.
  const icon = (
    <LiveUpdatesIcon key={hidden ? 'hidden' : 'shown'} status={state.status} />
  )

  // Hidden, not left out, so the items after it keep their place when it shows.
  return (
    <>
      <Box
        display="contents"
        style={hidden ? { visibility: 'hidden' } : undefined}
      >
        <StatusItem
          aria-label={name}
          tooltip={
            <>
              <Text span inherit fw={600} display="block">
                {name}
              </Text>
              {detail && ` ${detail}`}
            </>
          }
          icon={icon}
          onClick={lost ? retryNow : undefined}
          warning={lost}
        />
      </Box>
      <VisuallyHidden role="status">{hidden ? '' : name}</VisuallyHidden>
    </>
  )
}

function describe({ status, since, lastPushAt }: LiveUpdatesState) {
  switch (status) {
    case 'connecting':
      return { name: 'Connecting to live updates...' }
    case 'live':
      return {
        name: 'Live updates.',
        detail:
          lastPushAt == null
            ? `No changes since ${formatDateAndTime(since)}.`
            : `Last update ${formatDateAndTime(lastPushAt)}.`,
      }
    case 'reconnecting':
      return {
        name: `Lost live updates ${formatDateAndTime(since)}.`,
        // A no-break space, so a wrap never strands the unit on its own line.
        detail: `Trying again within ${LONGEST_RETRY_DELAY / 1000}\u00a0s. Click to try now.`,
      }
    case 'stopped':
      return {
        name: 'Live updates stopped by the server.',
        detail: 'Reload the page to try again.',
      }
    case 'off':
      return { name: 'The demo has no live updates.' }
  }
}

// "17 October 2026 at 18:42:10", as the Modified item's tooltip has it. No-break
// spaces, so a wrap moves it whole and never strands the time.
function formatDateAndTime(time: number) {
  const text = `${formatLongDate(time)} at ${formatClockTime(time)}`
  return text.replaceAll(' ', '\u00a0')
}

const DOT_COLORS = {
  connecting: 'gray',
  live: 'green',
  reconnecting: 'yellow',
  stopped: 'red',
  off: undefined,
}

const SPIN = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }]
const SPIN_DURATION = 1200
const EASE_BACK_DURATION = 300
// Under this the arc eases back to 0°, since easing on to 360° would whirl it
// nearly a whole turn in one short ease.
const EASE_BACK_ANGLE = 30

type LiveUpdatesIconProps = {
  status: LiveUpdatesStatus
}

function LiveUpdatesIcon({ status }: LiveUpdatesIconProps) {
  const ref = useArcSpin(status === 'connecting' || status === 'reconnecting')
  const dotColor = DOT_COLORS[status]

  // Flex, so the icon sets the height: on a text line the box would take the
  // line height and sit too low.
  return (
    <Indicator
      ref={ref}
      color={dotColor}
      disabled={dotColor == null}
      size={8}
      position="top-end"
      offset={2}
      display="flex"
      withBorder
      classNames={{ indicator: classes.dot }}
    >
      {status === 'stopped' || status === 'off' ? (
        <IconBroadcastOff
          style={ICON_STYLE}
          stroke={1.5}
          color={status === 'off' ? 'var(--mantine-color-gray-5)' : undefined}
          aria-hidden
        />
      ) : (
        <IconBroadcast
          className={classes.broadcast}
          data-status={status}
          style={ICON_STYLE}
          stroke={1.5}
          aria-hidden
        />
      )}
    </Indicator>
  )
}

// Web Animations rather than a CSS animation, which loses its angle once the
// status changes, so the arc eases back to rest from wherever it stopped.
function useArcSpin(spinning: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion(false, {
    getInitialValueInEffect: false,
  })

  useEffect(() => {
    const arc = ref.current?.querySelector('path')
    if (!spinning || reducedMotion || arc == null) {
      return
    }

    const spin = arc.animate(SPIN, {
      duration: SPIN_DURATION,
      iterations: Infinity,
    })

    return () => {
      const turn = (Number(spin.currentTime) % SPIN_DURATION) / SPIN_DURATION
      const angle = turn * 360
      const rest = angle < EASE_BACK_ANGLE ? 0 : 360

      spin.cancel()
      arc.animate(
        [
          { transform: `rotate(${angle}deg)` },
          { transform: `rotate(${rest}deg)` },
        ],
        { duration: EASE_BACK_DURATION, easing: 'ease-out' }
      )
    }
  }, [spinning, reducedMotion])

  return ref
}

// Whether live updates are on their first connect, but not yet for long enough
// to say so. Once shown the item stays, so a drop keeps focus on it.
function useConnectingHidden({ status, since }: LiveUpdatesState) {
  const [hidden, setHidden] = useState(true)

  if (hidden && status !== 'connecting') {
    setHidden(false)
  }

  useEffect(() => {
    if (!hidden || status !== 'connecting') {
      return
    }

    const timeout = setTimeout(
      () => setHidden(false),
      since + CONNECTING_DELAY - Date.now()
    )

    return () => clearTimeout(timeout)
  }, [hidden, status, since])

  return hidden
}

export default LiveUpdatesItem

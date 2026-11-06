import { Text } from '@mantine/core'

import RetryIcon from '#src/components/icons/retry-icon'
import StatusItem from '#src/components/statuses/status-item'
import { describeOutdatedRuns } from '#src/features/plots/preview-plot.transforms'
import { useMinuteClock } from '#src/hooks/use-minute-clock'
import { formatClockTime, formatLongDate, formatTimeAgo } from '#src/utils/time'

type ComputedItemProps = {
  time: number
  // The drawn runs computed again since, which a preview reloads.
  outdated?: number[]
  onReload?: () => void
  reloading?: boolean
}

function ComputedItem({
  time,
  outdated = [],
  onReload = () => {},
  reloading = false,
}: ComputedItemProps) {
  const now = useMinuteClock()
  const isOutdated = outdated.length > 0
  const value = formatTimeAgo(time, { now })

  return (
    <StatusItem
      label="Computed"
      value={value}
      tooltip={
        <>
          <Text span inherit display={isOutdated ? 'block' : undefined}>
            Computed{' '}
            <Text span inherit fw={600}>
              {formatLongDate(time)}
            </Text>{' '}
            at{' '}
            <Text span inherit fw={600}>
              {formatClockTime(time)}
            </Text>
          </Text>
          {isOutdated && describeOutdatedRuns(outdated)}
        </>
      }
      aria-label={isOutdated ? `Computed: ${value}.` : undefined}
      action={
        isOutdated
          ? {
              label: 'Reload',
              icon: <RetryIcon />,
              onClick: onReload,
              busy: reloading,
            }
          : undefined
      }
      level={isOutdated ? 'warning' : undefined}
    />
  )
}

export default ComputedItem

import { Text } from '@mantine/core'

import StatusItem from '#src/components/statuses/status-item'
import { useMinuteClock } from '#src/hooks/use-minute-clock'
import { formatClockTime, formatLongDate, formatTimeAgo } from '#src/utils/time'

type ComputedItemProps = {
  time: number
}

function ComputedItem({ time }: ComputedItemProps) {
  const now = useMinuteClock()

  return (
    <StatusItem
      label="Computed"
      value={formatTimeAgo(time, { now })}
      tooltip={
        <>
          Computed{' '}
          <Text span inherit fw={600}>
            {formatLongDate(time)}
          </Text>{' '}
          at{' '}
          <Text span inherit fw={600}>
            {formatClockTime(time)}
          </Text>
        </>
      }
    />
  )
}

export default ComputedItem

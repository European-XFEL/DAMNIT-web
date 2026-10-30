import { memo } from 'react'
import { Text, VisuallyHidden } from '@mantine/core'

import RetryIcon from '#src/components/icons/retry-icon'
import StatusItem from '#src/components/statuses/status-item'
import type { RunId } from '#src/data/table/table-data.types'
import { describeRetry } from '#src/graphql/live-updates'
import { useShownAfter } from '#src/hooks/use-shown-after'
import type { LoadErrors } from '#src/features/table/types/table.types'
import { describeLoadErrors } from '#src/features/table/utils/load-errors'

const numberFormat = new Intl.NumberFormat('en')

function formatRunCount(count: number) {
  return `${numberFormat.format(count)} ${count === 1 ? 'run' : 'runs'}`
}

type RunCountItemProps = {
  runs: RunId[]
  loadErrors: LoadErrors
  onTryAgain: () => void
}

// The table's run count, tinted while runs in view fail to load. Memoised
// because a column flash re-renders the table every frame.
export const RunCountItem = memo(function RunCountItem({
  runs,
  loadErrors,
  onTryAgain,
}: RunCountItemProps) {
  const failure = describeLoadErrors(loadErrors, runs)
  // With nothing waiting for the clock, a try is out and a press does nothing.
  const tryShown = useShownAfter(failure != null && !loadErrors.waitsForRetry)
  const count = formatRunCount(runs.length)

  // The status keeps its words while more pages fail, so it speaks once.
  return (
    <>
      <StatusItem
        label={count}
        tooltip={
          failure ? (
            <>
              <Text span inherit fw={600} display="block">
                {failure.name}
              </Text>
              {` ${failure.runs} ${describeRetry({ tryShown })}`}
            </>
          ) : (
            'Runs in this proposal'
          )
        }
        aria-label={failure ? `${count}. ${failure.name}.` : undefined}
        action={
          failure
            ? {
                label: 'Try again',
                icon: <RetryIcon />,
                onClick: onTryAgain,
                busy: tryShown,
              }
            : undefined
        }
        warning={failure != null}
      />
      <VisuallyHidden role="status">
        {failure ? `${failure.name}.` : ''}
      </VisuallyHidden>
    </>
  )
})

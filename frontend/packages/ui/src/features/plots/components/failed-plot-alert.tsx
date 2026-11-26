import { Button, Loader, Stack, Text } from '@mantine/core'

import UnableToDisplayAlert from '#src/components/feedback/unable-to-display-alert'
import RetryIcon from '#src/components/icons/retry-icon'

type FailedPlotAlertProps = {
  retrying: boolean
  onRetry: () => void
}

function FailedPlotAlert({ retrying, onRetry }: FailedPlotAlertProps) {
  return (
    <UnableToDisplayAlert title="Unable to load the plot">
      <Stack gap={8} align="flex-start">
        <Text size="sm">
          Its data failed to load. It tries again on its own.
        </Text>
        <Button
          size="xs"
          variant="default"
          // Not `loading`, whose disabled attribute drops the focus.
          leftSection={
            retrying ? <Loader size={14} color="currentColor" /> : <RetryIcon />
          }
          data-disabled={retrying || undefined}
          aria-disabled={retrying || undefined}
          onClick={onRetry}
        >
          Try again
        </Button>
      </Stack>
    </UnableToDisplayAlert>
  )
}

export default FailedPlotAlert

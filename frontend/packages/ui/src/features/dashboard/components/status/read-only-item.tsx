import { rem } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'

import StatusItem from '#src/components/statuses/status-item'

function ReadOnlyItem() {
  return (
    <StatusItem
      aria-label="Read-only"
      tooltip="Read-only. To edit comments or the context file, or to reprocess runs, use the DAMNIT GUI."
      icon={
        <IconLock
          style={{ width: rem(16), height: rem(16) }}
          stroke={1.5}
          aria-hidden
        />
      }
    />
  )
}

export default ReadOnlyItem

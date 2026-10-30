import { rem } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'

function RetryIcon() {
  return (
    <IconRefresh
      style={{ width: rem(14), height: rem(14) }}
      stroke={2}
      aria-hidden
    />
  )
}

export default RetryIcon

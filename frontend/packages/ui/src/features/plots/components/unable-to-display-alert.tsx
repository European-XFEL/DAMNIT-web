import type { PropsWithChildren } from 'react'
import { Alert, rem } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

function UnableToDisplayAlert({ children }: PropsWithChildren) {
  return (
    <Alert
      variant="light"
      color="orange"
      title="Unable to display the plot"
      // Mantine draws the icon in orange.7, 2.73:1 on the tint; orange.8 keeps
      // it over 3:1. The theme already sets the title in the text color.
      styles={{ icon: { color: 'var(--mantine-color-orange-8)' } }}
      icon={
        <IconInfoCircle
          style={{ width: rem(20), height: rem(20) }}
          stroke={1.5}
          aria-hidden
        />
      }
    >
      {children}
    </Alert>
  )
}

export default UnableToDisplayAlert

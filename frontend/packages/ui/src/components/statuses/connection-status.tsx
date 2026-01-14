import { Group, Indicator } from '@mantine/core'
import { IconWifi } from '@tabler/icons-react'

type ConnectionStatusProps = { connected?: boolean; disabled?: boolean }

function ConnectionStatus({
  connected = false,
  disabled = false,
}: ConnectionStatusProps) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Indicator
        color={disabled ? 'gray' : connected ? 'green' : 'red'}
        size={8}
        position="top-end"
        offset={10}
        inline
        withBorder
      >
        <IconWifi size={14} color={disabled ? 'gray' : undefined} />
      </Indicator>
    </Group>
  )
}

export default ConnectionStatus

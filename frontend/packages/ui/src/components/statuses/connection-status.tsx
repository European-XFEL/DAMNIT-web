import { Group, Indicator, rem } from '@mantine/core'
import { IconWifi } from '@tabler/icons-react'

type ConnectionStatusProps = { connected?: boolean; disabled?: boolean }

function ConnectionStatus({
  connected = false,
  disabled = false,
}: ConnectionStatusProps) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      {/* Flex, so the icon sets the height: on a text line the box would take
          the line height and poke out of the bar. */}
      <Indicator
        color={disabled ? 'gray' : connected ? 'green' : 'red'}
        size={8}
        position="top-end"
        offset={2}
        display="flex"
        withBorder
      >
        <IconWifi
          style={{ width: rem(14), height: rem(14) }}
          color={
            disabled
              ? 'var(--mantine-color-gray-5)'
              : 'var(--mantine-color-gray-7)'
          }
          aria-hidden
        />
      </Indicator>
    </Group>
  )
}

export default ConnectionStatus

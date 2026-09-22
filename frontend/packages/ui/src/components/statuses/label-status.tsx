import type { ElementType, ReactNode } from 'react'
import { Group, rem, Text } from '@mantine/core'
import type { IconProps } from '@tabler/icons-react'

type LabelProps = {
  content: ReactNode | string
  bold?: boolean
}

function Label({ content, bold = false }: LabelProps) {
  if (typeof content === 'string') {
    return (
      <Text span fw={bold ? 600 : undefined} lh="xs">
        {content}
      </Text>
    )
  }

  return content
}

export type LabelStatusProps = {
  label: ReactNode
  value?: ReactNode
  icon?: ElementType<IconProps>
}

function LabelStatus({ label, value, icon: Icon }: LabelStatusProps) {
  return (
    <Group gap={6} wrap="nowrap" align="center">
      {Icon && (
        <Icon
          style={{ width: rem(14), height: rem(14) }}
          color="var(--mantine-color-gray-7)"
          aria-hidden
        />
      )}
      <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
        <Label content={label} />
        {value != null && (
          <>
            <Label content={': '} />
            <Label content={value} bold />
          </>
        )}
      </Text>
    </Group>
  )
}

export default LabelStatus

import type { ReactNode } from 'react'
import { Group, Text } from '@mantine/core'

type LabelProps = {
  content: ReactNode | string
  bold?: boolean
}

function Label({ content, bold = false }: LabelProps) {
  if (typeof content === 'string') {
    return (
      <Text span fw={bold ? 600 : 10} lh="xs">
        {content}
      </Text>
    )
  }

  return content
}

export type LabelStatusProps = {
  label: ReactNode
  value?: ReactNode
}

function LabelStatus({ label, value }: LabelStatusProps) {
  return (
    <Group wrap="nowrap" align="center">
      <Text size="xs" fz={11} style={{ whiteSpace: 'nowrap' }}>
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

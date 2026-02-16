import { type ElementType } from 'react'
import { forwardRef } from 'react'
import { Badge, Button, Group, Text, type BadgeProps } from '@mantine/core'
import { type IconProps } from '@tabler/icons-react'

type ControlButtonProps = {
  onClick: () => void
  isActive?: boolean

  icon: ElementType<IconProps>
  label: string

  badgeCount: number
  badgeColor?: BadgeProps['color']
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  (
    { isActive = false, onClick, icon: Icon, label, badgeCount, badgeColor },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        variant={isActive ? 'light' : 'white'}
        color="gray"
        c="black"
        size="xs"
        leftSection={<Icon size={14} />}
        onClick={onClick}
      >
        <Group gap={6}>
          <Text size="xs" fw={500}>
            {label}
          </Text>
          {badgeCount && (
            <Badge variant="light" size="sm" radius="sm" color={badgeColor}>
              {badgeCount}
            </Badge>
          )}
        </Group>
      </Button>
    )
  }
)

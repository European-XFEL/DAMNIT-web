import { type ElementType } from 'react'
import { forwardRef } from 'react'
import { Badge, Button, rem } from '@mantine/core'
import { type IconProps } from '@tabler/icons-react'

import classes from './control-button.module.css'

type ControlButtonProps = {
  onClick: () => void
  isActive?: boolean

  icon: ElementType<IconProps>
  label: string

  badgeCount: number
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ isActive = false, onClick, icon: Icon, label, badgeCount }, ref) => {
    return (
      <Button
        ref={ref}
        variant={isActive ? 'light' : 'white'}
        color="gray"
        c="black"
        size="xs"
        classNames={{
          root: classes.root,
          section: classes.section,
          label: classes.label,
        }}
        leftSection={<Icon style={{ width: rem(14), height: rem(14) }} />}
        rightSection={
          badgeCount ? (
            // A light badge's tint takes the button's state and its text caps at
            // shade 6, so both are set to hold the count at one contrast ratio.
            <Badge
              variant="light"
              size="sm"
              radius="sm"
              bg="indigo.0"
              c="indigo.8"
            >
              {badgeCount}
            </Badge>
          ) : undefined
        }
        onClick={onClick}
      >
        {label}
      </Button>
    )
  }
)

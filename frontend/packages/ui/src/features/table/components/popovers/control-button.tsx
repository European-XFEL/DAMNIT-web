import { type ComponentPropsWithoutRef, type ElementType } from 'react'
import { forwardRef } from 'react'
import { Badge, Button, rem } from '@mantine/core'
import { type IconProps } from '@tabler/icons-react'

import classes from './control-button.module.css'

// The rest are what a popover's target hands its button: whether it is open,
// and the id the popover is named by.
type ControlButtonProps = ComponentPropsWithoutRef<'button'> & {
  onClick: () => void
  isActive?: boolean

  icon: ElementType<IconProps>
  label: string

  badge?: string
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ isActive = false, onClick, icon: Icon, label, badge, ...rest }, ref) => {
    return (
      <Button
        {...rest}
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
          badge ? (
            // A light badge's tint takes the button's state and its text caps at
            // shade 6, so both are set to hold the text at one contrast ratio.
            // A count is a phrase beside its label, not a status stamp, so it
            // keeps its case and sits one weight over the label.
            <Badge
              variant="light"
              size="sm"
              radius="sm"
              bg="indigo.0"
              c="indigo.8"
              tt="none"
              fw={600}
              lts="normal"
            >
              {badge}
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

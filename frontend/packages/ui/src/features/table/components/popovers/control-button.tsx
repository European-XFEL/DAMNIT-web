import { forwardRef, type ElementType } from 'react'
import { Badge, Button, rem } from '@mantine/core'
import { type IconProps } from '@tabler/icons-react'

import classes from './control-button.module.css'

type ControlButtonProps = {
  onClick: () => void
  isActive?: boolean

  icon: ElementType<IconProps>
  label: string
  labelId: string

  badge?: string
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  (
    { onClick, isActive = false, icon: Icon, label, labelId, badge, ...rest },
    ref
  ) => {
    return (
      <Button
        // Popover.Target clones aria-expanded, aria-controls and the target id
        // onto this button, so they have to reach the DOM.
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
        <span id={labelId}>{label}</span>
      </Button>
    )
  }
)

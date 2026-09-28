import {
  useId,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Popover } from '@mantine/core'
import { useDisclosure, useFocusReturn } from '@mantine/hooks'
import { type IconProps } from '@tabler/icons-react'

import { ControlButton } from './control-button'

type BasePopoverProps = {
  icon: ElementType<IconProps>
  label: string
  badge?: string
  children: ReactNode
}

export function BasePopover({
  icon,
  label,
  badge,
  children,
}: BasePopoverProps) {
  const [opened, { toggle, open, close }] = useDisclosure(false)
  const labelId = useId()
  // Only Escape hands focus back. On every close it would take focus off the
  // cell a click outside just landed on.
  const returnFocus = useFocusReturn({ opened, shouldReturnFocus: false })

  // Mantine's own Escape ignores a key already handled, so an Escape that
  // cancels a drag would close the popover too.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      close()
      returnFocus()
    }
  }

  return (
    <Popover
      opened={opened}
      onChange={(value) => (value ? open() : close())}
      onClose={close}
      shadow="md"
      radius="sm"
      closeOnClickOutside
      closeOnEscape={false}
      trapFocus
      withArrow
      arrowPosition="side"
      arrowSize={12}
      offset={{ mainAxis: 6 }}
      position="bottom-start"
      styles={{
        dropdown: {
          border: `1px solid var(--mantine-color-default-border)`,
        },
        arrow: {
          border: `1px solid var(--mantine-color-default-border)`,
        },
      }}
    >
      <Popover.Target>
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={icon}
          label={label}
          labelId={labelId}
          badge={badge}
        />
      </Popover.Target>
      {/* Mantine names the dropdown after the whole target, so a badge on it
          would change the dialog's name while it is open. */}
      <Popover.Dropdown
        aria-labelledby={labelId}
        px={0}
        py={0}
        onKeyDownCapture={handleKeyDownCapture}
      >
        {children}
      </Popover.Dropdown>
    </Popover>
  )
}

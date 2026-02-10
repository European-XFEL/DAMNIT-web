import { type ReactNode } from 'react'
import { Popover, rem } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { FieldSettings, type FieldSettingsProps } from './field-settings'

type RenderTargetOptions = {
  opened: boolean
  toggle: () => void
}

type FieldsPopoverProps = {
  renderTarget: (options: RenderTargetOptions) => ReactNode
} & FieldSettingsProps

export function FieldsPopover({
  renderTarget,
  ...fieldSettingsProps
}: FieldsPopoverProps) {
  const [opened, { toggle, open, close }] = useDisclosure(false)

  return (
    <Popover
      opened={opened}
      onChange={(value) => (value ? open() : close())}
      onClose={close}
      width={rem(320)}
      shadow="md"
      radius="sm"
      closeOnClickOutside
      withArrow
      arrowPosition="center"
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
      <Popover.Target>{renderTarget({ opened, toggle })}</Popover.Target>
      <Popover.Dropdown px={0} py={0}>
        <FieldSettings {...fieldSettingsProps} />
      </Popover.Dropdown>
    </Popover>
  )
}

import { type ReactNode } from 'react'
import { Popover } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

type RenderTargetOptions = {
  opened: boolean
  toggle: () => void
}

type BasePopoverProps = {
  renderTarget: (options: RenderTargetOptions) => ReactNode
  children: ReactNode
}

export function BasePopover({ renderTarget, children }: BasePopoverProps) {
  const [opened, { toggle, open, close }] = useDisclosure(false)

  return (
    <Popover
      opened={opened}
      onChange={(value) => (value ? open() : close())}
      onClose={close}
      shadow="md"
      radius="sm"
      closeOnClickOutside
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
      <Popover.Target>{renderTarget({ opened, toggle })}</Popover.Target>
      <Popover.Dropdown px={0} py={0}>
        {children}
      </Popover.Dropdown>
    </Popover>
  )
}

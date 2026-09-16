import { type KeyboardEvent, type ReactNode } from 'react'
import { Popover } from '@mantine/core'
import { useDisclosure, useFocusReturn } from '@mantine/hooks'

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
      <Popover.Target>{renderTarget({ opened, toggle })}</Popover.Target>
      <Popover.Dropdown px={0} py={0} onKeyDownCapture={handleKeyDownCapture}>
        {children}
      </Popover.Dropdown>
    </Popover>
  )
}

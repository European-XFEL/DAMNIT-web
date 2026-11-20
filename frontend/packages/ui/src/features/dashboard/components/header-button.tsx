import type { MouseEventHandler, ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { Button, rem } from '@mantine/core'
import type { Icon } from '@tabler/icons-react'

import classes from './header-button.module.css'

type HeaderButtonProps = {
  to: To
  icon: Icon
  children: ReactNode
  target?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

// Gray, not the accent: indigo.7 on the band's gray.1 is under 4.5:1.
function HeaderButton({
  to,
  icon: ButtonIcon,
  children,
  target,
  onClick,
}: HeaderButtonProps) {
  return (
    <Button
      component={Link}
      to={to}
      target={target}
      onClick={onClick}
      variant="subtle"
      color="gray"
      c="gray.9"
      size="xs"
      fw={500}
      classNames={{ root: classes.root, section: classes.icon }}
      leftSection={
        <ButtonIcon style={{ width: rem(14), height: rem(14) }} stroke={2} />
      }
    >
      {children}
    </Button>
  )
}

export default HeaderButton

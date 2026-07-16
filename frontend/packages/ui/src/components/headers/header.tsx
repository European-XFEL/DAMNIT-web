import { type PropsWithChildren } from 'react'
import { Group } from '@mantine/core'

import headerClasses from '../../styles/header.module.css'

type HeaderProps = {
  px: number
}

const Header = ({ children, ...props }: PropsWithChildren<HeaderProps>) => {
  return (
    <Group
      h="100%"
      w="100%"
      className={headerClasses.body}
      justify="space-between"
      align="center"
      {...props}
    >
      {children}
    </Group>
  )
}

export default Header

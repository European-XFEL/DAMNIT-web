import { type ElementType, type ReactNode } from 'react'
import {
  Anchor,
  Group,
  rem,
  type AnchorProps,
  type ElementProps,
} from '@mantine/core'
import {
  IconBook,
  IconBrandGithub,
  IconBuilding,
  IconScale,
  type IconProps,
} from '@tabler/icons-react'

import classes from './site-footer.module.css'

interface SiteAnchorProps
  extends AnchorProps,
    ElementProps<'a', keyof AnchorProps> {
  icon: ElementType<IconProps>
  children?: ReactNode
}
function SiteAnchor({ icon: Icon, children, ...props }: SiteAnchorProps) {
  return (
    <Anchor target="_blank" size="xs" className={classes.anchor} {...props}>
      <Icon style={{ width: rem(14), height: rem(14) }} aria-hidden />
      {children}
    </Anchor>
  )
}

function SiteFooter() {
  return (
    <Group justify="space-between" w="100%" mx={16} my={6}>
      <Group gap="md">
        <SiteAnchor href="https://damnit.rtfd.io" icon={IconBook}>
          Documentation
        </SiteAnchor>
        <SiteAnchor
          href="https://github.com/European-XFEL/DAMNIT-web"
          icon={IconBrandGithub}
        >
          Source code
        </SiteAnchor>
      </Group>
      <Group gap="md">
        <SiteAnchor
          href="https://www.xfel.eu/legal_notice/index_eng.html"
          icon={IconScale}
        >
          Legal Notice
        </SiteAnchor>
        <SiteAnchor href="https://www.xfel.eu/contacts/" icon={IconBuilding}>
          Contacts
        </SiteAnchor>
      </Group>
    </Group>
  )
}

export default SiteFooter

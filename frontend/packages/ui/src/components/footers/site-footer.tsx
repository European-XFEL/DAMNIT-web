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
    // Padding, not margin: a margin on a full-width row runs past its parent.
    <Group justify="space-between" w="100%" px={16} py={6}>
      {/* Two marked links sit as far apart as the toolbar sets its own pairs. */}
      <Group gap={24}>
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
      <Group gap={24}>
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

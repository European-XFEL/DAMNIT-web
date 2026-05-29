import { type ReactNode } from 'react'
import {
  Anchor,
  Group,
  type AnchorProps,
  type ElementProps,
} from '@mantine/core'

interface SiteAnchorProps
  extends AnchorProps,
    ElementProps<'a', keyof AnchorProps> {
  children?: ReactNode
}

function SiteAnchor({ children, ...props }: SiteAnchorProps) {
  return (
    <Anchor underline="hover" size="sm" c="indigo" {...props}>
      {children}
    </Anchor>
  )
}

function SiteFooter() {
  return (
    <Group justify="space-between" w="100%" mx={16} my={8}>
      <Group gap="lg">
        <SiteAnchor href="/docs" target="_blank">
          Documentation
        </SiteAnchor>
        <SiteAnchor
          href="https://github.com/ktippey-hzdr/DAMNIT-web-hzdr"
          target="_blank"
        >
          Source code
        </SiteAnchor>
      </Group>
      <Group gap="lg">
        <SiteAnchor
          href="https://www.xfel.eu/legal_notice/index_eng.html"
          target="_blank"
        >
          Legal Notice
        </SiteAnchor>
        <SiteAnchor href="https://github.com/ktippey-hzdr" target="_blank">
          Contact
        </SiteAnchor>
      </Group>
    </Group>
  )
}

export default SiteFooter

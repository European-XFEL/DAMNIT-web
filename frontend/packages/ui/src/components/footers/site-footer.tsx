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
    <Anchor target="_blank" underline="hover" size="sm" c="indigo" {...props}>
      {children}
    </Anchor>
  )
}

function SiteFooter() {
  return (
    <Group justify="space-between" w="100%" mx={16} my={8}>
      <Group gap="lg">
        <SiteAnchor href="https://damnit.rtfd.io">📑 Documentation</SiteAnchor>
        <SiteAnchor href="https://github.com/European-XFEL/DAMNIT-web">
          💻 Source code
        </SiteAnchor>
      </Group>
      <Group gap="lg">
        <SiteAnchor href="https://www.xfel.eu/legal_notice/index_eng.html">
          ⚖️ Legal Notice
        </SiteAnchor>
        <SiteAnchor href="https://www.xfel.eu/contacts/">
          🏢 Contacts
        </SiteAnchor>
      </Group>
    </Group>
  )
}

export default SiteFooter

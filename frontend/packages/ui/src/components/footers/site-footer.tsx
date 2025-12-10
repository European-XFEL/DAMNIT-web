import { type ReactNode } from 'react'
import {
  Anchor,
  Group,
  type AnchorProps,
  type ElementProps,
} from '@mantine/core'
import { formatUrl } from '../../utils/helpers'

const DEFAULT_ABOUT_URL = `${formatUrl(import.meta.env.VITE_SITE_URL || 'https://damnit.xfel.eu/')}about`

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

interface SiteFooterProps {
  aboutUrl?: string
}

function SiteFooter({ aboutUrl = DEFAULT_ABOUT_URL }: SiteFooterProps) {
  return (
    <Group justify="space-between" w="100%" mx={16} my={8}>
      <Group gap="lg">
        <SiteAnchor href="https://damnit.rtfd.io">Docs</SiteAnchor>
        <SiteAnchor href="https://github.com/European-XFEL/DAMNIT-web">
          GitHub
        </SiteAnchor>
      </Group>
      <Group gap="lg">
        <SiteAnchor href={aboutUrl}>Legals & About</SiteAnchor>
        <SiteAnchor href="http://www.xfel.eu/contacts/">Contacts</SiteAnchor>
      </Group>
    </Group>
  )
}

export default SiteFooter

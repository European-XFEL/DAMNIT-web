import { Anchor, Group } from '@mantine/core'
import { formatUrl } from '../../utils/helpers'

interface SiteFooterProps {
  aboutUrl?: string
}

const DEFAULT_ABOUT_URL = `${formatUrl(import.meta.env.VITE_SITE_URL || 'https://damnit.xfel.eu/')}about`

function SiteFooter({ aboutUrl = DEFAULT_ABOUT_URL }: SiteFooterProps) {
  return (
    <Group justify="flex-end" gap="lg">
      <Anchor
        href={aboutUrl}
        target="_blank"
        underline="hover"
        size="sm"
        c="indigo"
      >
        Legals & About
      </Anchor>
      <Anchor
        href="http://www.xfel.eu/contacts/"
        target="_blank"
        underline="hover"
        size="sm"
        c="indigo"
      >
        Contacts
      </Anchor>
    </Group>
  )
}

export default SiteFooter

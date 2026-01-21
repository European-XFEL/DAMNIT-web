import { ActionIcon, Affix, Text, Tooltip } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'

const CONTACT_EMAIL = 'da@xfel.eu'

function ContactButton() {
  return (
    <Affix position={{ bottom: 40, right: 16 }}>
      <Tooltip
        withArrow
        position="left"
        multiline
        w={260}
        label={
          <Text size="sm">
            Feedback and questions are very much welcome! Please contact us at{' '}
            <Text component="span" fw={600}>
              {CONTACT_EMAIL}
            </Text>
            .
          </Text>
        }
      >
        <ActionIcon
          component="a"
          href={`mailto:${CONTACT_EMAIL}`}
          color="indigo"
          radius="xl"
          size={60}
        >
          <IconMail stroke={1.5} size={30} />
        </ActionIcon>
      </Tooltip>
    </Affix>
  )
}

export default ContactButton

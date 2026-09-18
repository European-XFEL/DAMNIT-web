import { ActionIcon, Affix, Text, Tooltip, rem } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'

import { CONTACT_EMAIL } from '#src/constants'

function ContactButton() {
  return (
    <Affix position={{ bottom: 40, right: 16 }}>
      <Tooltip
        withArrow
        position="left"
        multiline
        w={260}
        label={
          <Text inherit>
            Feedback and questions are very much welcome! Please contact us at{' '}
            <Text span inherit fw={600}>
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
          <IconMail stroke={1.5} style={{ width: rem(30), height: rem(30) }} />
        </ActionIcon>
      </Tooltip>
    </Affix>
  )
}

export default ContactButton

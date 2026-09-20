import { Affix, Button, Text, Tooltip, rem } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'

import { CONTACT_EMAIL } from '#src/constants'

import classes from './contact-button.module.css'

function ContactButton() {
  return (
    // Clear of the footer band, so a wrapped footer cannot reach the pill.
    <Affix
      position={{
        bottom: 'calc(var(--app-shell-footer-height) + 16px)',
        right: 16,
      }}
    >
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
        <Button
          component="a"
          href={`mailto:${CONTACT_EMAIL}`}
          radius="xl"
          classNames={{ section: classes.section }}
          leftSection={
            <IconMail
              stroke={1.5}
              style={{ width: rem(18), height: rem(18) }}
              aria-hidden
            />
          }
        >
          Send feedback
        </Button>
      </Tooltip>
    </Affix>
  )
}

export default ContactButton

import { Link, useParams } from 'react-router'
import { Anchor, Box, Stack, Text, rem } from '@mantine/core'
import { IconTable } from '@tabler/icons-react'

import UnableToDisplayAlert from '#src/components/feedback/unable-to-display-alert'

import classes from './not-found-view.module.css'

function NotFoundView() {
  const { '*': page } = useParams()

  return (
    <Box px={20} py={14} flex={1} mih={0}>
      <UnableToDisplayAlert title="Unable to display the page">
        <Stack gap={4} align="flex-start">
          <Text size="sm">{`The proposal has no page "${page}".`}</Text>
          <Anchor
            component={Link}
            to="../table"
            size="sm"
            underline="never"
            className={classes.link}
          >
            Open
            <IconTable
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
              aria-hidden
            />
            All runs
          </Anchor>
        </Stack>
      </UnableToDisplayAlert>
    </Box>
  )
}

export default NotFoundView

import { Link, useParams } from 'react-router'
import { Anchor, Box, Stack, Text } from '@mantine/core'

import UnableToDisplayAlert from '#src/components/feedback/unable-to-display-alert'

function NotFoundView() {
  const { '*': page } = useParams()

  return (
    <Box px={20} py={14} flex={1} mih={0}>
      <UnableToDisplayAlert title="Unable to display the page">
        <Stack gap={4} align="flex-start">
          <Text size="sm">{`The proposal has no page "${page}".`}</Text>
          <Anchor component={Link} to="../table" size="sm">
            Open All runs
          </Anchor>
        </Stack>
      </UnableToDisplayAlert>
    </Box>
  )
}

export default NotFoundView

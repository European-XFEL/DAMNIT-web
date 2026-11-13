import { Link, useParams } from 'react-router'
import { Anchor, Box, Text } from '@mantine/core'

import UnableToDisplayAlert from '#src/components/feedback/unable-to-display-alert'

function NotFoundView() {
  const { '*': page } = useParams()

  return (
    <Box px={20} py={14} flex={1} mih={0}>
      <UnableToDisplayAlert title="Unable to display the page">
        <Text size="sm">
          {`The proposal has no page "${page}". `}
          <Anchor component={Link} to="../table" inherit>
            Open All runs
          </Anchor>
        </Text>
      </UnableToDisplayAlert>
    </Box>
  )
}

export default NotFoundView

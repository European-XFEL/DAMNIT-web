import { Link } from 'react-router'
import { Anchor, Stack, Text } from '@mantine/core'

function NotFoundView() {
  return (
    <Stack w="100%" h="100%" align="center" justify="center" gap={4}>
      <Text size="sm">This link points at no view.</Text>
      <Anchor component={Link} to="../table" size="sm">
        Open All runs
      </Anchor>
    </Stack>
  )
}

export default NotFoundView

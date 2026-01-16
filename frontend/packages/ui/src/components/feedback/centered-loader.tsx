import { Loader, Stack } from '@mantine/core'

function CenteredLoader() {
  return (
    <Stack w="100%" h="100%" align="center" justify="center">
      <Loader color="indigo" />
    </Stack>
  )
}

export default CenteredLoader

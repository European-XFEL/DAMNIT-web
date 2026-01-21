import { Loader, Stack, type LoaderProps } from '@mantine/core'

type CenteredLoaderProps = {
  size?: LoaderProps['size']
}

function CenteredLoader({ size }: CenteredLoaderProps) {
  return (
    <Stack w="100%" h="100%" align="center" justify="center">
      <Loader color="indigo" size={size} />
    </Stack>
  )
}

export default CenteredLoader

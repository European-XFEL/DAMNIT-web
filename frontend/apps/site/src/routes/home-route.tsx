import {
  DEFAULT_THEME,
  Flex,
  Box,
  Stack,
  Title,
  Group,
  Button,
} from '@mantine/core'

import { SiteFooter, formatUrl } from '@damnit-frontend/ui'

const APP_URL = formatUrl(
  import.meta.env.VITE_APP_URL || 'https://damnit.xfel.eu/app'
)
const DEMO_URL = formatUrl(
  import.meta.env.VITE_DEMO_URL || 'https://damnit.xfel.eu/demo'
)

function HomeRoute() {
  return (
    <Flex direction="column" mih="100vh">
      <Box style={{ flex: 1 }} />

      <Stack align="right" gap="md" maw={640} mx={100}>
        {/* Arial is not optically small, so the logo takes Mantine's own h1
            size, without the theme's 6%. */}
        <Title
          order={1}
          variant="logo"
          fz={DEFAULT_THEME.headings.sizes.h1.fontSize}
        >
          DAMNIT!
        </Title>

        <Title order={2} size="h3" fw={400}>
          Automated experiment overview at European XFEL
        </Title>

        <Group mt="xl" gap="md" wrap="wrap">
          <Button
            size="md"
            color="indigo"
            variant="filled"
            component="a"
            href={APP_URL}
          >
            View proposals
          </Button>
          <Button
            size="md"
            color="indigo"
            variant="outline"
            component="a"
            href={DEMO_URL}
          >
            Browse examples
          </Button>
        </Group>
      </Stack>

      <Box
        style={{
          flex: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <SiteFooter />
      </Box>
    </Flex>
  )
}

export default HomeRoute

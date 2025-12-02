import { useHref } from 'react-router'

import { Flex, Box, Stack, Title, Text, Group, Button } from '@mantine/core'
import { SiteFooter, formatUrl } from '@damnit-frontend/ui'

const APP_URL = formatUrl(
  import.meta.env.VITE_APP_URL || 'https://damnit.xfel.eu/app'
)
const DEMO_URL = formatUrl(
  import.meta.env.VITE_DEMO_URL || 'https://damnit.xfel.eu/demo'
)

function HeroPage() {
  const aboutUrl = useHref('about')

  return (
    <Flex direction="column" mih="100vh" px="md">
      <Box style={{ flex: 1 }} />

      <Stack align="right" gap="md" maw={640} mx={100}>
        <Title order={1} fw={700}>
          DAMNIT!
        </Title>

        <Title order={3} fw={400}>
          Automated experiment overview at European XFEL
        </Title>

        <Text c="dimmed" size="md">
          The name &apos;DAMNIT&apos; is definitely-not-a-backronym for{' '}
          <Text span fs="italic" inherit>
            Data And Metadata iNspection Interactive Thing
          </Text>
          . It provides users with a way to automatically create an overview of
          their experiment, hopefully replacing the manually created
          spreadsheets that are often used.
        </Text>

        <Group mt="xl" gap="md" wrap="wrap">
          <Button
            size="md"
            color="indigo"
            variant="filled"
            component="a"
            href={APP_URL}
          >
            View your proposals
          </Button>
          <Button
            size="md"
            color="indigo"
            variant="outline"
            component="a"
            href={DEMO_URL}
          >
            Browse sample experiments
          </Button>
        </Group>
      </Stack>

      <Box
        style={{
          flex: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'end',
          marginBottom: 8,
          marginRight: 8,
        }}
      >
        <SiteFooter aboutUrl={aboutUrl} />
      </Box>
    </Flex>
  )
}

export default HeroPage

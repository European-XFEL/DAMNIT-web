import { useLoaderData } from 'react-router'
import { Container, Divider, Stack, Text, Title } from '@mantine/core'

import { Header, HomePage as DamnitHomePage, Logo } from '@damnit-frontend/ui'

import { Examples } from '../../features/examples'

function Main() {
  const examples = useLoaderData()

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Stack gap="sm">
          <Title order={1}>Example Gallery</Title>

          <Stack gap={4}>
            <Text size="lg">
              Explore real-world applications of DAMNIT using data from previous
              experimental campaigns.
            </Text>

            <Text c="gray.7" size="sm" fs="italic">
              These examples demonstrate how DAMNIT automates the extraction of
              metadata and analysis results, providing a live, searchable
              overview of your experiment's progress.
            </Text>
          </Stack>
        </Stack>

        <Divider />

        <Examples items={examples} />
      </Stack>
    </Container>
  )
}

function RootRoute() {
  return (
    <DamnitHomePage
      header={
        <Header px={16}>
          <Logo linkTo="/" />
        </Header>
      }
      main={<Main />}
    />
  )
}

export default RootRoute

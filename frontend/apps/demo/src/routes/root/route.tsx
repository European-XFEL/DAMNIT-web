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
          <Title order={1}>
            Explore experiments with an interactive overview
          </Title>

          <Stack gap={4}>
            <Text c="dimmed" size="lg" fw={400}>
              Explore real-world applications of DAMNIT using data from previous experimental campaigns.
            </Text>

            <Text c="dimmed" size="sm" fs="italic" style={{ opacity: 0.8 }}>
              These examples demonstrate how DAMNIT automates the 
              extraction of metadata and analysis results, providing a live, 
              searchable overview of your experiment's progress.
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
        <Header px={20}>
          <Logo linkTo="/" />
        </Header>
      }
      main={<Main />}
    />
  )
}

export default RootRoute

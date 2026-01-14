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
              The examples below use actual data from real experiments.
            </Text>

            <Text c="dimmed" size="sm" fs="italic" style={{ opacity: 0.8 }}>
              Just a heads-up: the data is preloaded in the demo, there are no
              live updates.
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

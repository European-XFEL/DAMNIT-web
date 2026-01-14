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

          <Text c="dimmed" size="md">
            The examples below use actual data from real experiments.
          </Text>
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

import { Burger, Flex, Group, Stack, Text, Title, rem } from '@mantine/core'

import {
  Header,
  InstrumentBadge,
  Logo,
  openNav,
  closeNav,
  useAppDispatch,
  useAppSelector,
} from '@damnit-frontend/ui'

function DashboardHeader() {
  const dispatch = useAppDispatch()
  const nav = useAppSelector((state) => state.dashboard.nav)

  return (
    <Header px={8}>
      <Group gap="sm" align="center">
        <Burger
          opened={nav.isOpened}
          onClick={() => dispatch(nav.isOpened ? closeNav() : openNav())}
          visibleFrom="sm"
          size="sm"
        />
        <Logo linkTo="/" />
        <Stack gap={0}>
          <Flex gap={10} align="center">
            <InstrumentBadge instrument="MID" />
            <Title order={5}>
              X-ray Photon Correlation Spectroscopy (XPCS)
            </Title>
          </Flex>
          <Text size={rem(10)} c="dimmed" fs="italic">
            MHz XPCS enabled studies of dynamics, interactions and aggregation
            phenomena in protein solutions
          </Text>
        </Stack>
      </Group>
    </Header>
  )
}

export default DashboardHeader

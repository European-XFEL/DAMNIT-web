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

export type DashboardHeaderProps = {
  title: string
  subtitle: string
  instrument: string
}

function DashboardHeader(props: DashboardHeaderProps) {
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
            <InstrumentBadge instrument={props.instrument} />
            <Title order={5}>{props.title}</Title>
          </Flex>
          <Text size={rem(10)} c="dimmed" fs="italic">
            {props.subtitle}
          </Text>
        </Stack>
      </Group>
    </Header>
  )
}

export default DashboardHeader

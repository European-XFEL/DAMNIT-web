import { Burger, Flex, Group, Stack, Text, Title, rem } from '@mantine/core'

import { openNav, closeNav } from './dashboard.slice'

import { Header, Logo } from '../../components/headers'
import { InstrumentBadge } from '../../components/badges'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { type ProposalInfo } from '../../types'

type DashboardHeaderProps = {
  proposal: ProposalInfo
}

function DashboardHeader({ proposal }: DashboardHeaderProps) {
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
        <Logo linkTo="/home" />
        <Stack gap={0}>
          <Flex gap={10} align="center">
            <InstrumentBadge instrument={proposal.instrument} />
            <Title order={5}>
              {`p${proposal.number} - ${proposal.principal_investigator}`}
            </Title>
          </Flex>
          <Text size={rem(10)} c="dimmed" fs="italic">
            {proposal.title}
          </Text>
        </Stack>
      </Group>
    </Header>
  )
}

export default DashboardHeader

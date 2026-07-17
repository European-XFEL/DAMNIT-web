import { Burger, Flex, Group, Stack, Text, Title, rem } from '@mantine/core'
import { useNavigate } from 'react-router'

import Header from '#src/components/headers/header'
import Logo from '#src/components/headers/logo'
import { UserMenu } from '#src/components/headers/user-menu'
import InstrumentBadge from '#src/components/badges/instrument-badge'
import { selectUserFullName } from '#src/features/auth/auth.slice'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { type ProposalInfo } from '#src/types'

import { openNav, closeNav } from './dashboard.slice'

type DashboardHeaderProps = {
  proposal: ProposalInfo
}

function DashboardHeader({ proposal }: DashboardHeaderProps) {
  const dispatch = useAppDispatch()
  const nav = useAppSelector((state) => state.dashboard.nav)
  const userName = useAppSelector(selectUserFullName)
  const navigate = useNavigate()

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
      <UserMenu userName={userName} onLogout={() => navigate('/logout')} />
    </Header>
  )
}

export default DashboardHeader

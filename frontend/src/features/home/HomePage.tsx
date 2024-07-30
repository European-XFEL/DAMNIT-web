import React from "react"
import { useSelector } from "react-redux"
import { AppShell, Container, Group, Space } from "@mantine/core"

import { Header, Logo } from "../../components/header"
import { selectAvailableProposals } from "../auth/authSlice"
import { ProposalsList } from "../proposals/"

const HomePage = () => {
  const proposals = useSelector(selectAvailableProposals)

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Header px={20}>
          <Logo />
        </Header>
      </AppShell.Header>

      <AppShell.Main>
        <Container>
          <ProposalsList proposals={proposals} />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

export default HomePage

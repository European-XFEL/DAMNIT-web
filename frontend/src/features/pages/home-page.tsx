import React from "react"
import { AppShell, Container } from "@mantine/core"

import { Header, Logo } from "../../components/headers"
import { ProposalsList } from "../proposals"

const HomePage = () => {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Header px={20}>
          <Logo />
        </Header>
      </AppShell.Header>

      <AppShell.Main>
        <Container>
          <ProposalsList />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

export default HomePage

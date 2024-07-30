import React from "react"
import { useSelector } from "react-redux"
import { Container, Space } from "@mantine/core"

import { Header, Logo } from "../../components/header"
import { selectAvailableProposals } from "../auth/authSlice"
import { ProposalsList } from "../proposals/"

const HomePage = () => {
  const proposals = useSelector(selectAvailableProposals)
  return (
    <>
      <Header standalone={true} size="lg">
        <Logo />
      </Header>
      <Space h="md" />
      <Container>
        <ProposalsList proposals={proposals} />
      </Container>
    </>
  )
}

export default HomePage

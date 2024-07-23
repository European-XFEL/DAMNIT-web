import React from "react"
import { Container, Space } from "@mantine/core"

import { Header, Logo } from "../../common/header/"
import { ProposalsList } from "../proposals/"

const HomePage = () => {
  return (
    <>
      <Header standalone={true} size="lg">
        <Logo />
      </Header>
      <Space h="md" />
      <Container>
        <ProposalsList />
      </Container>
    </>
  )
}

export default HomePage

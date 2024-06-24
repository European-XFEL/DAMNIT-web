import React from "react"
import { Container, Space, Text, rem } from "@mantine/core"

import Header from "../../common/header/"
import { ProposalsList } from "../proposals/"

const HomePage = () => {
  return (
    <>
      <Header standalone={true} size="lg">
        <Text size={rem(28)} fw={700}>
          DAMNIT!
        </Text>
      </Header>
      <Space h="md" />
      <Container>
        <ProposalsList />
      </Container>
    </>
  )
}

export default HomePage

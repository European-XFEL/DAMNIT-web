import React from "react"
import { Container } from "@mantine/core"

import Header from "../../common/header/"
import { ProposalsList } from "../proposals/"

const HomePage = () => {
  return (
    <>
      <Header standalone={true} />
      <Container>
        <ProposalsList />
      </Container>
    </>
  )
}

export default HomePage

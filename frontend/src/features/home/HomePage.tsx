import React from "react"

import { Center, Container, TextInput } from "@mantine/core"

const HomePage = () => {
  return (
    <Container size="md">
      <Center style={{ height: "50vh" }}>
        <TextInput label="Proposal" placeholder="p1234" />
      </Center>
    </Container>
  )
}

export default HomePage

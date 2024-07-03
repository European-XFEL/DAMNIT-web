import React, { useEffect } from "react"
import { Container, Text, Title } from "@mantine/core"

import { useSession } from "../../hooks"

const LogoutPage = () => {
  const { session, isLoading, isError, invalidate } = useSession()

  useEffect(() => {
    invalidate()
  }, [])

  if (isLoading) {
    return <div />
  }

  return (
    <Container
      mt="xl"
      size="md"
      style={{
        display: "flex",
        justifyContent: "center",
      }}
    >
      {!session || isError ? (
        <div style={{ textAlign: "center" }}>
          <Title order={2}>You have been logged out.</Title>
          <Text size="md" style={{ marginBottom: "20px" }}>
            Thanks for using DAMNIT!
          </Text>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Title order={2}>
            Nope, you're still logged in, {session.user.name}...
          </Title>
          <Text size="md" style={{ marginBottom: "20px" }}>
            Go back.
          </Text>
        </div>
      )}
    </Container>
  )
}

export default LogoutPage

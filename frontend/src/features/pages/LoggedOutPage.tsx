import React from "react"
import { Button as MantineButton, Container, Text, Title } from "@mantine/core"

import { useSession } from "../../hooks"
import { history } from "../../routes"
import styles from "./LoggedOutPage.module.css"

const Button = (props) => {
  return (
    <MantineButton
      className={styles.control}
      size="lg"
      color="indigo"
      {...props}
    ></MantineButton>
  )
}

const LoggedOutPage = () => {
  const { session, isLoading, isError } = useSession()

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
          <div className={styles.controls}>
            <Button variant="filled" onClick={() => history.navigate("/login")}>
              Log back in
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Title order={2}>
            Nope, you're still logged in,{" "}
            <Text span c="indigo" inherit>
              {session.user.name}
            </Text>
            ...
          </Title>
          <div className={styles.controls}>
            <Button
              variant="filled"
              onClick={() => history.navigate("/logout")}
            >
              Logout
            </Button>
            <Button variant="outline" onClick={() => history.navigate(-1)}>
              Go back
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}

export default LoggedOutPage

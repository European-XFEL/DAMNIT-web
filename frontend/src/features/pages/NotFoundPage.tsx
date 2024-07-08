import React from "react"
import { Button as MantineButton, Container, Title } from "@mantine/core"

import { history } from "../../routes"
import styles from "./NotFoundPage.module.css"

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

const NotFoundPage = () => {
  return (
    <Container
      mt="xl"
      size="md"
      style={{
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Title order={2}>DAMNIT! Page not found.</Title>
        <div className={styles.controls}>
          <Button variant="filled" onClick={() => history.navigate("/home")}>
            Return home
          </Button>
        </div>
      </div>
    </Container>
  )
}

export default NotFoundPage

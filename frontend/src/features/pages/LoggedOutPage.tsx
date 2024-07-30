import React from "react"
import { Container, Text, Title } from "@mantine/core"

import { useUserInfo } from "../../hooks"
import { history } from "../../routes"
import { MainNavButton } from "../../components/buttons"

import styles from "./LoggedOutPage.module.css"

const LoggedOutPage = () => {
  const { userInfo, isLoading, isError } = useUserInfo()

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
      {!userInfo || isError ? (
        <div style={{ textAlign: "center" }}>
          <Title order={2}>You have been logged out.</Title>
          <Text size="md" style={{ marginBottom: "20px" }}>
            Thanks for using DAMNIT!
          </Text>
          <div className={styles.controls}>
            <MainNavButton
              variant="filled"
              onClick={() => history.navigate("/login")}
            >
              Log back in
            </MainNavButton>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Title order={2}>
            Nope, you're still logged in,{" "}
            <Text span c="indigo" inherit>
              {userInfo.name}
            </Text>
            ...
          </Title>
          <div className={styles.controls}>
            <MainNavButton
              variant="filled"
              onClick={() => history.navigate("/logout")}
            >
              Logout
            </MainNavButton>
            <MainNavButton
              variant="outline"
              onClick={() => history.navigate(-1)}
            >
              Go back
            </MainNavButton>
          </div>
        </div>
      )}
    </Container>
  )
}

export default LoggedOutPage

import React, { useEffect } from "react"
import { Container, Title } from "@mantine/core"
import { history } from "../../routes"

import classes from "./hero-page.module.css"

const HeroPage = () => {
  useEffect(() => {
    setTimeout(() => {
      history.navigate("/home")
    }, 2000)
  }, [])

  return (
    <Container className={classes.container} size="md">
      <Title className={classes.title}>DAMNIT!</Title>
    </Container>
  )
}

export default HeroPage

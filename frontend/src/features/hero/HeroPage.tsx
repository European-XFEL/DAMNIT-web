import React from "react"
import { Container, Title } from "@mantine/core"
import classes from "./HeroPage.module.css"

const HeroPage = () => {
  return (
    <div className={classes.wrapper}>
      <Container className={classes.container} size="md">
        <Title className={classes.title}>DAMNIT!</Title>
      </Container>
    </div>
  )
}

export default HeroPage

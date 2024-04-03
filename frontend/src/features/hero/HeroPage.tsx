import React, { useEffect } from "react"
import { Container, Title } from "@mantine/core"
import { history } from "../../routes"
import classes from "./HeroPage.module.css"

const HeroPage = () => {
  useEffect(() => {
    setTimeout(() => {
      history.navigate("/login")
    }, 2000)
  }, [])

  return (
    <div className={classes.wrapper}>
      <Container className={classes.container} size="md">
        <Title className={classes.title}>DAMNIT!</Title>
      </Container>
    </div>
  )
}

export default HeroPage

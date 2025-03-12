import React from "react"
import { Button, ButtonProps, ElementProps } from "@mantine/core"

import classes from "./main-nav-button.module.css"

interface MainNavButtonProps
  extends ButtonProps,
    ElementProps<"button", keyof ButtonProps> {}

const MainNavButton = (props: MainNavButtonProps) => {
  return (
    <Button className={classes.button} size="lg" color="indigo" {...props} />
  )
}

export default MainNavButton

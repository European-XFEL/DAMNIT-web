import React from "react"
import { Button } from "@mantine/core"

import styles from "./MainNavButton.module.css"

const MainNavButton = (props) => {
  return (
    <Button
      className={styles.button}
      size="lg"
      color="indigo"
      {...props}
    ></Button>
  )
}

export default MainNavButton

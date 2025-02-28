import React from "react"
import { Link } from "react-router-dom"
import { Title } from "@mantine/core"

import styles from "./Logo.module.css"

const Logo = () => {
  return (
    <Link to="/home" className={styles.link}>
      <Title order={1} style={{ fontFamily: "Arial" }}>
        DAMNIT!
      </Title>
    </Link>
  )
}

export default Logo

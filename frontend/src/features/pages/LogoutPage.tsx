import React, { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Container, Text, Title } from "@mantine/core"

import { reset as resetAuth } from "../auth/authSlice"
import { resetTable } from "../table"
import { resetPlots } from "../plots"
import { resetExtractedData, resetTableData } from "../../shared"

const LogoutPage = () => {
  const dispatch = useDispatch()
  const { user: authUser } = useSelector((state) => state.auth)

  useEffect(() => {
    if (!authUser) {
      return
    }

    fetch("/oauth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-cache",
    }).then((response) => {
      if (response.ok) {
        console.log("RESETTING~")
        dispatch(resetTableData())
        dispatch(resetTable())
        dispatch(resetExtractedData())
        dispatch(resetPlots())
        dispatch(resetAuth())
      }
    })
  }, [authUser])

  return (
    <Container
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Title order={2}>You have been logged out</Title>
        <Text size="md" style={{ marginBottom: "20px" }}>
          Thanks for using DAMNIT!
        </Text>
      </div>
    </Container>
  )
}

export default LogoutPage

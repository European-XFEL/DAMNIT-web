import React from "react"
import { useEffect, useState, useRef } from "react"
import { Box, Paper } from "@mantine/core"
import {
  useCheckFileLastModifiedQuery,
  useGetFileContentQuery,
} from "../editor/editor.api"
import { useAppSelector } from "../../redux"
import Editor from "./editor"

const EditorTab: React.FC = () => {
  const { proposal } = useAppSelector((state: any) => state.metadata)

  const proposalNum = proposal.value
  const [dateHighlight, setDateHighlight] = useState(false)
  const lastValidLastUpdate = useRef<number | undefined>(undefined)

  const { data, error, refetch } = useGetFileContentQuery({
    proposalNum,
  })

  const { data: lastModifiedData } = useCheckFileLastModifiedQuery(
    {
      proposalNum,
    },
    {
      pollingInterval: 5000,
    },
  )

  const date = lastModifiedData?.lastModified
    ? new Date(lastModifiedData.lastModified * 1000).toLocaleString()
    : "unknown"

  useEffect(() => {
    if (
      lastModifiedData?.lastModified !== lastValidLastUpdate.current
    ) {
      refetch()
      if (lastValidLastUpdate.current) {
        setDateHighlight(true)
        setTimeout(() => {
          setDateHighlight(false)
        }, 2000)
      }
    }
    lastValidLastUpdate.current = data?.lastModified
  }, [lastModifiedData, refetch])

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "10vh",
        backgroundColor: "#F4F6F8",
      }}
    >
      <Box
        style={{
          flex: 1,
          padding: "16px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Paper
          shadow="lg"
          radius="md"
          p="md"
          style={{
            width: "100%",
            height: "100%",
            border: "2px solid rgb(151, 173, 197)",
            borderRadius: "12px",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
            overflow: "hidden",
          }}
        >
          <Editor fileContent={data?.fileContent} error={error} />
        </Paper>
      </Box>
      <Box
        style={{
          padding: "8px 16px",
          backgroundColor: dateHighlight ? "#c4c97f" : "#E9ECEF",
          textAlign: "center",
          fontSize: "14px",
          color: dateHighlight ? "#212529" : "#6C757D",
          transition: "all 0.7s ease-in-out",
        }}
      >
        Last updated: {date}
      </Box>
    </Box>
  )
}

export default EditorTab

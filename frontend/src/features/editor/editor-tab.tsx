import React from "react"
import { Box, Paper } from "@mantine/core"
import { useAppSelector } from "../../redux"
import Editor from "./editor"

const EditorTab: React.FC = () => {
  const { lastModified } = useAppSelector((state) => state.editor)
  const date = lastModified ? new Date(lastModified * 1000).toLocaleString() : "unknown"

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
          <Editor />
        </Paper>
      </Box>
      <Box
        style={{
          padding: "8px 16px",
          backgroundColor: "#E9ECEF", 
          textAlign: "center",
          fontSize: "14px",
          color: "#6C757D", 
        }}
      >
        Last updated: {date}
      </Box>
    </Box>
  )
}

export default EditorTab
import React, { useEffect } from "react"
import { Editor as Monaco } from "@monaco-editor/react";
import { useAppSelector } from "../../redux";
import { useGetFileContentQuery } from "./editor.api"
import { Alert, Center, Paper } from "@mantine/core"

const Editor = () => {
  const { proposal } = useAppSelector((state) => state.metadata)

  const proposalNum = proposal.value
  //const proposalNum = "000"
  const filename = "context.py"
  let date = ""
  const { lastModified } = useAppSelector((state) => state.editor)

  const generalConfig = {
    heigh: "80vh",
    width: "80vw",
    fontSize: "15px",
  }

  const { data, error, refetch } = useGetFileContentQuery({ proposalNum, filename })
  useEffect(() => {
    if (lastModified) {
      refetch()
    }
  }, [lastModified, refetch])

  date = lastModified ? new Date(lastModified * 1000).toLocaleString() : ""

  if (error) {
    return (
      <Center h="calc(100vh - 250px)">
        <Paper w="100%" p="md">
          <Alert 
            title="Error loading file"
            color="red"
            variant="filled"
          >
            {isApiError(error) 
              ? error.data?.detail || 'Failed to load file content'
              : 'An unexpected error occurred while loading the context file'}
          </Alert>
        </Paper>
      </Center>
    )
  }

  return (
    <div>
      <Monaco
        width="100%"
        height="calc(100vh - 250px)"
        theme="vs-light" 
        options={{
          fontSize: 14, 
          minimap: { enabled: true }, 
          scrollBeyondLastLine: false, 
          wordWrap: "on", 
          smoothScrolling: true, 
          tabSize: 4, 
        }}
        defaultLanguage="python"
        value={data?.fileContent}
      />
    </div>
  )
}

const isApiError = (error: any): error is { data: { detail: string } } => {
  return error && typeof error === 'object' && 'data' in error
}

export default Editor

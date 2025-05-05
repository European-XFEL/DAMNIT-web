import React, { useEffect } from "react"
import { Editor as Monaco } from "@monaco-editor/react"
import { useAppSelector } from "../../redux"
import { useGetFileContentQuery } from "./editor.api"
import { Alert, Center, Paper } from "@mantine/core"

const Editor: React.FC = () => {
  const { proposal } = useAppSelector((state: any) => state.metadata)
  const { lastModified } = useAppSelector((state: any) => state.editor)

  const proposalNum = proposal.value
  const filename = "context.py"

  const { data, error, refetch } = useGetFileContentQuery({
    proposalNum,
    filename,
  })
  useEffect(() => {
    if (lastModified) {
      refetch()
    }
  }, [lastModified, refetch])

  if (error) {
    return (
      <Center h="calc(100vh - 250px)">
        <Paper w="100%" p="md">
          <Alert title="Error loading file" color="red" variant="filled">
            {isApiError(error)
              ? error.data?.detail || "Failed to load file content"
              : "An unexpected error occurred while loading the context file"}
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
          disableLayerHinting: true,
          readOnly: true,
        }}
        defaultLanguage="python"
        value={data?.fileContent}
      />
    </div>
  )
}

const isApiError = (error: any): error is { data: { detail: string } } => {
  return error && typeof error === "object" && "data" in error
}

export default Editor

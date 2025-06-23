import React from "react"
import { Box } from "@mantine/core"
import { LastModifiedResponse } from "./contextfileeditor.api"

interface LastModifiedIndicatorProps {
  lastModifiedData?: LastModifiedResponse
  dateHighlight: boolean
}

const LastModifiedIndicator: React.FC<LastModifiedIndicatorProps> = ({
  lastModifiedData,
  dateHighlight,
}) => {
  const date = lastModifiedData?.lastModified
    ? new Date(lastModifiedData.lastModified * 1000).toLocaleString()
    : "unknown"

  return (
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
  )
}

export default LastModifiedIndicator
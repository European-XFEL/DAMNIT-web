import React from 'react'
import { useEffect, useState, useRef } from 'react'

import { Box, Paper } from '@mantine/core'
import type { SerializedError } from '@reduxjs/toolkit'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

import {
  useCheckFileLastModifiedQuery,
  useGetFileContentQuery,
} from './context-file-editor.api'
import { useAppSelector } from '../../redux/hooks'
import ContextFileEditor from './context-file-editor'
import LastModifiedIndicator from './last-modified-indicator'

const ContextFileEditorTab: React.FC = () => {
  const { proposal } = useAppSelector((state) => state.metadata)

  const proposalNum = proposal.value
  const [dateHighlight, setDateHighlight] = useState(false)

  const { data, error, refetch, isLoading } = useGetFileContentQuery({
    proposalNum,
  })

  const { data: lastModifiedData } = useCheckFileLastModifiedQuery(
    {
      proposalNum,
    },
    {
      pollingInterval: 5000,
    }
  )
  const lastValidLastUpdate = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (lastModifiedData?.lastModified !== lastValidLastUpdate.current) {
      refetch()
      if (lastValidLastUpdate.current) {
        setDateHighlight(true)
        setTimeout(() => {
          setDateHighlight(false)
        }, 2000)
      }
    }
    lastValidLastUpdate.current = data?.lastModified
  }, [lastModifiedData, refetch, data?.lastModified])

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '10vh',
        backgroundColor: '#F4F6F8',
      }}
    >
      <Box
        style={{
          flex: 1,
          padding: '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Paper
          shadow="lg"
          radius="md"
          p="md"
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid rgb(151, 173, 197)',
            borderRadius: '12px',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
          }}
        >
          {isLoading ? (
            <Box style={{ textAlign: 'center', padding: '20px' }}>
              Loading file content...
            </Box>
          ) : error ? (
            <Box
              style={{
                textAlign: 'center',
                color: 'red',
                padding: '20px',
              }}
            >
              {isApiError(error)
                ? (error.data as { detail?: string })?.detail ||
                  'Failed to load file content'
                : 'An unexpected error occurred while loading the context file'}
            </Box>
          ) : (
            <ContextFileEditor fileContent={data?.fileContent} />
          )}
        </Paper>
      </Box>
      <LastModifiedIndicator
        lastModifiedData={lastModifiedData}
        dateHighlight={dateHighlight}
      />
    </Box>
  )
}

const isApiError = (
  error: FetchBaseQueryError | SerializedError | undefined
): error is FetchBaseQueryError => {
  return (
    !!error && typeof error === 'object' && 'status' in error && 'data' in error
  )
}

export default ContextFileEditorTab

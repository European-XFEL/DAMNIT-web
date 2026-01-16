import { useEffect, useRef } from 'react'

import { Box, Stack } from '@mantine/core'
import type { SerializedError } from '@reduxjs/toolkit'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

import {
  useCheckFileLastModifiedQuery,
  useGetFileContentQuery,
} from './context-file.api'
import { CenteredLoader } from '../../components/feedback'
import {
  ConnectionStatus,
  LabelStatus,
  StatusBar,
} from '../../components/statuses/'
import { useAppSelector } from '../../redux/hooks'
import ContextFileEditor from './context-file-editor'

function formatRelativeTime(date: Date | number | undefined) {
  if (date == null) {
    return 'Unknown'
  }

  const now = Date.now()
  const then = typeof date === 'number' ? date * 1000 : date.getTime()
  const diff = Math.max(0, now - then) // past only

  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export type ContextFileProps = {
  subscribe?: boolean
  readOnly?: boolean
}

const ContextFile = ({
  subscribe = true,
  readOnly = true,
}: ContextFileProps) => {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  const { data, error, refetch, isLoading } = useGetFileContentQuery({
    proposalNum: proposal,
  })

  const { data: lastModifiedData } = useCheckFileLastModifiedQuery(
    {
      proposalNum: proposal,
    },
    {
      pollingInterval: subscribe ? 5000 : undefined,
    }
  )
  const lastValidLastUpdate = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!subscribe) {
      return
    }

    if (lastModifiedData?.lastModified !== lastValidLastUpdate.current) {
      refetch()
    }
    lastValidLastUpdate.current = data?.lastModified
  }, [lastModifiedData, data?.lastModified, refetch, subscribe])

  return (
    <Stack align="stretch" h="100%">
      {isLoading ? (
        <CenteredLoader />
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
        <ContextFileEditor content={data?.fileContent} />
      )}
      <StatusBar
        leftSection={
          <>{readOnly && <LabelStatus label="🔒 Read-only"></LabelStatus>}</>
        }
        rightSection={
          subscribe ? (
            <WatchSection
              connected={true}
              lastUpdated={formatRelativeTime(data?.lastModified)}
            />
          ) : (
            <DemoSection />
          )
        }
      />
    </Stack>
  )
}

function DemoSection() {
  return (
    <>
      <LabelStatus label="Demo" value="No updates" />
      <ConnectionStatus disabled />
    </>
  )
}

type WatchSection = {
  connected: boolean
  lastUpdated: string
}

function WatchSection({ connected, lastUpdated }: WatchSection) {
  return (
    <>
      <LabelStatus label="Last updated:" value={lastUpdated} />
      <ConnectionStatus connected={connected} />
    </>
  )
}

const isApiError = (
  error: FetchBaseQueryError | SerializedError | undefined
): error is FetchBaseQueryError => {
  return (
    !!error && typeof error === 'object' && 'status' in error && 'data' in error
  )
}

export default ContextFile

import { useEffect, useRef } from 'react'
import { Alert, Box, Code, rem, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { SerializedError } from '@reduxjs/toolkit'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

import CenteredLoader from '#src/components/feedback/centered-loader'
import StatusItem from '#src/components/statuses/status-item'
import { ViewStatus } from '#src/components/statuses/view-status'
import { useAppSelector } from '#src/app/store/hooks'
import { formatClockTime, formatLongDate, formatTimeAgo } from '#src/utils/time'
import { useMinuteClock } from '#src/utils/use-minute-clock'

import {
  useCheckFileLastModifiedQuery,
  useGetFileContentQuery,
} from './context-file.api'
import ContextFileEditor from './context-file-editor'

export type ContextFileProps = {
  subscribe?: boolean
}

function ContextFile({ subscribe = true }: ContextFileProps) {
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
    // Monaco fills its parent, so without the min-height it grows past the
    // view and under the status bar.
    <Box flex={1} mih={0}>
      {isLoading ? (
        <CenteredLoader />
      ) : error ? (
        <Alert
          m={20}
          variant="light"
          color="red"
          title="Unable to load the context file"
          icon={
            <IconAlertTriangle
              style={{ width: rem(20), height: rem(20) }}
              stroke={1.5}
            />
          }
        >
          <Text size="sm">{describeLoadError(error)}</Text>
        </Alert>
      ) : (
        <ContextFileEditor content={data?.fileContent} />
      )}
      {data?.lastModified != null && (
        <ViewStatus>
          <ModifiedItem time={data.lastModified * 1000} />
        </ViewStatus>
      )}
    </Box>
  )
}

type ModifiedItemProps = {
  time: number
}

function ModifiedItem({ time }: ModifiedItemProps) {
  const now = useMinuteClock()

  return (
    <StatusItem
      label="Modified"
      value={formatTimeAgo(time, { now })}
      tooltip={
        <>
          Modified{' '}
          <Text span inherit fw={600}>
            {formatLongDate(time)}
          </Text>{' '}
          at{' '}
          <Text span inherit fw={600}>
            {formatClockTime(time)}
          </Text>
        </>
      }
    />
  )
}

const isApiError = (
  error: FetchBaseQueryError | SerializedError | undefined
): error is FetchBaseQueryError => {
  return (
    !!error && typeof error === 'object' && 'status' in error && 'data' in error
  )
}

function describeLoadError(error: FetchBaseQueryError | SerializedError) {
  if (!isApiError(error)) {
    return 'Check your connection, then reload the page.'
  }

  const detail = (error.data as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string' && detail !== '') {
    return detail
  }

  return (
    <>
      {'The server could not read '}
      <Code>context.py</Code>. Reload the page to try again.
    </>
  )
}

export default ContextFile

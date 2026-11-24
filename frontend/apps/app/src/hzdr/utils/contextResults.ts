import type { HZDRContextResults } from '../types'

import { requireJson } from './api'

const STREAM_TYPE = 'application/x-ndjson'

type ContextMessage = Partial<HZDRContextResults> & {
  complete?: boolean
  error?: string
}

export async function fetchContextResults(
  sourceKey: string,
  signal: AbortSignal,
  update: (results: HZDRContextResults) => void
) {
  const response = await fetch(
    `/contextfile/campaign/${sourceKey}/me/results`,
    {
      headers: { Accept: STREAM_TYPE },
      signal,
    }
  )
  if (
    !response.ok ||
    !response.headers?.get('content-type')?.includes(STREAM_TYPE) ||
    !response.body
  ) {
    update(await requireJson<HZDRContextResults>(response))
    return
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffered = ''
  let results: HZDRContextResults = { columns: [], rows: [] }
  let complete = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const lines = (buffered + value).split('\n')
      buffered = lines.pop() ?? ''
      const previous = results
      for (const line of lines) {
        if (!line) continue
        const message = JSON.parse(line) as ContextMessage
        if (message.error) throw new Error(message.error)
        if (message.columns) results = { columns: message.columns, rows: [] }
        if (message.rows) {
          results = { ...results, rows: [...results.rows, ...message.rows] }
        }
        complete ||= message.complete === true
      }
      if (previous !== results) update(results)
    }
    if (!complete) throw new Error('Context results stopped before completion.')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import type { HZDRShot } from '../../types'
import { clearDatasetPreviewCache, useDatasetPreview } from '../columnPreview'

const shot = {
  source_key: 'radbio',
  shot_number: 3,
  shot_key: 'radbio:20260505:000003',
  fired_at: '2026-05-05T08:15:00Z',
  metadata: {},
} as unknown as HZDRShot
const preview = {
  name: 'cam/image',
  dtype: 'uint16',
  shape: [4, 4],
  preview: [[0]],
  preview_kind: 'image',
  summary: 1,
  summary_exact: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearDatasetPreviewCache()
})

describe('useDatasetPreview', () => {
  it('reads a dataset once, then answers from its cache', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(preview) })
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = renderHook(() =>
      useDatasetPreview('radbio', shot, 'cam/image')
    )
    expect(first.result.current.loading).toBe(true)
    await waitFor(() => expect(first.result.current.preview).toEqual(preview))
    first.unmount()

    // a card reopened, or the builder showing the same dataset
    const again = renderHook(() =>
      useDatasetPreview('radbio', shot, 'cam/image')
    )
    expect(again.result.current.loading).toBe(false)
    expect(again.result.current.preview).toEqual(preview)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure, and reads nothing without a dataset', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const failed = renderHook(() => useDatasetPreview('radbio', shot, 'x'))
    await waitFor(() =>
      expect(failed.result.current.error).toMatch(/Could not read/)
    )
    failed.unmount()
    renderHook(() => useDatasetPreview('radbio', shot, 'x'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const none = renderHook(() => useDatasetPreview('radbio', shot, undefined))
    expect(none.result.current.loading).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

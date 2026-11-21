import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'

import { VersionMismatch } from '../VersionMismatch'
import { commitsDiffer, resetAPIVersionForTests } from '../../utils/version'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetAPIVersionForTests()
})

function stubAPI(commit: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ version: '0.3.1', commit }),
      })
    )
  )
}

function renderBadge() {
  return render(
    <MantineProvider>
      <VersionMismatch />
    </MantineProvider>
  )
}

describe('commitsDiffer', () => {
  it('compares the shorter prefix and needs both commits', () => {
    expect(commitsDiffer('abc123', 'abc123def456')).toBe(false)
    expect(commitsDiffer('abc123', 'abd123def456')).toBe(true)
    expect(commitsDiffer('', 'abc')).toBe(false)
    expect(commitsDiffer('abc', null)).toBe(false)
  })
})

describe('VersionMismatch', () => {
  it('warns when the build and the API differ', async () => {
    vi.stubEnv('VITE_DAMNIT_COMMIT', 'aaaaaaaaaaaa')
    stubAPI('bbbbbbbbbbbb')
    renderBadge()
    const badge = await screen.findByTestId('version-mismatch')
    expect(badge.getAttribute('title')).toContain('bbbbbbbbbbbb')
  })

  it('says nothing when they agree or the build has no commit', async () => {
    vi.stubEnv('VITE_DAMNIT_COMMIT', 'aaaaaaaaaaaa')
    stubAPI('aaaaaaaaaaaa')
    renderBadge()
    await Promise.resolve()
    expect(screen.queryByTestId('version-mismatch')).toBeNull()
    cleanup()
    resetAPIVersionForTests()
    vi.stubEnv('VITE_DAMNIT_COMMIT', '')
    stubAPI('bbbbbbbbbbbb')
    renderBadge()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('version-mismatch')).toBeNull()
  })
})

import { describe, expect, test } from 'vitest'
import { renderHook } from 'vitest-browser-react'

import { useContextMenu } from '#src/features/table/use-context-menu'
import type { ContextMenuProps } from '#src/features/table/context-menu'

const openProps: ContextMenuProps = {
  localPosition: { x: 10, y: 20 },
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  isOpen: false,
  contents: [],
}

describe('useContextMenu', () => {
  test('starts closed', async () => {
    const { result } = await renderHook(() => useContextMenu())
    expect(result.current[0].isOpen).toBe(false)
  })

  test('updateProps opens the menu regardless of the passed isOpen', async () => {
    const { result, act } = await renderHook(() => useContextMenu())
    await act(() => {
      result.current[1](openProps)
    })
    expect(result.current[0].isOpen).toBe(true)
  })

  test('an outside click closes the menu again', async () => {
    const { result, act } = await renderHook(() => useContextMenu())
    await act(() => {
      result.current[1](openProps)
    })
    await act(() => {
      result.current[0].onOutsideClick?.()
    })
    expect(result.current[0].isOpen).toBe(false)
  })
})

import type { PropsWithChildren, RefObject } from 'react'
import { Provider } from 'react-redux'
import { renderHook } from 'vitest-browser-react'
import { describe, expect, test } from 'vitest'
import type { DataEditorRef } from '@glideapps/glide-data-grid'

import { resetProposal } from '#src/redux/actions'
import type { Rectangle, Scroll } from '#src/features/table/types'
import { useScrollToView } from '#src/features/table/use-scroll-to-view'
import { setupStore, type AppStore } from '#src/redux/store'

function makeWrapper(store: AppStore) {
  return function ReduxWrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>
  }
}

// A ref whose first getBounds sets the baseline and whose second reports a
// viewport shifted by `delta`, so the hook records `delta` as the saved scroll.
function refScrolledBy(delta: Scroll): RefObject<DataEditorRef> {
  let call = 0
  return {
    current: {
      getBounds: () =>
        call++ === 0 ? { x: 0, y: 0 } : { x: -delta.x, y: -delta.y },
    },
  } as unknown as RefObject<DataEditorRef>
}

const region = { x: 0, y: 0, width: 0, height: 0 } as Rectangle

describe('useScrollToView', () => {
  test('keeps the scroll position when the table unmounts within a proposal', async () => {
    const store = setupStore()
    const ref = refScrolledBy({ x: 0, y: 40 })
    const { result, act, unmount } = await renderHook(
      () => useScrollToView(ref),
      { wrapper: makeWrapper(store) }
    )

    // Scroll down: the first callback sets the baseline, the second records it.
    await act(() => {
      result.current.onVisibleRegionChanged(region)
      result.current.onVisibleRegionChanged(region)
    })

    // A tab switch unmounts the Table but leaves the proposal (isActive) alive.
    await unmount()

    expect(store.getState().table.view.scroll).toEqual({ x: 0, y: 40 })
  })

  test('drops the pending scroll save when the proposal is torn down', async () => {
    const store = setupStore()
    const ref = refScrolledBy({ x: 0, y: 40 })
    const { result, act, unmount } = await renderHook(
      () => useScrollToView(ref),
      { wrapper: makeWrapper(store) }
    )

    await act(() => {
      result.current.onVisibleRegionChanged(region)
      result.current.onVisibleRegionChanged(region)
    })

    // Leaving the dashboard resets the slice before the child flush runs.
    await act(() => {
      store.dispatch(resetProposal())
    })
    await unmount()

    expect(store.getState().table.view.scroll).toEqual({ x: 0, y: 0 })
  })
})

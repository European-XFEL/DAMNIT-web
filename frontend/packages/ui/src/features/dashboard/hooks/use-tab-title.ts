import { useLayoutEffect } from 'react'

// Names the browser tab, and hands the page's own title back when the
// dashboard goes.
export function useTabTitle(title: string) {
  useLayoutEffect(() => {
    const before = document.title
    document.title = title

    return () => {
      document.title = before
    }
  }, [title])
}

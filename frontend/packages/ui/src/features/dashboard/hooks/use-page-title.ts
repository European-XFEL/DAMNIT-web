import { useLayoutEffect } from 'react'

const TITLE_MARK = '● '

// Sets the page title, and puts back the one before when the dashboard
// goes.
export function usePageTitle(title: string, { marked = false } = {}) {
  const shown = marked ? `${TITLE_MARK}${title}` : title

  useLayoutEffect(() => {
    const before = document.title
    document.title = shown

    return () => {
      document.title = before
    }
  }, [shown])
}

import { useLayoutEffect } from 'react'

// Sets the page title, and puts back the one before when the dashboard
// goes.
export function usePageTitle(title: string) {
  useLayoutEffect(() => {
    const before = document.title
    document.title = title

    return () => {
      document.title = before
    }
  }, [title])
}

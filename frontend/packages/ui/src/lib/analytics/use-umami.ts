import { useEffect } from 'react'

import umamiRaw from './script.js?raw'

const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID
const hostUrl = import.meta.env.VITE_UMAMI_HOST_URL
const enabled =
  (import.meta.env.VITE_UMAMI_ENABLED ?? '').toLowerCase() === 'true'

function useUmami() {
  useEffect(() => {
    if (!enabled || !websiteId) {
      return
    }

    const head = document.querySelector('head')
    const script = document.createElement('script')

    script.defer = true
    script.setAttribute('data-website-id', websiteId as string)
    if (hostUrl) {
      script.setAttribute('data-host-url', hostUrl)
    }

    script.text = umamiRaw
    head?.appendChild(script)

    return () => {
      head?.removeChild(script)
    }
  }, [])
}

export default useUmami

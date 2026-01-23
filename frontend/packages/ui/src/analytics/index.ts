import umamiRaw from './umami.js?raw'

const enabled = import.meta.env.VITE_UMAMI_ENABLED === 'true'
const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID
const hostUrl = import.meta.env.VITE_UMAMI_SRC

if (enabled && websiteId) {
  const s = document.createElement('script')
  s.defer = true
  s.setAttribute('data-website-id', websiteId)
  if (hostUrl) s.setAttribute('data-host-url', hostUrl)
  s.text = umamiRaw
  document.head.appendChild(s)
}

export {}

import { useEffect, useState } from 'react'
import type { RuntimeConfig } from './types'

export function useRuntimeConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>()

  useEffect(() => {
    fetch('/config/runtime')
      .then((response) => response.json())
      .then(setRuntimeConfig)
  }, [])

  return runtimeConfig
}

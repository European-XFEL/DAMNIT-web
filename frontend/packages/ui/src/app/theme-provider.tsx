import { type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'

import { cssVariablesResolver, theme } from '#src/styles/theme'

type ThemeProviderProps = {
  children: ReactNode
}

// The resolver is a provider prop, not a theme key, so the two travel together.
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  )
}

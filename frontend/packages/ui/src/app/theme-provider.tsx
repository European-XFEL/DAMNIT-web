import { type ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'

import { theme } from '#src/styles/theme'

type ThemeProviderProps = {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>
}

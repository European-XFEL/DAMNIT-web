import { useMantineTheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

// Below `sm` the nav and the run panel cover the view instead of sitting beside
// it, and the crumb row runs out of width for the group it sits in.
export function useIsMobile() {
  const theme = useMantineTheme()
  // No initial value: `getInitialValueInEffect: false` reads the query on the
  // first render and Mantine ignores the argument.
  const fromSm = useMediaQuery(
    `(min-width: ${theme.breakpoints.sm})`,
    undefined,
    { getInitialValueInEffect: false }
  )

  return !fromSm
}

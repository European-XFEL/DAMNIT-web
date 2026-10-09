import type { ReactNode } from 'react'

import classes from './status-bar.module.css'
import { ViewStatusTarget } from './view-status'

type StatusBarProps = {
  children: ReactNode
}

// The app's own items on the left; the open view draws its own on the right.
function StatusBar({ children }: StatusBarProps) {
  return (
    <div className={classes.bar}>
      <div className={classes.side}>{children}</div>
      <ViewStatusTarget className={classes.side} />
    </div>
  )
}

export default StatusBar

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

const ViewStatusContext = createContext<{
  target: HTMLElement | null
  setTarget: (target: HTMLElement | null) => void
}>({
  target: null,
  setTarget: () => {},
})

type ViewStatusProviderProps = {
  children: ReactNode
}

// Shares the spot on the status bar's right side with the views beside it.
export function ViewStatusProvider({ children }: ViewStatusProviderProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const spot = useMemo(() => ({ target, setTarget }), [target])

  return (
    <ViewStatusContext.Provider value={spot}>
      {children}
    </ViewStatusContext.Provider>
  )
}

type ViewStatusTargetProps = {
  className?: string
}

export function ViewStatusTarget({ className }: ViewStatusTargetProps) {
  const { setTarget } = useContext(ViewStatusContext)

  return <div ref={setTarget} className={className} />
}

type ViewStatusProps = {
  children: ReactNode
}

// Draws the open view's own items into the status bar. They leave with the
// view, so switching views needs no clean-up.
export function ViewStatus({ children }: ViewStatusProps) {
  const { target } = useContext(ViewStatusContext)

  return target ? createPortal(children, target) : null
}

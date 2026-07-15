import { type TabItem } from '#src/types'

interface TabContent extends Omit<TabItem, 'title'> {
  title: string | React.ReactNode // override type
  element: React.ReactNode
  onClose?: () => void
}

export type TabContents = Record<string, TabContent>

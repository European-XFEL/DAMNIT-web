import { lazy, Suspense } from 'react'

import CenteredLoader from '#src/components/feedback/centered-loader'

const ContextFile = lazy(
  () => import('#src/features/context-file/context-file')
)

function ContextFileView() {
  return (
    <Suspense fallback={<CenteredLoader />}>
      <ContextFile />
    </Suspense>
  )
}

export default ContextFileView

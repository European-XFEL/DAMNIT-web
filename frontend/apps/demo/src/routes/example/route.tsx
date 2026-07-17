import { useEffect } from 'react'
import { useLoaderData } from 'react-router'

import {
  NotFoundPage,
  resetProposal,
  setMetadata,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'

import { Dashboard } from '../../features/dashboard'
import { type ExampleInfo } from '../../features/examples/examples'

type ExampleDashboardProps = { info?: ExampleInfo }

// ExampleRoute keys this on the example, so switching examples remounts the
// subtree instead of updating it in place. Unmount dispatches resetProposal;
// see its listener for why the Apollo evict is safe to run during the switch.
function ExampleDashboard({ info }: ExampleDashboardProps) {
  const proposal = useProposal({ subscribe: false })
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (info?.id) {
      dispatch(setMetadata({ proposal: { value: info.id } }))
    } else {
      dispatch(setMetadata({ proposal: { notFound: true } }))
    }

    return () => {
      dispatch(resetProposal())
    }
  }, [info?.id, dispatch])

  return proposal.notFound || !info ? (
    <NotFoundPage />
  ) : (
    <Dashboard
      headerProps={{
        title: info.title,
        subtitle: info.subtitle,
        instrument: info.instrument,
      }}
    />
  )
}

function ExampleRoute() {
  const { info } = useLoaderData()

  return <ExampleDashboard key={info?.id} info={info} />
}

export default ExampleRoute

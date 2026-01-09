import { useLoaderData } from 'react-router'

import { Header, HomePage as DamnitHomePage, Logo } from '@damnit-frontend/ui'
import { Examples } from '../../features/examples'

function RootRoute() {
  const examples = useLoaderData()

  return (
    <DamnitHomePage
      header={
        <Header px={20}>
          <Logo linkTo="/" />
        </Header>
      }
      main={<Examples items={examples} />}
    />
  )
}

export default RootRoute

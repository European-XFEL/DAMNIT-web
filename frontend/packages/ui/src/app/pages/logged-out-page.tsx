import { useLocation, useNavigate } from 'react-router'
import { Container, Text, Title } from '@mantine/core'

import useUserInfo from '#src/features/auth/use-user-info'
import MainNavButton from '#src/components/buttons/main-nav-button'

import classes from './logged-out-page.module.css'

const LoggedOutPage = () => {
  const { userInfo, isLoading, isError } = useUserInfo()
  const navigate = useNavigate()
  const location = useLocation()

  // A page opened first, from a bookmark or a new tab, has no in-app page
  // to go back to
  const goBack = () =>
    location.key === 'default' ? navigate('/home') : navigate(-1)

  if (isLoading) {
    return <div />
  }

  return (
    <Container
      mt="xl"
      size="md"
      style={{
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      {!userInfo || isError ? (
        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="h2">
            You have been logged out.
          </Title>
          <Text size="md" mb={20}>
            Thanks for using DAMNIT!
          </Text>
          <div className={classes.controls}>
            <MainNavButton variant="filled" onClick={() => navigate('/login')}>
              Log back in
            </MainNavButton>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="h2">
            {"Nope, you're still logged in, "}
            <Text span c="indigo" inherit>
              {userInfo.name}
            </Text>
            ...
          </Title>
          <div className={classes.controls}>
            <MainNavButton variant="filled" onClick={() => navigate('/logout')}>
              Logout
            </MainNavButton>
            <MainNavButton variant="outline" onClick={goBack}>
              Go back
            </MainNavButton>
          </div>
        </div>
      )}
    </Container>
  )
}

export default LoggedOutPage

import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Container, Title } from '@mantine/core'

import classes from './hero-page.module.css'

const HeroPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/home', { replace: true })
    }, 2000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <Container className={classes.container} size="md">
      <Title variant="logo" className={classes.title}>
        DAMNIT!
      </Title>
    </Container>
  )
}

export default HeroPage

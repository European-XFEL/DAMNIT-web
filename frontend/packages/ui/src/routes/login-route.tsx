import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Container,
  Group,
  LoadingOverlay,
  PasswordInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconLogin2 } from '@tabler/icons-react'
import { useLocation, useNavigate } from 'react-router'

import { authApi, login } from '../auth'
import { HTTP_URL } from '../constants'
import { useAppDispatch } from '../redux/hooks'

type RuntimeConfig = {
  auth_mode: string
  ldap_form_enabled: boolean
}

type RedirectState = {
  from?: {
    pathname?: string
    search?: string
  }
}

const LoginRoute = () => {
  const dispatch = useAppDispatch()
  const location = useLocation()
  const navigate = useNavigate()
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>()
  const [isConfigLoading, setIsConfigLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const redirectPath = useMemo(() => {
    const from = (location.state as RedirectState | null)?.from
    return `${from?.pathname ?? '/home'}${from?.search ?? ''}`
  }, [location.state])

  useEffect(() => {
    let cancelled = false

    fetch(`${HTTP_URL}config/runtime`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Runtime configuration is not available.')
        }
        return response.json() as Promise<RuntimeConfig>
      })
      .then((config) => {
        if (!cancelled) {
          setRuntimeConfig(config)
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch(login())
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConfigLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [dispatch])

  useEffect(() => {
    if (
      !isConfigLoading &&
      runtimeConfig &&
      (runtimeConfig.auth_mode !== 'ldap' || !runtimeConfig.ldap_form_enabled)
    ) {
      dispatch(login())
    }
  }, [dispatch, isConfigLoading, runtimeConfig])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setIsSubmitting(true)

    try {
      const response = await fetch(`${HTTP_URL}ldap/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail ?? 'LDAP login failed.')
      }

      dispatch(authApi.util.resetApiState())
      navigate(redirectPath, { replace: true })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'LDAP login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (
    isConfigLoading ||
    !runtimeConfig ||
    runtimeConfig.auth_mode !== 'ldap' ||
    !runtimeConfig.ldap_form_enabled
  ) {
    return <LoadingOverlay visible />
  }

  return (
    <Container size={420} py={80}>
      <Paper withBorder p="xl" radius="md" pos="relative">
        <LoadingOverlay visible={isSubmitting} />
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <Stack gap={4}>
              <Title order={2}>Sign in</Title>
              <Text c="dimmed" size="sm">
                Use your configured LDAP account to continue.
              </Text>
            </Stack>

            {error ? (
              <Alert color="red" icon={<IconAlertCircle size={18} />}>
                {error}
              </Alert>
            ) : null}

            <TextInput
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              autoComplete="username"
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete="current-password"
              required
            />
            <Group justify="flex-end">
              <Button
                type="submit"
                leftSection={<IconLogin2 size={18} />}
                disabled={!username || !password}
              >
                Sign in
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}

export default LoginRoute

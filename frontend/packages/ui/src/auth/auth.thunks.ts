import { HTTP_URL } from '../constants'
import { type AppThunk } from '../redux/thunks'

export const login = (): AppThunk => (_) => {
  window.location.href = `${HTTP_URL}oauth/login?redirect_uri=${HTTP_URL}home`
}

export const logout = (): AppThunk => (_) => {
  fetch(`${HTTP_URL}oauth/logout?redirect_uri=${HTTP_URL}logged-out`, {
    method: 'POST',
    credentials: 'include', // Include cookies in the request
    headers: { 'Content-Type': 'application/json' },
  })
    .then((response) => response.json())
    .then((data) => {
      // Both paths leave the SPA, so the browser drops the Redux store, the
      // Apollo cache and the RTK Query caches along with the page.
      window.location.assign(data?.logout_url || `${HTTP_URL}logged-out`)
    })
    .catch((error) => {
      console.error('Error logging out:', error)
    })
}

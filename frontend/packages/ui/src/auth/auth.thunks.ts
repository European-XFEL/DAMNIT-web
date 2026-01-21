import { authApi } from './auth.api'

import { HTTP_URL } from '../constants'
import { resetExtractedData } from '../data/extracted'
import { resetTable as resetTableData } from '../data/table'
import { resetTable as resetTableView } from '../features/table'
import { resetPlots } from '../features/plots'
import { type AppThunk } from '../redux/thunks'
import { history } from '../routes'

export const login = (): AppThunk => (_) => {
  window.location.href = `${HTTP_URL}oauth/login?redirect_uri=${HTTP_URL}home`
}

export const logout = (): AppThunk => (dispatch) => {
  fetch(`${HTTP_URL}oauth/logout?redirect_uri=${HTTP_URL}logged-out`, {
    method: 'POST',
    credentials: 'include', // Include cookies in the request
    headers: { 'Content-Type': 'application/json' },
  })
    .then((response) => response.json())
    .then((data) => {
      const logoutUrl = data?.logout_url
      if (logoutUrl) {
        // Navigate to end session endpoint
        window.location.assign(logoutUrl)
      } else {
        // Reset the application
        dispatch(resetTableData())
        dispatch(resetTableView())
        dispatch(resetExtractedData())
        dispatch(resetPlots())

        dispatch(authApi.util.resetApiState())

        history.navigate('/logged-out')
      }
    })
    .catch((error) => {
      console.error('Error logging out:', error)
    })
}

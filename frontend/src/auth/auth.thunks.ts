import { authApi } from './auth.api'

import { BASE_URL, CURRENT_HOST } from '../constants'
import { resetExtractedData } from '../data/extracted'
import { resetTable as resetTableData } from '../data/table'
import { resetTable as resetTableView } from '../features/table'
import { resetPlots } from '../features/plots'
import { AppThunk } from '../redux'
import { history } from '../routes'

export const login = (): AppThunk => (_) => {
  const basePath = `${CURRENT_HOST}${BASE_URL}`
  window.location.href = `${BASE_URL}oauth/login?redirect_uri=${basePath}home`
}

export const logout = (): AppThunk => (dispatch) => {
  const basePath = `${CURRENT_HOST}${BASE_URL}`

  fetch(`${BASE_URL}oauth/logout?redirect_uri=${basePath}logged-out`, {
    method: 'GET',
    credentials: 'include', // Include cookies in the request
  })
    .then((response) => {
      if (response.ok) {
        // Reset the application
        dispatch(resetTableData())
        dispatch(resetTableView())
        dispatch(resetExtractedData())
        dispatch(resetPlots())
      }

      // Reset the API state
      dispatch(authApi.util.resetApiState())

      // Handle the redirect
      if (response.redirected && response.url) {
        history.navigate('/logged-out')
      }
    })
    .catch((error) => {
      console.error('Error logging out:', error)
    })
}

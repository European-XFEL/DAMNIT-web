import { authApi } from "../api"
import { resetTable } from "../table"
import { resetPlots } from "../plots"
import { BASE_URL, CURRENT_HOST } from "../../constants"
import { resetExtractedData, resetTableData } from "../../redux"
import { history } from "../../routes"

export const login = () => (dispatch) => {
  const basePath = `${CURRENT_HOST}${BASE_URL}`
  window.location.href = `${BASE_URL}oauth/login?redirect_uri=${basePath}home`
}

export const logout = () => (dispatch) => {
  const basePath = `${CURRENT_HOST}${BASE_URL}`

  fetch(`${BASE_URL}oauth/logout?redirect_uri=${basePath}logged-out`, {
    method: "GET",
    credentials: "include", // Include cookies in the request
  })
    .then((response) => {
      if (response.ok) {
        // Reset the application
        dispatch(resetTableData())
        dispatch(resetTable())
        dispatch(resetExtractedData())
        dispatch(resetPlots())
      }

      // Reset the API state
      dispatch(authApi.util.resetApiState())

      // Handle the redirect
      if (response.redirected && response.url) {
        history.navigate("/logged-out")
      }
    })
    .catch((error) => {
      console.error("Error logging out:", error)
    })
}

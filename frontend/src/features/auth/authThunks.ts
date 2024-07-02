import Cookies from "js-cookie"
import { jwtDecode } from "jwt-decode"

import { reset, setUser } from "./authSlice"

export const decodeToken = (token) => {
  try {
    return jwtDecode(token)
  } catch (error) {
    console.error("Failed to decode JWT:", error)
    return null
  }
}

export const initializeAuth = () => (dispatch) => {
  const token = Cookies.get("DAMNIT_AUTH_USER")

  if (token) {
    const decoded = decodeToken(token)
    if (decoded) {
      const user = {
        name: decoded.name,
        given_name: decoded.given_name,
        preferred_username: decoded.username,
        nickname: decoded.nickname,
        email: decoded.email,

        // TODO: replace with actual content
        groups: ["exfel_da"],
        proposals: [5709, 2956],
      }

      dispatch(setUser(user))
    }
  }
}

export const login = () => (dispatch) => {
  window.location.href = "/oauth"
}

export const logout = () => (dispatch) => {
  // window.location.href = "/oauth/logout"
  // dispatch(reset())

  fetch("/oauth/logout", {
    method: "GET",
    credentials: "include", // Include cookies in the request
  })
    .then((response) => {
      if (response.ok) {
        dispatch(reset())
      }
    })
    .catch((error) => {
      console.error("Error logging out:", error)
    })
}

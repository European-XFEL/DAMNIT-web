import React, { useEffect } from "react"
import { connect } from "react-redux"
import { useMutation } from "@apollo/client"

import Dashboard from "../features/dashboard"
import Drawer from "../features/drawer"
import { getTable } from "../features/table"
import { INITIALIZE_MUTATION } from "../graphql/queries"
import { PROPOSAL_NUMBER } from "../constants"

const App = ({ dispatch, loading }) => {
  // Initialize GraphQL server connection and get initial data
  const [initialize, _] = useMutation(INITIALIZE_MUTATION, {
    onCompleted: (_) => {
      dispatch(getTable())
    },
  })
  useEffect(() => {
    initialize({
      variables: { proposal: String(PROPOSAL_NUMBER) },
    })
  }, [])

  return (
    <div>
      {loading ? null : (
        <>
          <Drawer />
          <Dashboard />
        </>
      )}
    </div>
  )
}

const mapStateToProps = ({ table }) => {
  return {
    loading: !table.data,
  }
}

export default connect(mapStateToProps)(App)

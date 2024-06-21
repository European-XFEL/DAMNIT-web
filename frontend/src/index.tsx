import React from "react"
import { createRoot } from "react-dom/client"
import { Provider as ReduxProvider } from "react-redux"
import { BrowserRouter } from "react-router-dom"
import { ApolloProvider } from "@apollo/client"

import { MantineProvider } from "@mantine/core"

import "@mantine/core/styles.layer.css"
import "mantine-contextmenu/styles.layer.css"
import "mantine-datatable/styles.layer.css"

import { client } from "./app/apollo"
import { setupStore } from "./app/store"
import App from "./app/App"

const container = document.getElementById("root")
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <ReduxProvider store={setupStore()}>
        <BrowserRouter>
          <MantineProvider>
            <App />
          </MantineProvider>
        </BrowserRouter>
      </ReduxProvider>
    </ApolloProvider>
  </React.StrictMode>,
)

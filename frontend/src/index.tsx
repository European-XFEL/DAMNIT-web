import React from "react"
import { createRoot } from "react-dom/client"
import { Provider as ReduxProvider } from "react-redux"
import { BrowserRouter } from "react-router-dom"
import { ApolloProvider } from "@apollo/client"

import { MantineProvider } from "@mantine/core"

import "@mantine/core/styles.layer.css"
import "mantine-contextmenu/styles.layer.css"
import "mantine-datatable/styles.layer.css"

import "@glideapps/glide-data-grid/dist/index.css"

import { client } from "./graphql/apollo"
import { BASE_URL } from "./constants"
import { setupStore } from "./redux"
import App from "./app/app"

const container = document.getElementById("root") as HTMLElement
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <ReduxProvider store={setupStore()}>
        <BrowserRouter basename={BASE_URL}>
          <MantineProvider>
            <App />
          </MantineProvider>
        </BrowserRouter>
      </ReduxProvider>
    </ApolloProvider>
  </React.StrictMode>,
)

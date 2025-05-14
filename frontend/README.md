# DAMNIT - Web client

This is a prototype web client for DAMNIT.

## Description

The application enables visualization and interaction with the DAMNIT table.

### Technologies

- React (web framework)
- Redux (global storage)
- Apollo Client (GraphQL client)
- Mantine UI (styled components)
- Glide Data Grid (table component)
- Plotly.js (plotting library)
- Vite (build tool)
- Vitest (testing)

## Installation

Clone the project and run the following:

```sh
npm install
```

## Usage

After the installation, start the project:

```sh
npm run dev
```

and navigate to `localhost:5173` on your favorite browser.

You might need to supply a couple of environment variables to connect to a
running web server. Add an `.env` file on the project root with the following:

```ini
# .env
VITE_API = "http://127.0.0.1:30200"
```

One can also run the tests with the following:

```sh
npm test
```

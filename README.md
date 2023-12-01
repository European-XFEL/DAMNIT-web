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
npm start
```

and navigate to `localhost:5173` on your favorite browser.

You might need to supply a couple of environment variables to connect to a
running web server. Add an `.env` file on the project root with the following:

```ini
# .env
VITE_BACKEND_API = "127.0.0.1:30200"
VITE_PROPOSAL_NUMBER = <PROPOSAL_NUMBER>
```

One can also run the tests with the following:

```sh
npm test
```

## To-dos

There's much work needed to be done! The following is on my top of my mind:

- Plot the values of a variable for all runs, which needs a query to get the values of a column in the run table.
- Plot the values of a variable for each run, which requires a query to fetch
  data from the saved H5 files.
- Support user-editable variables

## Caveats

While TypeScript (files) is used, the overall flavor is still in JavaScript. We plan to continue as such; refactoring and adding types could be done in the next iterations.

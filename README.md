# README

## Setup

```sh
poetry install
poetry shell
uvicorn cammille_api.main:app
```

If port `8000` is not free change the port with the `--port NNNN` flag on the uvicorn command.

Go to `localhost:8000/docs` (or whatever port) to see docs w/ interactive endpoints.

Click the endpoint to expand it, then "Try it out" to fill out the query parameters, and finally "Execute" to send the query.

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

Clone the project and run the following on the root folder:

```sh
pnpm install
```

## Usage

After the installation, start the app with a development server:

```sh
pnpm run dev:app
```

and navigate to `localhost:5173` on your favorite browser.

You might need to supply a couple of environment variables to connect to a
running web server. Add an `.env` file on `apps/app` with the following:

```ini
# .env
VITE_API = "http://127.0.0.1:30200"
```

## Deployment

Deployments are done on DMZ hosts, which server static files via nginx running in a docker container managed via compose.

The repository should be checked out under `/data/srv/damnit-web/{test,prod}`, the host is `exfldamnittest01.desy.de` for test and `exfldamnitprod01.desy.de` for prod.

Docker compose is used to manage the service, with files for the deployment `compose.{test,prod}.yml`. Select the file with the `-f` flag in docker compose:

```sh
# To bring up test w/ a build:
docker compose -f compose.test.yml up --build

# Same for prod:
docker compose -f compose.prod.yml up --build
```

The compose project will be named `damnit-web-{test,prod}`, which can then be used to manage the service:

```sh
# Then standard compose commands with the project, e.g.
docker compose -p damnit-web-test {ps,logs,up,down,etc...}
```

Don't forget to add some environment on the variables on the monorepo by creating an `.env` file on the root repo with the following:

```ini
# .env
SITE_PREVIEW_PORT=4174
APP_PREVIEW_PORT=4173
API_URL="http://127.0.0.1:30200"
```

### Certificates

Certificates are managed via `getssl` script as per DESY's documentation, see the [DESY CA Documentation](https://www-ca.desy.de/acme/index_ger.html) and [getssl documentation](https://github.com/srvrco/getssl) for details. Key parts of the configuration are:

```env
# ~/.getssl/damnit-test.xfel.eu/getssl.cfg
# Include current host name as SAN
SANS="exfldamnittest01.desy.de"

# Certs for test:
DOMAIN_CERT_LOCATION="/data/certs/damnit-test.xfel.eu.pem"
DOMAIN_KEY_LOCATION="/data/certs/damnit-test.xfel.eu.key"
CA_CERT_LOCATION="/data/certs/damnit-test.xfel.eu-chain.pem"

# Restart test project so it uses new certs:
RELOAD_CMD="docker compose -p dw-test restart frontend"
```

With a similar config for prod.

The following crontab entry is used to check/refresh the certificates, which runs once a week:

```crontab
0 0 * * 0 root /root/.getssl/bin/getssl -u -a -q | logger -e -s -t getssl
```

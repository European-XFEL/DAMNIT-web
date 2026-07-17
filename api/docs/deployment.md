# Deployment

Production runs on `max-exfl457` under the `xdamnprd` account, served by
Podman Compose from `~/srv/damnit-web/damnit-web-prod/api`. The
`compose.prod.yml` file builds the image from source and serves the API over
HTTPS on port 8443.

## Deploy a new version

SSH to the host, pull the latest code, and rebuild:

```sh
ssh xdamnprd@max-exfl457.desy.de
cd ~/srv/damnit-web/damnit-web-prod/api
git pull
podman compose -f compose.prod.yml up -d --build
```

`--build` rebuilds the image from the pulled code. Without it, the container
keeps running the old image.

## Quick restart

To restart the running service without pulling or rebuilding:

```sh
damnit-web-up
```

## Housekeeping

Past rebuilds leave old, untagged images behind. Clean them up every now and
then:

```sh
podman image prune -f
```

To rebuild from scratch and ignore the layer cache:

```sh
podman compose -f compose.prod.yml build --no-cache
podman compose -f compose.prod.yml up -d
```

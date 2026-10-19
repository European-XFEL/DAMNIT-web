# Deployment

The API runs under the `xdamnprd` account on two hosts. Each serves its own
checkout with Podman Compose, builds the image from source and serves the
API over HTTPS on port 8443.

| Environment | Host          | Checkout                           | Compose file           |
| ----------- | ------------- | ---------------------------------- | ---------------------- |
| Production  | `max-exfl457` | `~/srv/damnit-web/damnit-web-prod` | `api/compose.prod.yml` |
| Test        | `max-exfl458` | `~/srv/damnit-web/damnit-web-test` | `api/compose.test.yml` |

## Deploy a new version

SSH to the host, pull the latest code, and rebuild.

### Production

```sh
ssh xdamnprd@max-exfl457.desy.de
cd ~/srv/damnit-web/damnit-web-prod
git pull
podman compose \
  -f api/compose.prod.yml \
  --podman-build-args="--network=host" \
  up -d --build
```

### Test

```sh
ssh xdamnprd@max-exfl458.desy.de
cd ~/srv/damnit-web/damnit-web-test
git pull
podman compose \
  -f api/compose.test.yml \
  --podman-build-args="--network=host" \
  up -d --build
```

`--build` rebuilds the image from the pulled code. Without it, the container
keeps running the old image.

Podman's default network (pasta) fails on these hosts with
`Failed to open() /dev/net/tun: No such device`.
`--podman-build-args="--network=host"` makes the build use the host's
network instead; `network_mode: host` in the compose file does the same for
the running container.

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

To rebuild from scratch and ignore the layer cache, run your environment's
deploy command with `--no-cache` added to the build args:
`--podman-build-args="--network=host --no-cache"`.

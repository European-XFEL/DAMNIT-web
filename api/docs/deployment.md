# Deployment

Use the dev launcher for local development. It runs `uv run -m
damnit_api.main`, enables reload, and keeps the host on localhost by default:

```powershell
cd api
.\scripts\damnit-api-dev.ps1
```

For deployment, run `uvicorn` explicitly so host, port, workers, and process
manager behavior are visible:

```powershell
cd api
uv run uvicorn damnit_api.main:create_app --factory --host 0.0.0.0 --port 8000
```

On Windows hosts, the helper script wraps the same deployment-oriented command:

```powershell
cd api
.\scripts\damnit-api-deploy.ps1 -HostAddress 0.0.0.0 -Port 8000
```

Production deployments should set a non-default `DW_API_SESSION_SECRET`, keep
`DW_API_UVICORN__RELOAD=false`, configure either OAuth/OIDC or LDAP, and keep
context editing enabled only behind authenticated sessions.

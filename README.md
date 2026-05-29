# DAMNIT Web

Monorepo containing projects required to serve DAMNIT data over the web.

## HZDR Data Flow

The HZDR integration keeps DAMNIT-web as a reader. Producers send normalized
data packages through local emulator transports first, then the same package
contract can move to real ASAPO or Kafka services.

```mermaid
flowchart LR
    subgraph Producers
        W[PLANET Watchdog]
        L[LaserData]
        Q[MongoDB shotsheet]
    end

    subgraph Emulator[Local emulator]
        LB[ASAPO-style local broker]
        K[Kafka broker]
        P[Normalized event packages]
    end

    subgraph Staging[Live staging]
        J[events/*.jsonl]
        S[hzdr_sources.json]
    end

    subgraph Web[DAMNIT-web]
        A[API metadata provider]
        U[Source and shot UI]
        BT[HDF5 builder trigger]
        V[HDF5 previews]
    end

    H[combined experiment HDF5]

    W --> K
    L --> LB
    Q -. live metadata lookup .-> A
    LB --> P
    K --> P
    P --> J
    J --> S
    J --> BT
    S --> A
    A --> U
    U --> BT
    BT --> H
    H --> V
```

The important package join key is:

```text
experiment_id + shot_id
```

Each normalized package has the same core shape whether it came from the local
emulator or a real transport:

```mermaid
flowchart TB
    E[Normalized event package] --> I[experiment_id]
    E --> R[shot_id]
    E --> O[source]
    E --> K[kind]
    E --> T[timestamp]
    E --> X[transport]
    E --> P[payload_ref]
    E --> V[optional values]
    E --> N[optional metadata]
```

## Emulator To Real

The local emulator is deliberately shaped like the production path:

```mermaid
flowchart TD
    A[Local examples in asapo-for-hzdr-damnit/examples] --> B[hzdr-package-emulator.py]
    B --> C[events/watchdog.jsonl and events/laserdata.jsonl]
    B --> E[hzdr_sources.json]
    C --> H[HDF5 builder input]
    E --> F[DW_API_METADATA__PROVIDER=local]
    F --> G[DAMNIT-web live source view]
    G --> H
    H --> D[hdf5/experiment-id.h5]

    C -. same handoff later .-> R[real transport consumers]
    R -. append same package contract .-> C
```

Run the emulator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1 -InitConfig
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hzdr-launch.ps1
```

Edit `scripts/hzdr-launch.config.json` between those commands if your sibling
repositories are not under `C:/GitLab`.

It writes:

```text
.generated/hzdr-package-emulator/events/*.jsonl
.generated/hzdr-package-emulator/hdf5/experiment-id.h5
.generated/hzdr-package-emulator/hzdr_sources.json
```

Set `emulator.shotCount` and `emulator.shotIncrement` in
`scripts/hzdr-launch.config.json` to generate more shots. Inspect the generated
HDF5 with:

```powershell
cd api
uv run python scripts/inspect-hzdr-hdf5.py ..\.generated\hzdr-package-emulator\hdf5\exp-2026-05-draco.h5
```

## Repository Roles

```mermaid
flowchart LR
    A[asapo-for-hzdr-damnit] -->|local broker and normalized examples| D[DAMNIT-web-hzdr]
    K[kafka-broker-docker] -->|Kafka smoke transport| D
    L[labfrog] -->|MongoDB shotsheet data| D
    D -->|API, HZDR source UI, package emulator| U[developer or deployment]
```

## More Detail

- [FLOW.md](FLOW.md) explains the API config, HZDR source model, and frontend
  route behavior.
- [HZDR-INTEGRATION.md](HZDR-INTEGRATION.md) lists the local coordinator
  commands and sibling repositories.

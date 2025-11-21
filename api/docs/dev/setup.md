# Setup

## Installation

!!! todo

## Debugging

If using `VSCode`, the following `launch.json` file can be used to start the server with the built-in debugger:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python Debugger: Module",
            "type": "debugpy",
            "request": "launch",
            "module": "damnit_api.main"
        }
    ]
}
```

## Configuration

### Mocked Data

Mocked data sources are implemented in some of the modules.

#### Metadata - MyMdC and DAMNIT Data Paths

If the configuration for MyMdC's API is not provided then a mock API response file will be used. By default this is the file in `./tests/mock/_mymdc.json`, feel free to update this as required or change it in place.

Alternatively, `mock_responses_file` can be provided with a path to a different file (e.g. via `DW_API_MYMDC__MOCK_RESPONSES_FILE`).

!!! important

    For convenience, this file sets `def_proposal_path` for proposal `900000` to `/tmp/gpfs/exfel/exp/HSLAB/201730/p900000/raw"`. As this field is what is used to find the proposal directory that means you can place damnit data in `/tmp/gpfs/exfel/exp/HSLAB/201730/p900000/usr/Shared/amore` and API calls will read the contents of that directory.

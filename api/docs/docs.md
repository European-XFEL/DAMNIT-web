# Documentation

Documentation is generated using [Zensical](https://zensical.org/).

- [mkdocstrings](https://mkdocstrings.github.io/) (with the [Python handler](https://mkdocstrings.github.io/python/)) renders API documentation from source-code docstrings.
- `scripts/gen_api_docs.py` builds the **API Reference**
  - One page per module under `docs/reference/`
  - Nested navigation injected into `zensical.toml`
  - Replaces `mkdocs-api-autonav` plugin (currently not supported in Zensical)
  - Generated pages are git-ignored, so the script must be run before building (see [Setup](#setup))

## Tips

Write documentation as close to the code as possible. Only a few overarching/'meta' topics (this, setup, architecture, deployment, etc...) need to be written into the `./docs` directory directly.

Aim to:

- Use module-level docstrings.
- Use cross-references where applicable, e.g. [`damnit_api.main.create_app`][].
- Pull docstrings into a page with an inline `mkdocstrings` block, e.g.:

    ```markdown
    ::: damnit_api.main
        options:
          heading_level: 2
    ```

## Setup

Regenerate the API reference, then build or serve the site (all commands use the `docs` dependency group):

```sh
uv run --group docs python scripts/gen_api_docs.py  # write docs/reference/ + nav
uv run --group docs zensical build                  # build the static site into ./site
uv run --group docs zensical serve                  # live-reloading preview on :8000
```

Rerun `gen_api_docs.py` whenever the module layout changes.

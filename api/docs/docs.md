# Documentation

Documentation is generated using [Zensical](https://zensical.org/).

- [mkdocstrings](https://mkdocstrings.github.io/) (with the [Python handler](https://mkdocstrings.github.io/python/)) renders API documentation from source-code docstrings.

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

Build or serve the site (all commands use the `docs` dependency group):

```sh
uv run --group docs zensical build  # build the static site into ./site
uv run --group docs zensical serve  # live-reloading preview on :8000
```

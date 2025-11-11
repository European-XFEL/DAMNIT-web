# Documentation

Documentation is generated using [MkDocs](https://www.mkdocs.org/) with the following plugins/extensions:

- [MkDocs Material](https://github.com/squidfunk/mkdocs-material) - main theme.
- [MkDocs API Auto-Nav](https://github.com/tlambert03/mkdocs-api-autonav) - builds the [API Reference](/reference/damnit_api) page automatically from source code docstrings.

## Tips

As documentation is automatically generated from source code, you should write the docs as close to the code to the code as possible where relevant - only a few overarching/'meta' topics (this, setup, architecture, deployment, etc...) should have to be written into the `./docs` directory directly.

Aim to:

- Use module level docstrings
- Use references where applicable, e.g. [`damnit_api.main.create_app`][]

## Setup

## Configuration

```yaml
--8<-- "./mkdocs.yml"
```

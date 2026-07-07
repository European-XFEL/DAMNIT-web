# Documentation

DAMNIT-web HZDR documentation is generated using
[MkDocs](https://www.mkdocs.org/) with the following plugins/extensions:

- [MkDocs Material](https://github.com/squidfunk/mkdocs-material) - main theme.
- [MkDocs API Auto-Nav](https://github.com/tlambert03/mkdocs-api-autonav) - builds the [API Reference](/reference/damnit_api) page automatically from source code docstrings.

## Tips

As reference documentation is automatically generated from source code, write
API details close to the code where relevant. API route details belong in
`./docs/hzdr.md`; cross-repository workflow documentation belongs in the
repository-level `hzdr/docs/` directory.

Aim to:

- Use module level docstrings
- Use references where applicable, e.g. [`damnit_api.main.create_app`][]
- Keep HZDR behavior separate from EXFEL assumptions when documenting routes,
  launcher commands, metadata providers, or context files.

## Setup

## Configuration

```yaml
--8<-- "./mkdocs.yml"
```

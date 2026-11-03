# CI/CD

GitHub Actions run the API's checks and publish its documentation. The
workflows live in `.github/workflows/`.

## Testing

`test-api.yml` runs on pull requests and pushes to `main` that change files
under `api/`, `pyproject.toml`, or `uv.lock`.

It runs three checks with `uv` on Python 3.13:

- **Lint**: `ruff check`
- **Format**: `ruff format --check`
- **Tests**: `pytest`

## Documentation

`deploy-docs.yml` builds this site and publishes it to GitHub Pages.

- **Build**: `zensical build` renders the site from the Markdown pages and
  from source docstrings.
- **Publish**: the output is pushed to the `docs/api/` folder on the
  `gh-pages` branch, served at
  <https://european-xfel.github.io/DAMNIT-web/docs/api/>.

It runs on pushes to `main` that change the docs, the API source, or the
build dependencies (`api/pyproject.toml`, `uv.lock`), and can also be run by
hand from the Actions tab. Because the reference is built from docstrings, a
change under `api/src/**` rebuilds the docs too.

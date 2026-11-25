# DAMNIT Frontend - Site App

This site is a small React + Vite application with a focus on simple static pages (e.g., hero, about).
Keeping it separate from the main application allows it to be deployed independently, updated faster (e.g., for documentation), and hosted on external services such as GitHub Pages.

## Prerequisites

- Node.js (LTS)
- pnpm installed globally:
  ```bash
  npm install -g pnpm
  ```

## Environment Variables

Create an `.env` file in the project root and set:

```bash
VITE_APP_URL=https://damnit.xfel.eu/app
VITE_DEMO_URL=https://damnit.xfel.eu/demo
```

These are used to make the hero page links work correctly.

## Install Dependencies

```bash
pnpm install
```

## Run in Development

```bash
pnpm run dev
```

Then open the URL shown in the terminal (usually http://localhost:5173).

## Build for Production

```bash
pnpm run build
```

## Preview Production Build

```bash
pnpm run preview
```

## Tests

`tests/e2e/` holds the Playwright suite for the site's production build. From
the `frontend/` root:

```bash
pnpm playwright:install   # once: install the Chromium browser
pnpm e2e:site
```

It builds the site first, which takes about a minute, and then serves it with
`vite preview` on 6174 at `/`. Nothing is intercepted, so a change in the
shared `packages/ui` that breaks the site fails a check. The shared
drivers are described in `packages/testing/README.md`.

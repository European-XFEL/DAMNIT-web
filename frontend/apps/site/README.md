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

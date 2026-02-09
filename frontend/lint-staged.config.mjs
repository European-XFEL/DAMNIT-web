export default {
  '*.{js,jsx,ts,tsx}': [
    'pnpm exec eslint --fix --cache --cache-location node_modules/.cache/eslint/.eslintcache',
    'pnpm exec prettier --write',
  ],

  '*.{json,html,css,md}': ['pnpm exec prettier --write'],

  '**/*.{ts,tsx}': () => 'pnpm exec tsc -b --noEmit',
}

// Compare the app's vite proxy table with the frontend nginx template.
// check.sh runs it with the template and the values it renders it with.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const FRONTEND = resolve(import.meta.dirname, '..')
const APP = join(FRONTEND, 'apps/app')

const TEMPLATE = process.argv[2]
const TEMPLATE_NAME = basename(TEMPLATE)

const TEMPLATE_VARIABLES = Object.fromEntries(
  ['NGINX_API_URL', 'NGINX_APP_BASE_PATH', 'NGINX_DEMO_BASE_PATH'].map(
    (name) => {
      const value = process.env[name]
      if (!value) {
        throw new Error(`${name} is not set: run pnpm check:nginx`)
      }

      return [name, value]
    }
  )
)
const BASE = `${TEMPLATE_VARIABLES.NGINX_APP_BASE_PATH}/`

const WEBSOCKET_LINES = [
  /proxy_http_version\s+1\.1\s*;/,
  /proxy_set_header\s+Upgrade\s+\$http_upgrade\s*;/i,
  /proxy_set_header\s+Connection\s+"?upgrade"?\s*;/i,
]

type Location = {
  path: string
  exact: boolean
  proxyPass?: string
  redirect?: string
  websocketLines: number
}

type ViteProxy = {
  ws: boolean
  rewrite: (path: string) => string
}

async function readViteProxies() {
  const require = createRequire(join(APP, 'package.json'))
  const { loadConfigFromFile } = await import(
    pathToFileURL(require.resolve('vite')).href
  )

  Object.assign(process.env, {
    VITE_API: 'http://127.0.0.1:1',
    VITE_BASE_URL: BASE,
    VITE_MTLS_CA: '',
    VITE_MTLS_CERT: '',
    VITE_MTLS_KEY: '',
  })
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    join(APP, 'vite.config.ts'),
    APP,
    'silent'
  )

  const proxies = new Map<string, ViteProxy>()
  for (const [path, options] of Object.entries(loaded.config.server.proxy)) {
    const { ws, rewrite } = options as Partial<ViteProxy>
    proxies.set(path, { ws: !!ws, rewrite: rewrite ?? ((path) => path) })
  }

  return proxies
}

function readNginxLocations(file: string) {
  const text = readFileSync(file, 'utf8')
    .replace(/#.*/g, '')
    .replace(
      /\$\{(\w+)\}/g,
      (variable, name) => TEMPLATE_VARIABLES[name] ?? variable
    )

  const locations: Location[] = []
  for (const [, modifier, path, body] of text.matchAll(
    /^\s*location\s+(=|\^~)?\s*([^\s{]+)\s*\{([^{}]*)\}/gm
  )) {
    locations.push({
      path,
      exact: modifier === '=',
      proxyPass: body.match(/proxy_pass\s+(\S+?)\s*;/)?.[1],
      redirect: body.match(/\breturn\s+30[1278]\s+(\S+?)\s*;/)?.[1],
      websocketLines: WEBSOCKET_LINES.filter((line) => line.test(body)).length,
    })
  }
  const blocks = text.match(/^\s*location\s/gm)?.length ?? 0

  return { locations, unread: blocks - locations.length }
}

// nginx's own pick, as long as the template has no regex location.
function matchLocation(locations: Location[], path: string) {
  const exact = locations.find(
    (location) => location.exact && location.path === path
  )
  if (exact) {
    return exact
  }

  const prefixes = locations.filter(
    (location) => !location.exact && path.startsWith(location.path)
  )

  return prefixes.sort((a, b) => b.path.length - a.path.length)[0]
}

function checkUnderBase(locations: Location[], path: string, ws: boolean) {
  const own = locations.find(
    (location) =>
      !location.exact && location.proxyPass && location.path === path
  )
  if (!own) {
    return `${path}: vite proxies it, ${TEMPLATE_NAME} has no location for it`
  }

  const picked = matchLocation(locations, path)
  if (picked !== own) {
    return `${path}: nginx picks location ${picked.exact ? '= ' : ''}${picked.path} over its proxy`
  }

  if (ws && own.websocketLines !== WEBSOCKET_LINES.length) {
    return `${path}: ws in vite, ${own.websocketLines}/${WEBSOCKET_LINES.length} websocket lines in ${TEMPLATE_NAME}`
  }
  if (!ws && own.websocketLines > 0) {
    return `${path}: not ws in vite, websocket lines in ${TEMPLATE_NAME}`
  }
}

// Outside the base, nginx may redirect a path to a proxy under the base.
function checkOutsideBase(locations: Location[], path: string) {
  const location = matchLocation(locations, path)
  if (location?.proxyPass) {
    return
  }

  const target = location?.redirect?.replace('$request_uri', path)
  if (!target) {
    return `${path}: vite proxies it, ${TEMPLATE_NAME} has no location for it`
  }
  if (!matchLocation(locations, target)?.proxyPass) {
    return `${path}: ${TEMPLATE_NAME} redirects it to ${target}, which it does not proxy`
  }
}

function compare(
  vite: Map<string, ViteProxy>,
  { locations, unread }: ReturnType<typeof readNginxLocations>
) {
  const problems: string[] = []
  if (unread) {
    problems.push(
      `${TEMPLATE_NAME}: ${unread} location blocks it cannot read, such as a regex location or a nested block`
    )
  }

  for (const [path, { ws }] of vite) {
    const problem = path.startsWith(BASE)
      ? checkUnderBase(locations, path, ws)
      : checkOutsideBase(locations, path)
    if (problem) {
      problems.push(problem)
    }
  }

  for (const location of locations.filter((location) => location.proxyPass)) {
    const proxy = vite.get(location.path)
    if (!proxy) {
      problems.push(
        `${location.path}: ${TEMPLATE_NAME} proxies it, vite does not`
      )
      continue
    }

    const expected =
      TEMPLATE_VARIABLES.NGINX_API_URL + proxy.rewrite(location.path)
    if (location.proxyPass !== expected) {
      problems.push(
        `${location.path}: ${TEMPLATE_NAME} proxies it to ${location.proxyPass}, not ${expected}`
      )
    }
  }

  return problems
}

const vite = await readViteProxies()
const problems = compare(vite, readNginxLocations(TEMPLATE))

console.log(`vite proxies: ${[...vite.keys()].join(', ')}`)
for (const problem of problems) {
  console.log(`FAIL ${problem}`)
}
process.exitCode = problems.length ? 1 : 0

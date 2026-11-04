#!/usr/bin/env node
// Prueba real contra Gemini (NO corre en CI). Uso:
//   GEMINI_API_KEY=… pnpm --filter @kalapp/api test:gemini-live [ruta/a/foto.jpg]
// Si no hay GEMINI_API_KEY (ni en el entorno ni en .dev.vars de la raíz) imprime "omitido" y sale 0.
// Ejecuta scripts/gemini-live.ts con Vitest en Node para reutilizar el MISMO código del Worker
// (src/gemini/*) y los esquemas de @kalapp/shared sin compilar nada aparte.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const apiDir = path.resolve(here, '..')
const devVars = path.resolve(apiDir, '../../.dev.vars')

const env = { ...process.env }
if (existsSync(devVars)) {
  for (const line of readFileSync(devVars, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(GEMINI_API_KEY|GEMINI_MODEL|GEMINI_FALLBACK_MODEL)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

if (!env.GEMINI_API_KEY) {
  console.log('gemini-live: omitido (no hay GEMINI_API_KEY)')
  process.exit(0)
}

const image = process.argv[2]
if (image) env.GEMINI_LIVE_IMAGE = path.resolve(process.cwd(), image)

const require = createRequire(import.meta.url)
const vitestBin = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const r = spawnSync(
  process.execPath,
  [vitestBin, 'run', '--config', path.join(here, 'vitest.live.config.mjs')],
  { cwd: apiDir, env, stdio: 'inherit' },
)
process.exit(r.status ?? 1)

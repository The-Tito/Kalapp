// Prueba real contra Gemini: se ejecuta con `pnpm --filter @kalapp/api test:gemini-live`.
// Usa exactamente el mismo builder de prompt/petición y el mismo parser que el Worker.
// Nunca imprime la clave.
import { readFileSync } from 'node:fs'
import { ALLOWED_IMAGE_TYPES, toAnalysisProposal } from '@kalapp/shared'
import { describe, expect, it } from 'vitest'
import { type AttemptResult, analyzeWithFallback } from '../src/gemini/client'
import { PROMPT_VERSION } from '../src/gemini/prompt'
import { bytesToBase64 } from '../src/gemini/request'

const apiKey = process.env.GEMINI_API_KEY ?? ''
const primary = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest'
const imagePath = process.env.GEMINI_LIVE_IMAGE

const TEXTS = [
  '3 tacos al pastor con piña, cebolla y cilantro, y una Coca-Cola de 355 ml',
  'Chilaquiles verdes con pollo, crema, queso fresco y frijoles refritos',
  'Una concha de vainilla y un café de olla',
]

// process.stdout directo: Vitest oculta console.log de las pruebas que pasan.
const print = (line: string) => process.stdout.write(`${line}\n`)

function report(label: string, result: AttemptResult) {
  print(`\n=== ${label} → ${result.kind} (${result.model})`)
  if (result.kind === 'ok') {
    print(JSON.stringify(toAnalysisProposal(result.output, result.model), null, 2))
  } else if (result.kind !== 'not_food') {
    print(`motivo: ${result.reason}`)
  }
}

describe.skipIf(!apiKey)(`Gemini en vivo (prompt v${PROMPT_VERSION})`, () => {
  for (const text of TEXTS) {
    it(`texto: ${text}`, async () => {
      const { result } = await analyzeWithFallback(
        { primary, fallback },
        { apiKey, prompt: { mode: 'text', text, localHour: 14 } },
      )
      report(text, result)
      expect(result.kind).toBe('ok')
    })
  }

  it.skipIf(!imagePath)('foto', async () => {
    const path = imagePath ?? ''
    const lower = path.toLowerCase()
    const mimeType = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg'
    expect(ALLOWED_IMAGE_TYPES).toContain(mimeType)
    const bytes = new Uint8Array(readFileSync(path))
    const { result } = await analyzeWithFallback(
      { primary, fallback },
      {
        apiKey,
        prompt: { mode: 'photo', localHour: 14 },
        image: { mimeType, base64: bytesToBase64(bytes) },
      },
    )
    report(`foto ${path} (${bytes.length} bytes)`, result)
    expect(['ok', 'not_food']).toContain(result.kind)
  })
})

describe.skipIf(Boolean(apiKey))('Gemini en vivo', () => {
  it('omitido (no hay GEMINI_API_KEY)', () => {
    print('gemini-live: omitido')
  })
})

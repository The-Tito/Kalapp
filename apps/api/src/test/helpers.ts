import { env } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { vi } from 'vitest'

export const TOKEN = 'test-token-0123456789abcdef'
export const BASE = 'https://kalapp.test'

/** Petición al Worker real (exports.default) con el token correcto salvo que se indique otro. */
export function api(path: string, init: RequestInit & { token?: string | null } = {}) {
  const { token = TOKEN, ...rest } = init
  const headers = new Headers(rest.headers)
  if (token !== null) headers.set('authorization', `Bearer ${token}`)
  return exports.default.fetch(new Request(`${BASE}${path}`, { ...rest, headers }))
}

export function json(path: string, method: string, body: unknown, extra: RequestInit = {}) {
  return api(path, {
    ...extra,
    method,
    headers: { 'content-type': 'application/json', ...(extra.headers ?? {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Vacía todas las tablas (las pruebas de un archivo comparten la BD). */
export async function resetDb() {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM entry_items'),
    env.DB.prepare('DELETE FROM entries'),
    env.DB.prepare('DELETE FROM profile'),
    env.DB.prepare('DELETE FROM ai_usage'),
    env.DB.prepare('DELETE FROM favorites'),
    env.DB.prepare('DELETE FROM weights'),
  ])
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>

/** Simula `fetch` saliente (Gemini / Open Food Facts). Devuelve el spy para inspeccionar llamadas. */
export function mockFetch(handler: FetchHandler) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return handler(url, init)
    })
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Respuesta de `generateContent` con `output` como texto JSON del primer candidato. */
export function geminiResponse(output: unknown) {
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  return jsonResponse({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
  })
}

/** Ejemplo ficticio (ex:reference-male): nunca datos reales. */
export const PROFILE_INPUT = {
  sex: 'male',
  birthDate: '1998-06-15',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
} as const

export const AI_OUTPUT = {
  not_food: false,
  title: 'Tacos al pastor',
  items: [
    {
      name: 'Tortilla de maíz',
      grams: 60,
      kcal: 130,
      proteinG: 3.4,
      carbsG: 27,
      fatG: 1.4,
      confidence: 'high',
    },
    {
      name: 'Carne al pastor',
      grams: 90,
      kcal: 200,
      proteinG: 18,
      carbsG: 3,
      fatG: 13,
      confidence: 'medium',
    },
  ],
  assumptions: ['3 tacos con tortilla de maíz'],
  questions: [],
  confidence: 'medium',
}

export const ITEM = {
  name: 'Tortilla de maíz',
  grams: 60,
  kcal: 130,
  proteinG: 3.4,
  carbsG: 27,
  fatG: 1.4,
}

export function entryInput(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    localDate: '2026-11-04',
    eatenAt: '2026-11-04T14:05:00-06:00',
    mealType: 'lunch',
    source: 'photo',
    title: 'Tacos',
    items: [ITEM, { ...ITEM, name: 'Carne', kcal: 200, proteinG: 18, carbsG: 3, fatG: 13 }],
    aiModel: 'gemini-flash-latest',
    aiConfidence: 'high',
    ...overrides,
  }
}

/** JPEG mínimo (firma FF D8 FF) relleno hasta `size` bytes. */
export function jpegBytes(size: number): Uint8Array {
  const b = new Uint8Array(size)
  b.set([0xff, 0xd8, 0xff, 0xe0].slice(0, size))
  for (let i = 4; i < size; i++) b[i] = i % 251
  return b
}

export function photoForm(
  bytes: Uint8Array,
  type = 'image/jpeg',
  fields: Record<string, string> = {},
): FormData {
  const form = new FormData()
  form.append('image', new File([bytes], 'comida.jpg', { type }))
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

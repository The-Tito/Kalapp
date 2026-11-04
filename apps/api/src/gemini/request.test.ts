import { describe, expect, it } from 'vitest'
import { buildAnalyzePrompt, PROMPT_VERSION } from './prompt'
import { buildGeminiRequest, bytesToBase64, parseGeminiResponse } from './request'

const candidate = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

describe('bytesToBase64', () => {
  it('codifica 1 MB sin reventar la pila y coincide con btoa', () => {
    const bytes = new Uint8Array(1_048_576)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256
    const out = bytesToBase64(bytes)
    expect(out).toHaveLength(Math.ceil(bytes.length / 3) * 4)
    const small = bytes.subarray(0, 300)
    expect(bytesToBase64(small)).toBe(btoa(String.fromCharCode(...small)))
    // Decodificar de vuelta reproduce los bytes.
    const back = Uint8Array.from(atob(out), (ch) => ch.charCodeAt(0))
    expect(back).toEqual(bytes)
  })

  it('vacío → ""', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('')
  })
})

describe('prompt y petición', () => {
  it('versión 1, español, contexto mexicano, nota y hora', () => {
    expect(PROMPT_VERSION).toBe('1')
    const p = buildAnalyzePrompt({ mode: 'text', text: '2 tacos', note: 'con queso', localHour: 9 })
    expect(p).toMatch(/comida mexicana/)
    expect(p).toMatch(/regular o light/)
    expect(p).toContain('2 tacos')
    expect(p).toContain('con queso')
    expect(p).toContain('09:00')
    expect(buildAnalyzePrompt({ mode: 'photo' })).toMatch(/foto adjunta/)
  })

  it('la clave va en el header, no en la URL; temperature 0 y responseSchema', () => {
    const { url, init } = buildGeminiRequest(
      'gemini-flash-latest',
      'clave',
      { mode: 'photo' },
      { mimeType: 'image/jpeg', base64: 'AAAA' },
    )
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    )
    expect(url).not.toContain('clave')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave')
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.temperature).toBe(0)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toContain('not_food')
    expect(body.contents[0].parts[1]).toEqual({
      inline_data: { mime_type: 'image/jpeg', data: 'AAAA' },
    })
  })
})

describe('parseGeminiResponse', () => {
  const ok = {
    title: 'Huevos',
    items: [
      {
        name: 'Huevo',
        grams: 100.04,
        kcal: 143.4,
        proteinG: 12.6,
        carbsG: 0.7,
        fatG: 9.5,
        confidence: 'high',
      },
    ],
    confidence: 'high',
  }

  it('acepta, aplica defaults y redondea', () => {
    const r = parseGeminiResponse(candidate(JSON.stringify(ok)))
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.output.assumptions).toEqual([])
    expect(r.output.items[0]?.grams).toBe(100)
    expect(r.output.items[0]?.kcal).toBe(143)
  })

  it('tolera cercas ```json y omite partes de pensamiento', () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'pensando…', thought: true },
              { text: `\`\`\`json\n${JSON.stringify(ok)}\n\`\`\`` },
            ],
          },
        },
      ],
    }
    expect(parseGeminiResponse(body).kind).toBe('ok')
  })

  it('JSON inválido, esquema incumplido, sin candidatos o bloqueado → invalid', () => {
    expect(parseGeminiResponse(candidate('{no es json')).kind).toBe('invalid')
    expect(parseGeminiResponse(candidate(JSON.stringify({ ...ok, items: [] }))).kind).toBe(
      'invalid',
    )
    expect(parseGeminiResponse({ candidates: [] }).kind).toBe('invalid')
    expect(parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }).kind).toBe('invalid')
    expect(
      parseGeminiResponse({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })
        .kind,
    ).toBe('invalid')
    expect(parseGeminiResponse(null).kind).toBe('invalid')
  })

  it('not_food: true → not_food', () => {
    const r = parseGeminiResponse(
      candidate(
        JSON.stringify({
          not_food: true,
          title: 'No se detectó comida',
          items: [],
          confidence: 'low',
        }),
      ),
    )
    expect(r.kind).toBe('not_food')
  })
})

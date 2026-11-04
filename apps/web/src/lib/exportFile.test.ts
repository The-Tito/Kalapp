// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../test/fixtures'
import { createApiClient, filenameFromDisposition } from './api'
import { canShareFile, deliverFile } from './exportFile'
import { createTokenStore } from './token'

const blob = () => new Blob(['a,b\r\n1,2\r\n'], { type: 'text/csv' })

function downloadDeps() {
  const create = vi.fn(() => 'blob:fake')
  const revoke = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { create, revoke, click }
}

describe('exportar', () => {
  it('usa la hoja de compartir si canShare acepta archivos', async () => {
    const share = vi.fn(async () => {})
    const canShare = vi.fn(() => true)
    const d = downloadDeps()
    const r = await deliverFile(blob(), 'kalapp.csv', {
      navigator: { share, canShare },
      createObjectURL: d.create,
      revokeObjectURL: d.revoke,
    })
    expect(r).toBe('shared')
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0]
    expect(arg.files?.[0]?.name).toBe('kalapp.csv')
    expect(arg.files?.[0]?.type).toBe('text/csv')
    expect(d.create).not.toHaveBeenCalled()
  })

  it('descarga con <a download> si no se puede compartir', async () => {
    const d = downloadDeps()
    const share = vi.fn()
    const r = await deliverFile(blob(), 'kalapp.json', {
      navigator: { share, canShare: () => false },
      createObjectURL: d.create,
      revokeObjectURL: d.revoke,
    })
    expect(r).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(d.create).toHaveBeenCalledTimes(1)
    expect(d.click).toHaveBeenCalledTimes(1)
    const a = d.click.mock.contexts[0] as HTMLAnchorElement
    expect(a.download).toBe('kalapp.json')
    expect(document.querySelector('a[download]')).toBeNull() // se quita del DOM
  })

  it('sin Web Share (escritorio) → descarga', async () => {
    const d = downloadDeps()
    const r = await deliverFile(blob(), 'x.csv', {
      navigator: undefined,
      createObjectURL: d.create,
      revokeObjectURL: d.revoke,
    })
    expect(r).toBe('downloaded')
  })

  it('cancelar la hoja no descarga; perder el gesto pide otro toque', async () => {
    const d = downloadDeps()
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const notAllowed = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    const deps = { createObjectURL: d.create, revokeObjectURL: d.revoke }
    expect(
      await deliverFile(blob(), 'x.csv', {
        ...deps,
        navigator: { canShare: () => true, share: vi.fn(async () => Promise.reject(abort)) },
      }),
    ).toBe('cancelled')
    expect(
      await deliverFile(blob(), 'x.csv', {
        ...deps,
        navigator: { canShare: () => true, share: vi.fn(async () => Promise.reject(notAllowed)) },
      }),
    ).toBe('needs-gesture')
    expect(d.create).not.toHaveBeenCalled()
  })

  it('canShare que lanza se trata como no disponible', () => {
    const file = new File(['x'], 'x.csv')
    expect(
      canShareFile(file, {
        share: vi.fn(),
        canShare: () => {
          throw new TypeError('no')
        },
      }),
    ).toBe(false)
  })

  it('lee el nombre de Content-Disposition', () => {
    expect(filenameFromDisposition('attachment; filename="kalapp-inicio-2026-11-04.csv"')).toBe(
      'kalapp-inicio-2026-11-04.csv',
    )
    expect(filenameFromDisposition("attachment; filename*=UTF-8''kalapp%20x.json")).toBe(
      'kalapp x.json',
    )
    expect(filenameFromDisposition(null)).toBeNull()
  })

  it('api.exportFile pide con token y rango y devuelve Blob + nombre', async () => {
    const tokens = createTokenStore(() => memoryStorage())
    tokens.set('secreto')
    const fetchFn = vi.fn(
      async () =>
        new Response('a,b\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="kalapp-2026-10-06-2026-11-04.csv"',
          },
        }),
    )
    const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
    const file = await api.exportFile('csv', { from: '2026-10-06', to: '2026-11-04' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/export?format=csv&from=2026-10-06&to=2026-11-04')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secreto')
    expect(file.filename).toBe('kalapp-2026-10-06-2026-11-04.csv')
    expect(await file.blob.text()).toBe('a,b\r\n')
  })
})

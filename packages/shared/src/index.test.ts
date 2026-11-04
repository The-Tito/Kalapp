import { describe, expect, it } from 'vitest'
import { APP_NAME } from './index'

describe('@kalapp/shared', () => {
  it('exporta el nombre de la app', () => {
    expect(APP_NAME).toBe('Kalapp')
  })
})

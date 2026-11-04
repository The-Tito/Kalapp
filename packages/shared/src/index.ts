/**
 * @kalapp/shared — contrato entre la API y la web (esquemas Zod y tipos)
 * y cálculo nutricional (funciones puras).
 */
export const APP_NAME = 'Kalapp'

export * from './constants'
export * from './nutrition/adaptive'
export * from './nutrition/age'
export * from './nutrition/barcode'
export * from './nutrition/energy'
export * from './nutrition/items'
export * from './nutrition/recommend'
export * from './nutrition/summary'
export * from './schemas/adaptive'
export * from './schemas/analysis'
export * from './schemas/api'
export * from './schemas/barcode'
export * from './schemas/common'
export * from './schemas/entry'
export * from './schemas/favorite'
export * from './schemas/meta'
export * from './schemas/profile'
export * from './schemas/summary'
export * from './schemas/weight'
export * from './utils/dates'
export * from './utils/format'
export * from './utils/math'
export * from './utils/meal'

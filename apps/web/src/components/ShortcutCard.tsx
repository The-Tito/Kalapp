import { useState } from 'react'
import { copyText, maskToken, shortcutUrl } from '../lib/shortcut'
import { useToken } from '../lib/token'
import { Button, Card } from './ui'

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  )
}

const HEALTH_STEPS = [
  'Abre la app Atajos y toca “+” para crear un atajo nuevo. Ponle de nombre “Calorías de hoy”.',
  'Agrega la acción “Obtener contenido de URL”. En URL pega la dirección que copiaste con “Copiar URL”.',
  'Toca la flecha de esa acción: Método GET. En Encabezados agrega uno: clave “Authorization”, valor “Bearer ” (con espacio) seguido de tu token (botón “Copiar token”).',
  'Agrega “Obtener diccionario de entrada” para leer la respuesta JSON.',
  'Agrega “Obtener valor del diccionario” con la clave “kcal”. Luego “Registrar muestra de salud”: tipo Energía alimentaria, valor = el resultado, unidad kcal.',
  'Repite el paso anterior con “proteinG” → Proteína (g), “carbsG” → Carbohidratos (g) y “fatG” → Grasa total (g).',
  'Opcional: agrega “Mostrar resultado” con el texto “Llevas [kcal] kcal; te quedan [remainingKcal]”.',
  'Ejecútalo una vez y acepta los permisos de Salud.',
] as const

const AUTOMATION_STEPS = [
  'En Atajos ve a Automatización → “+” → Hora del día.',
  'Elige 22:00, Diariamente, y “Ejecutar inmediatamente” (sin preguntar).',
  'Como acción elige “Ejecutar atajo” → “Calorías de hoy”.',
  'Importante: ejecútalo una sola vez al día para no duplicar las muestras en Salud.',
] as const

const SIRI_STEPS = [
  'El nombre del atajo es la frase: si se llama “¿Cuántas calorías llevo?”, di “Oye Siri, ¿cuántas calorías llevo?”.',
  'Para que solo responda sin registrar en Salud, duplica el atajo, quita las acciones de “Registrar muestra de salud” y deja “Mostrar resultado”.',
] as const

const REMINDER_STEPS = [
  'En Atajos → Automatización → “+” → Hora del día (por ejemplo 14:30 y 20:30), Diariamente, Ejecutar inmediatamente.',
  'Acción “Mostrar notificación” con el texto “¿Ya registraste tu comida?”.',
  'Al tocar la notificación se abre Atajos; para abrir Kalapp agrega después la acción “Abrir URL” con la dirección de la app.',
] as const

export function ShortcutCard() {
  const token = useToken()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = shortcutUrl(origin)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (what: 'url' | 'token') => {
    const ok = await copyText(what === 'url' ? url : (token ?? ''))
    setCopied(
      ok
        ? what === 'url'
          ? 'URL copiada.'
          : 'Token copiado. Pégalo solo en tu atajo; no lo compartas.'
        : 'No se pudo copiar; mantén presionado el texto para copiarlo.',
    )
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Atajo de iOS (Apple Salud y Siri)</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Con un Atajo puedes mandar los totales del día a Salud y preguntarle a Siri cuántas calorías
        llevas.
      </p>
      <div className="flex flex-col gap-1 rounded-xl bg-gray-100 p-3 text-sm dark:bg-gray-800">
        <span className="text-gray-600 dark:text-gray-400">URL</span>
        <code className="break-all select-all" data-testid="shortcut-url">
          {url}
        </code>
        <span className="mt-2 text-gray-600 dark:text-gray-400">Token</span>
        <code className="break-all">{maskToken(token)}</code>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void copy('url')}>
          Copiar URL
        </Button>
        <Button variant="secondary" disabled={!token} onClick={() => void copy('token')}>
          Copiar token
        </Button>
      </div>
      {copied && (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-400">
          {copied}
        </p>
      )}
      <details className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          1. Crear el atajo “Calorías de hoy”
        </summary>
        <Steps items={HEALTH_STEPS} />
      </details>
      <details className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          2. Enviarlo a Salud cada noche
        </summary>
        <Steps items={AUTOMATION_STEPS} />
      </details>
      <details className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          3. Preguntarle a Siri
        </summary>
        <Steps items={SIRI_STEPS} />
      </details>
      <details className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          Recordatorio para registrar (sin notificaciones push)
        </summary>
        <Steps items={REMINDER_STEPS} />
      </details>
    </Card>
  )
}

# Kalapp — Versiones del prompt de Gemini

> Código: `apps/api/src/gemini/prompt.ts` (texto, `PROMPT_VERSION`), `gemini/schema.ts` (`responseSchema`), `gemini/request.ts` (cuerpo de la petición y validación), `gemini/client.ts` (modelo principal y respaldo).  
> Regla: **cualquier cambio de texto del prompt sube `PROMPT_VERSION`** y se registra aquí con fecha, motivo y efecto medido en [`ACCURACY.md`](./ACCURACY.md).

## Versión actual: 1 (2026-11-04)

### Rol
"Nutriólogo experto en comida mexicana y en estimar porciones a partir de fotos o descripciones"; estima calorías y macros de **una** comida.

### Reglas (resumen de las 10 del prompt)
1. Responder solo con el JSON del esquema, en español de México.
2. **Contexto mexicano:** platillos, ingredientes y porciones típicos (tortillas de maíz/harina, frijoles, arroz rojo, guisados, mole, chilaquiles, tacos, tortas, quesadillas, antojitos, pan dulce, aguas frescas, refrescos) y su preparación habitual (aceite, manteca, crema).
3. Desglosar en ingredientes (`items`) con gramos **como se comió** (cocido, servido) y `kcal`, `proteinG`, `carbsG`, `fatG` para esos gramos.
4. Aceites, mantecas, cremas, quesos, salsas, aderezos y bebidas probables como ingredientes aparte; si son dudosos, en `assumptions`.
5. kcal coherentes con macros (4/4/9).
6. `assumptions`: supuestos breves (porción, tipo de tortilla, aceite…).
7. `questions`: máximo 3, solo si la respuesta cambiaría mucho el resultado (regular vs. light, frito vs. asado, número de piezas).
8. Confianza honesta (`high`/`medium`/`low`) por ingrediente y general; "no inventes precisión".
9. `title`: nombre corto y natural del platillo.
10. **`not_food`:** si no hay comida ni bebida (persona, paisaje, documento) o el texto no es comestible → `not_food: true`, `title: "No se detectó comida"`, `items: []`, `confidence: "low"`. Si no, `not_food: false` y al menos un ingrediente.

### Partes variables (el texto es determinista: misma entrada → mismo prompt)
- **Foto:** "Analiza la comida de la foto adjunta"; usar objetos de referencia (plato, cubiertos, mano, tortilla) para el tamaño.
- **Texto:** la descripción va entre `"""`; sin cantidades → porción típica en México, declarada en `assumptions`.
- **Nota del usuario** (opcional, "tiene prioridad sobre lo que supongas"), p. ej. "frito en manteca".
- **Hora local** `HH:00` (si el cliente no la manda, se calcula con la zona del perfil).

### Configuración de la petición
| Parámetro | Valor |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent` (REST, sin SDK) |
| Clave | Encabezado `x-goog-api-key` (nunca en la URL) |
| `temperature` | `0` |
| `responseMimeType` | `application/json` |
| `responseSchema` | Objeto con `not_food`, `title`, `items[]` (`name`, `grams`, `kcal`, `proteinG`, `carbsG`, `fatG`, `confidence`), `assumptions[]`, `questions[]`, `confidence`; rangos y longitudes de `LIMITS` de `@kalapp/shared` |
| Imagen | `inline_data` en base64 (JPEG, PNG o WebP, ≤ `MAX_IMAGE_BYTES` = 1 MiB, firma del archivo verificada) |
| Timeout | 25 s por intento |

### Después de la respuesta
1. Se unen las partes de texto del primer candidato (se ignoran los "thoughts"), se quitan cercas ```` ```json ````, se parsea.
2. `not_food: true` → **422 `NOT_FOOD`**.
3. Validación con Zod (`AiAnalysisOutputSchema`); si falla → respuesta inválida.
4. Redondeo (gramos y macros a 1 decimal, kcal entero), recálculo 4/4/9 y marca `energyMismatch` si algún ingrediente difiere > 15 % (mínimo 20 kcal), totales → `AnalysisProposal` con el modelo que respondió. **No se guarda** nada en `entries`.

### Modelos y cuándo cambia al respaldo
| Rol | Variable (`wrangler.jsonc` → `vars`) | Valor por defecto |
|---|---|---|
| Principal | `GEMINI_MODEL` | `gemini-flash-latest` |
| Respaldo | `GEMINI_FALLBACK_MODEL` | `gemini-flash-lite-latest` |

- Pasa **una vez** al respaldo si el principal da **429, 5xx, 404** (modelo retirado), **timeout**, **error de red** o **respuesta inválida** (no JSON / no cumple el esquema).
- **400/401/403** (clave o petición mal configuradas) → **503 `AI_UNAVAILABLE` directo**, sin respaldo (no lo arreglaría).
- Resultado final: ok → 200 · `not_food` → 422 · inválido → 502 `AI_INVALID_RESPONSE` · no disponible/rechazado → 503 `AI_UNAVAILABLE`.
- Un intento (principal + respaldo) cuenta **1** en el límite diario; se reserva antes de llamar.

## Historial

| Versión | Fecha | Cambio | Motivo | Efecto en precisión (ver ACCURACY.md) |
|---|---|---|---|---|
| 1 | 2026-11-04 | Versión inicial: 10 reglas, contexto mexicano, `not_food`, `responseSchema`, temperatura 0 | Primera implementación (M4) | Sin medir todavía (no hay clave de Gemini en la sesión de desarrollo) |
| | | | | |

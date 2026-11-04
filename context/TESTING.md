# Kalapp — Pruebas y checklist del iPhone

> Versión 1.0 · 2026-11-04 · Estado: v1.0.0 lista en código; **736 pruebas en verde** (shared 177 · api 261 · web 298).  
> Nodos del KG: `doc:testing`, `fact:test-suite-736`, `fact:qa-adversarial-api`, `fact:qa-adversarial-web`, `fact:e2e-playwright`, `fact:curl-attacks`, `task:first-real-test`.  
> **Regla:** ninguna prueba automática llama a Gemini de verdad; siempre se usa `fetch` simulado. La única llamada real es el comando opcional `pnpm test:gemini-live`.

## 1. Cómo correr las pruebas

Desde la raíz del repositorio (Node 22, `pnpm install` hecho):

```bash
pnpm lint            # Biome en todo el monorepo
pnpm typecheck       # tsc --noEmit en cada paquete
pnpm test            # Vitest en shared, api y web (una sola instancia; jsdom en la raíz)
pnpm build           # build de la PWA (apps/web/dist)
```

Por paquete:
```bash
pnpm --filter @kalapp/shared test   # cálculo nutricional y esquemas Zod
pnpm --filter @kalapp/api test      # rutas dentro del runtime de Workers (@cloudflare/vitest-plugin, D1 local)
pnpm --filter @kalapp/web test      # lógica y pantallas con jsdom
```

Solo las suites adversariales (Vitest filtra por nombre de archivo):
```bash
pnpm --filter @kalapp/api exec vitest run adversarial
pnpm --filter @kalapp/web exec vitest run adversarial
```

Prueba real con Gemini (opcional, consume cuota gratuita; sin clave imprime "omitido"):
```bash
pnpm test:gemini-live            # descripciones de texto
pnpm test:gemini-live foto.jpg   # además, una foto
```
Lee `GEMINI_API_KEY` del entorno o de `.dev.vars`. Nunca escribas la clave en un commit ni en un chat.

Probar contra el Worker real en local:
```bash
cp .dev.vars.example .dev.vars   # pon un APP_TOKEN de ≥ 16 caracteres (y la clave si la tienes)
pnpm db:migrate:local
pnpm dev                         # API en :8787, PWA en :5173
```

## 2. Qué cubren las suites

| Suite | Archivos | Qué ataca |
|---|---|---|
| Cálculo (shared) | `packages/shared/src/**/*.test.ts` | Ejemplo de referencia `ex:reference-male`, piso de seguridad, Katch, IMC > 30, avisos, gasto adaptativo, esquemas (incluye nombres invisibles) |
| API adversarial | `apps/api/src/middleware/auth.adversarial.test.ts`, `routes/{analyze,contract,entries,misc}.adversarial.test.ts` | Token (ausente, corto, con espacios, timing), rutas inexistentes → 401, inyección SQL, límites de cuerpo y `Content-Length`, JSON anidado > 32, firma de imagen, cupo diario atómico, fallas de Gemini (429/5xx/timeout/JSON inválido/400–403), forma del contrato, idempotencia por id |
| Web adversarial | `apps/web/src/lib/{api,compressImage,dates,misc,offlineQueue,onboarding,review,token}.adversarial.test.ts`, `lib/queueContext.adversarial.test.tsx`, `screens/ReviewScreen.adversarial.test.tsx` | Cliente de API ante respuestas raras, compresión de imágenes extremas, fechas y cambios de horario (`zonedIso`), cola offline (límite 20, backoff, 401 pausa, 429 reintenta, 5 intentos), onboarding con entradas basura, Revisar (0 g, presets, doble toque), token (trim, header inválido) |

Resultado de la ronda final de QA: API con 13 hallazgos y web con 15 bugs, **todos corregidos** y cubiertos por estas suites.

### Verificaciones manuales hechas en la sesión (no están en el repo)
- **e2e con Playwright** (iPhone 13 emulado) contra `wrangler dev` real y Gemini simulado: onboarding → foto → revisar → guardar; doble toque en Guardar (sin duplicados); historial; peso y gasto adaptativo; código de barras manual; cola offline de foto y de texto; CSP sin violaciones; service worker registrado.
- **Ataques con curl** al Worker real: imagen de 5 MB → 413; JSON anidado → 400; `Content-Length` mentiroso → 400; 100 GET en paralelo → ok; `.dev.vars` no se sirve como asset.

Ninguna de las dos sustituye la prueba en un iPhone real (sección 3).

## 3. Checklist manual del iPhone (cada release)

Hazlo con la app **instalada desde Safari** (ícono en inicio), no en la pestaña del navegador. Marca cada punto.

### Instalación y token
- [ ] Safari → Compartir → Agregar a inicio; abre a pantalla completa, sin barra de Safari.
- [ ] Token pegado con espacio o salto de línea al final: se acepta (se recorta).
- [ ] Token incorrecto: mensaje claro y regresa a la pantalla de token; con el correcto, entra.

### Onboarding y perfil
- [ ] Los 4 pasos (datos → entrenamiento → objetivo/intensidad → resultado) con números con decimales.
- [ ] La recomendación muestra explicación y avisos; aceptar o ajustar a mano.
- [ ] Ajustes → editar perfil: la barra inferior se oculta; al guardar se recalcula la meta.

### Captura
- [ ] Cámara: tomar foto → se comprime y analiza.
- [ ] Galería: elegir una foto existente.
- [ ] Foto **HEIC** (formato por defecto del iPhone): se convierte y analiza sin error 415.
- [ ] Al volver de la cámara, si iOS recargó la app, no se pierde lo capturado ni se queda en blanco.
- [ ] Cancelar un análisis en curso: vuelve sin guardar nada.
- [ ] **Modo avión, foto:** se encola; al quitar el modo avión se analiza sola y avisa.
- [ ] **Modo avión, texto:** igual que la foto.

### Revisar
- [ ] Presets ½× · 1× · 1.5× · 2× cambian gramos y totales.
- [ ] Editar gramos de un ingrediente recalcula kcal y macros.
- [ ] Poner **0 g** y luego volver a subirlo recupera las kcal (no se pierden datos).
- [ ] Quitar y añadir ingredientes; la barra inferior está oculta.
- [ ] **Doble toque** rápido en Guardar: se guarda una sola comida.

### Hoy y días pasados
- [ ] El anillo y las barras de macros cuadran con la lista.
- [ ] Editar y borrar una comida.
- [ ] Registrar en un día pasado: aparece en ese día, no en hoy.

### Favoritos y código de barras
- [ ] Guardar como favorito y repetirlo en un toque.
- [ ] Código de barras **en vivo** con la cámara (zxing) — riesgo `risk:zxing-ios-unverified`.
- [ ] Código de barras **manual** (escribir dígitos y gramos); producto inexistente → mensaje claro.

### Export
- [ ] Export CSV: la hoja de compartir permite **Guardar en Archivos**; abre bien en **Numbers** (acentos correctos).
- [ ] Export JSON: se guarda en Archivos y se puede abrir.

### Historial, peso y adaptativo
- [ ] Historial: calendario y promedio semanal; abre rápido (carga perezosa).
- [ ] Peso: registrar, reemplazar el del día y borrar; la gráfica se actualiza.
- [ ] Gasto adaptativo: con pocos datos explica qué falta; con ≥ 14 días propone una meta y no la aplica sola.

### Atajo de iOS, Salud, Siri y recordatorio
- [ ] Ajustes → Atajo de iOS: el token se ve enmascarado; "Copiar URL" y "Copiar token" funcionan.
- [ ] Crear el atajo siguiendo las instrucciones: obtiene `/api/shortcut/today` — riesgo `risk:shortcut-unverified`.
- [ ] Los valores llegan a **Apple Salud** (energía, proteína, carbohidratos, grasa).
- [ ] Ejecutarlo con **Siri** por su frase.
- [ ] Automatización diaria (recordatorio) a la hora elegida; no duplica muestras.

### Apariencia y actualización
- [ ] **Safe areas:** nada queda bajo la muesca/Dynamic Island ni bajo la barra de inicio; la barra inferior es tocable.
- [ ] **Modo oscuro** del sistema: textos legibles en todas las pantallas.
- [ ] **Nueva versión:** tras un despliegue aparece el aviso "Actualizar" y al tocarlo carga la versión nueva.

### Pendientes conocidos para observar
- Cambio de horario de Chile (zona `America/Santiago`) sin verificar en dispositivo (`risk:dst-chile-unverified`).
- Escribir "60." en un campo numérico lo marca inválido hasta escribir el decimal (`risk:parse-number-trailing-dot`, cosmético).

## 4. Después del checklist
- Corre la "Primera prueba real" de [`DEPLOY.md`](./DEPLOY.md) (§9b) si aún no se hizo.
- Registra la línea base de precisión en [`ACCURACY.md`](./ACCURACY.md).
- Reporta lo que falle para que el orquestador lo asigne (fallas de la web → `web-pwa`, API → `api-worker`).

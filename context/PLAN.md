# Kalapp — Plan del proyecto

> Versión 1.2 · 2026-11-04 · Estado: M0–M1 terminados e integrados en `develop`; M2–M5 terminados en código en `feature/v0.1-api-pwa` (QA de API aprobado tras correcciones; QA de web pendiente); M6 en progreso (`DEPLOY.md` y protocolo de `ACCURACY.md` listos; falta el primer deploy).  
> **La API ya cubre v0.1–v1.0** (incluye favoritos, resumen, peso, gasto adaptativo, export, código de barras y Atajo); la interfaz sigue el roadmap por fases. Cambios de contrato en la sección 6.  
> Fuente de verdad estructurada: [`knowledge-graph.json`](./knowledge-graph.json). Si este plan cambia, actualizar ambos.

## 1. Visión y alcance
- **Qué:** PWA personal para iPhone que estima calorías y macros desde una foto (o texto), registra lo comido y recomienda una meta según objetivo (déficit, recomposición, ganancia muscular).
- **Para quién:** un solo usuario. **Costo:** 0 MXN (tope 150 MXN si se activa Gemini de pago).
- **Fuera de alcance (por ahora):** multiusuario, app nativa, App Store, coaching, recetas, Android específico.
- **Principios:** registrar en < 10 s / 3 toques · resultados explicados · la IA propone, el usuario confirma · ningún secreto ni dato personal en el repo · cada fase usable por sí sola.

## 2. Stack definitivo
| Capa | Elección |
|---|---|
| Runtime / gestor | Node 22 LTS · pnpm workspaces |
| Lenguaje | TypeScript estricto en todo el monorepo |
| Frontend | React + Vite + vite-plugin-pwa + Tailwind CSS + React Router + TanStack Query + Dexie |
| Backend | Cloudflare Worker con Hono (sirve `/api/*` y los assets de `apps/web/dist`) |
| BD | Cloudflare D1 (SQLite) con migraciones SQL versionadas |
| IA | Gemini vía REST (`fetch`, sin SDK): modelo principal Flash, respaldo Flash‑Lite, configurables por variable |
| Validación | Zod (paquete compartido) |
| Calidad | Biome (lint + formato) · `tsc --noEmit` |
| Pruebas | Vitest 4.1 (shared y web) · `@cloudflare/vitest-plugin` (API dentro del runtime de Workers, con D1 local y Gemini simulado) |
| CI | GitHub Actions: install → lint → typecheck → test → build en cada push/PR |
| CD | Cloudflare Workers Builds conectado a GitHub (push a `main` = producción; ramas = URL de vista previa) |

Versiones fijadas en M0 (exactas, `save-exact=true`): Node 22 · pnpm 10.28 · TypeScript 6.0.3 · Biome 2.6.4 · Vitest 4.1.12 · Wrangler 4.157 · Hono 4.13 · Zod 4.6 · React 19.3 · Vite 8.3 · Tailwind 4.3 · vite-plugin-pwa 2.0.

## 3. Decisiones nuevas de esta planeación
1. **Biome** en lugar de ESLint+Prettier: una sola herramienta y config.
2. **Workers Builds** (integración Git de Cloudflare) para desplegar: no hace falta guardar un token de Cloudflare en GitHub.
3. **Gemini por REST**: menos dependencias y sin problemas de compatibilidad en Workers.
4. **Subida de foto en `multipart/form-data`** (JPEG ya comprimido, ≤ 1 MB); el Worker la convierte a base64 para Gemini.
5. **IDs generados en el cliente** (`crypto.randomUUID()`): permite cola sin internet e idempotencia (reintentar no duplica).
6. **Columna `local_date` (YYYY‑MM‑DD)** calculada en el iPhone (zona `America/Mexico_City` por defecto): el "día" es el del usuario, no el UTC del servidor.
7. **Conventional Commits** (`feat:`, `fix:`, `docs:`…) y PRs pequeños por milestone.

## 4. Estructura del repositorio
```
Kalapp/
├─ apps/
│  ├─ web/                 React PWA
│  │  └─ src/{pages,components,lib,hooks,pwa}/
│  └─ api/                 Worker Hono
│     └─ src/{index.ts, routes/, middleware/, gemini/, db/}
├─ packages/shared/        schemas/ (Zod) · nutrition/ (cálculo) · constants.ts
├─ migrations/             0001_init.sql, 0002_…
├─ context/                knowledge-graph.json · README.md · PLAN.md · DEPLOY.md (M6) · PROMPTS.md · ACCURACY.md
├─ .github/workflows/ci.yml
├─ wrangler.jsonc          Worker + assets (SPA, run_worker_first: /api/*) + D1 binding DB + vars
├─ biome.json · tsconfig.base.json · package.json · pnpm-workspace.yaml
```
**Config del Worker:** binding `DB`; vars `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `DAILY_ANALYZE_LIMIT=60`, `MAX_IMAGE_BYTES=1048576`; secretos `GEMINI_API_KEY`, `APP_TOKEN` (solo con `wrangler secret put`, y `.dev.vars` local ignorado por git).

**Desarrollo local:** `pnpm dev` levanta en paralelo `wrangler dev` (API + D1 local en :8787) y Vite (:5173, proxy de `/api` → :8787). `pnpm db:migrate:local` aplica migraciones.

## 5. Modelo de datos (migración `0001_init.sql`)
- `profile` (1 fila): sex, birth_date, height_cm, weight_kg, body_fat_pct NULL, activity_level, training_days, goal, intensity, bmr, tdee, target_kcal, protein_g, fat_g, carbs_g, is_manual_override, timezone, updated_at.
- `entries`: id (UUID cliente), local_date, eaten_at, meal_type, source, note, total_kcal/protein/carbs/fat, ai_model, ai_confidence, created_at · índice en `local_date`.
- `entry_items`: id, entry_id (FK, ON DELETE CASCADE), name, grams, kcal, protein_g, carbs_g, fat_g.
- `favorites` (v0.2), `weights` (v0.3) — se crean en sus migraciones `0002`, `0003`.
- `ai_usage`: date, model, calls (PK date+model).

**Columnas reales (v1.2, de `migrations/`):**
- `0001_init.sql` — `profile` (id = 1) agrega `manual_target_kcal`, `bmr_formula` (mifflin|katch), `adjust_pct`, `expected_kg_per_week`, `safety_floor_applied`, `warnings_json`, `explanation_json`. `entries` agrega `title` y `source` admite `manual`. `entry_items` agrega `position` y `confidence`. `ai_usage` igual (fecha = día de Ciudad de México).
- `0002_favorites.sql` — `favorites`: id, name, meal_type, items_json, total_kcal/protein/carbs/fat, uses_count, created_at, last_used_at.
- `0003_weights.sql` — `weights`: id, local_date (UNIQUE: un peso por día), weight_kg, created_at.
- Se borró la migración placeholder `0000`.

## 6. Contrato de la API
Todas bajo `/api`, requieren `Authorization: Bearer <APP_TOKEN>` (comparación en tiempo constante); errores con forma `{ error: { code, message } }`.
| Endpoint | Fase | Notas |
|---|---|---|
| `GET /api/health` | v0.1 | Sin token; para verificar despliegue |
| `GET/PUT /api/profile` | v0.1 | PUT recibe datos crudos; el servidor recalcula con `shared/nutrition` y guarda |
| `POST /api/analyze` | v0.1 | multipart (`image`, `note`) o JSON (`text`, v0.2). No guarda. Límite diario → 429 `DAILY_LIMIT` |
| `GET /api/entries?date=` · `POST` · `PATCH /:id` · `DELETE /:id` | v0.1 | POST idempotente por id |
| `GET /api/summary?from=&to=` | v0.2 | Totales por día + promedio |
| `GET/POST/DELETE /api/favorites` | v0.2 | |
| `GET/POST /api/weights` | v0.3 | |
| `GET /api/export?format=csv|json` | v0.3 | |

**Cambios de contrato (v1.2, ya implementados):**
| Endpoint / regla | Detalle |
|---|---|
| `GET /api/usage` | `{ date, calls, limit }` del día (Ciudad de México) |
| `GET /api/shortcut/today` | Totales de hoy para el Atajo de iOS → Salud (`kcal`, `proteinG`, `carbsG`, `fatG`, `targetKcal`, `remainingKcal`) |
| `GET /api/barcode/:code` | Open Food Facts (6–14 dígitos, timeout 8 s); 404 si no hay datos; 503 `UPSTREAM_UNAVAILABLE` |
| `POST /api/favorites/:id/use` · `DELETE /api/weights/:localDate` | Repetir favorito; borrar peso del día |
| `GET /api/adaptive` | Gasto adaptativo (ventana 28 días); 409 `PROFILE_REQUIRED` |
| Token | Rutas inexistentes sin token → 401 (no se enumeran); comparación SHA-256 + `timingSafeEqual`; `APP_TOKEN` < 16 caracteres → 500 "Servidor sin configurar" (fail-closed) |
| Encabezados | `Cache-Control: no-store` y `X-Content-Type-Options: nosniff` en toda `/api` |
| Cuerpos | JSON ≤ 256 KB; multipart solo en `/api/analyze` (≤ `MAX_IMAGE_BYTES` + 16 KB); firma real JPEG/PNG/WebP o 415 |
| Códigos nuevos | `NOT_FOOD` 422 (sin comida en foto/texto) · `UPSTREAM_UNAVAILABLE` 503 · `AI_INVALID_RESPONSE` 502 · `AI_UNAVAILABLE` 503 |
| Datos | UUID normalizados a minúsculas; `name`/`title` solo con espacios o invisibles → 400; export ≤ 366 días, CSV con BOM + CRLF y neutralización de fórmulas |

**Pipeline de `/analyze` (v1.2):** validar tipo, firma y tamaño (los rechazos no consumen cupo) → **reservar el intento de forma atómica** (límite `DAILY_ANALYZE_LIMIT`, día de Ciudad de México; principal + respaldo = 1) → prompt v1 (contexto mexicano, gramos por ingrediente, supuestos, preguntas, confianza, `not_food`) + `responseSchema` + `temperature: 0` → Gemini principal; si **429/5xx/404/timeout (25 s)/error de red/respuesta inválida** → respaldo una vez; **400/401/403 → 503 directo** → validar con Zod → recalcular kcal con 4/4/9 y marcar `energy_mismatch` si difiere > 15 % → sumar totales → responder (`not_food` → 422). Detalle y versiones en `context/PROMPTS.md`.

## 7. Paquete compartido (`packages/shared`)
- `schemas/`: `ProfileInput`, `Profile`, `Recommendation`, `AnalysisProposal`, `EntryInput`, `Entry`, `EntryItem`, `Favorite`, `Weight`.
- `nutrition/`: `bmr()` (Mifflin; Katch si hay % grasa) · `tdee()` · `recommend(input)` → `{ bmr, tdee, targetKcal, proteinG, fatG, carbsG, expectedKgPerWeek, warnings[], explanation }` aplicando: ajuste por objetivo/intensidad, redondeo a 50, piso de seguridad (1,500 H / 1,200 M y ≥ BMR), proteína con peso ajustado si IMC > 30 (peso a IMC 25), grasa 25 % con mínimo 0.6 g/kg **sobre el peso real**, carbohidratos = resto **redondeado hacia abajo** (0 g con aviso `CARBS_CLAMPED` si es negativo), avisos (recomp sin pesas, ganancia con grasa alta, `DEFICIT_NOT_POSSIBLE` si el piso impide el déficit). El gasto adaptativo marca `IMPLAUSIBLE_RESULT` fuera de 800–6,000 kcal.
- `constants.ts`: factores de actividad, objetivos e intensidades (los del KG).

## 8. Pantallas
| Pantalla | Fase | Contenido |
|---|---|---|
| Token | v0.1 | Capturar token una vez; se guarda en `localStorage`; 401 → regresa aquí |
| Onboarding (4 pasos) | v0.1 | Datos → entrenamiento → objetivo/intensidad → resultado explicado (aceptar o ajustar a mano) |
| Hoy | v0.1 | Anillo kcal (consumido/meta/restante), barras de macros, lista por tipo de comida, botón flotante 📷 |
| Capturar | v0.1 | Cámara (`<input accept="image/*" capture="environment">`), compresión a 1024 px JPEG, nota, botones rápidos (frito/aceite/crema) |
| Revisar | v0.1 | Ingredientes editables (gramos, quitar/añadir), multiplicador ½–2×, supuestos, preguntas, confianza, tipo de comida sugerido por hora → Guardar |
| Ajustes | v0.1 | Editar perfil/objetivo (recalcula), token, versión |
| Historial | v0.2 | Calendario + promedio semanal (Recharts) |
| Favoritos / Texto | v0.2 | Repetir en un toque; registrar escribiendo |
| Peso | v0.3 | Registro y gráfica; sugerencia de gasto adaptativo |

## 9. Roadmap y milestones
### v0.1 — MVP (meta: ~1 semana; ya se usa a diario)
| # | Milestone | Entregables | Criterio de aceptación |
|---|---|---|---|
| M0 | Base del monorepo | pnpm workspaces, TS, Biome, Vitest, `wrangler.jsonc`, CI, `.gitignore`/`.dev.vars.example` | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pasan en local y en CI |
| M1 | Cálculo + esquemas | `packages/shared` completo | Pruebas reproducen el ejemplo de referencia (2,200/176/61/236 · 2,600/160/72/327 · 3,000/144/83/418) y casos de piso, Katch, IMC > 30 y avisos |
| M2 | API base | Migración `0001`, Hono, middleware de token, `/health`, `/profile` | Pruebas con D1 local: 401 sin token, PUT recalcula y persiste |
| M3 | Shell PWA + perfil | Instalable (manifest, íconos, SW), rutas, Token, Onboarding, Ajustes | En iPhone: se agrega a inicio, abre a pantalla completa, crea perfil y muestra recomendación |
| M4 | Análisis con IA | Compresión, `/analyze` con Gemini + respaldo + límite, pantalla Revisar | Pruebas con Gemini simulado (ok, 429→respaldo, JSON inválido, límite); prueba real con 3 fotos |
| M5 | Registro y Hoy | `/entries`, Guardar desde Revisar, panel Hoy, editar/borrar | Flujo foto→guardar en ≤ 3 toques; totales del día correctos |
| M6 | Despliegue + QA | `context/DEPLOY.md`, primer deploy, checklist iPhone, línea base de precisión en `context/ACCURACY.md` | App en producción usada un día completo; error medio medido con ~20 fotos |

**Estado (2026-11-04):** M0 y M1 terminados (en `develop`) · M2, M3, M4, M5: terminados en código en `feature/v0.1-api-pwa` — QA de API aprobado tras correcciones, QA de web pendiente; faltan la prueba real de Gemini con 3 fotos (M4) y las pruebas en el iPhone (M3, M5) · M6: en progreso.

### v0.2 — Rapidez y tendencias
Registro por texto · favoritos/repetir (migración `0002`) · historial con promedio semanal (`/summary`). **Aceptación:** repetir una comida en 1 toque; semana visible con promedio.

### v0.3 — Corrección de errores
Peso (migración `0003`) · gasto adaptativo (tras ≥ 14 días con ≥ 80 % de días registrados: gasto real ≈ ingesta media − (Δpeso_tendencia × 7,700 / días); propone nueva meta, nunca la cambia sola) · cola sin internet (Dexie, reintento al volver la red, idempotente por id) · exportar CSV/JSON · aviso de nueva versión. **Aceptación:** foto sin red se analiza sola al reconectar; export abre en Numbers.

### v1.0 — Completa
Código de barras (zxing + Open Food Facts) · Atajo de iOS (registro con Siri y totales a Apple Salud vía endpoint) · recordatorios (push web iOS 16.4+ o automatización de Atajos). **Aceptación:** producto empacado registrado por código; totales del día aparecen en Salud.

## 10. Estrategia de pruebas
- **Unitarias (shared):** todo el cálculo nutricional, esquemas.
- **API:** rutas con D1 local y `fetch` de Gemini simulado; nunca se llama a Gemini real en CI.
- **Web:** utilidades (compresión, cálculo de totales, multiplicador); el resto con checklist manual.
- **Checklist iPhone (cada release):** instalar, cámara, foto HEIC, sin red, token inválido, nueva versión, modo oscuro.
- **Precisión de IA:** set de ~20 fotos con calorías conocidas; meta error medio < ±25 %; resultados y versión de prompt en `context/ACCURACY.md`.

## 11. Despliegue y entornos
| Entorno | Cómo | BD |
|---|---|---|
| Local | `pnpm dev` | D1 local (`--local`) |
| Vista previa | Cada rama → URL de Workers Builds | D1 de producción (solo uso personal; se acepta) |
| Producción | Merge a `main` → Workers Builds: build `pnpm install --frozen-lockfile && pnpm build` → deploy `pnpm db:migrate:remote && npx wrangler deploy` | D1 `kalapp-db` |
Pasos únicos que hace el usuario (detallados en [`DEPLOY.md`](./DEPLOY.md); despliegue manual: `pnpm deploy:manual`, no `pnpm deploy`, que es un comando interno de pnpm): `wrangler login`, `wrangler d1 create kalapp-db` (pegar el id en `wrangler.jsonc`), `wrangler secret put GEMINI_API_KEY`, `wrangler secret put APP_TOKEN`, conectar el repo en Workers Builds, instalar en el iPhone.

## 12. Flujo de trabajo
- **Gitflow** (detalle en `CLAUDE.md`): `feature/<milestone>-<slug>` desde `develop` → merge `--no-ff` a `develop` tras QA; cada fase cierra con `release/X.Y.Z` → `main` (solo con aprobación del usuario = despliegue) y tag `vX.Y.Z`; `hotfix/*` desde `main`.
- Un commit por implementación.
- Conventional Commits; nada de secretos en commits.
- **Definición de terminado (cada milestone):** lint + typecheck + tests verdes, criterio de aceptación cumplido, `context/knowledge-graph.json` actualizado (estado del milestone, decisiones nuevas, changelog), push hecho.

## 13. Riesgos del plan y respuestas
| Riesgo | Respuesta |
|---|---|
| El nivel gratuito de Gemini se reduce | Respaldo Flash‑Lite → pago con tope de gasto (cabe en 150 MXN) |
| Precisión insuficiente | Iterar prompt con el set de ACCURACY; reforzar edición y favoritos |
| iOS limita la PWA | D1 como fuente de verdad; Atajos para Salud/recordatorios |
| El alcance crece | Nada de v0.2+ entra antes de cerrar M6 |
| Gastar tiempo en despliegue | `DEPLOY.md` paso a paso y `/api/health` para verificar |

## 14. Pendientes del usuario
1. Generar la clave de Gemini en AI Studio (no pegarla en el chat). *Estado:* el usuario la agregó como variable de entorno de la sesión en la nube, pero no estuvo disponible en la sesión del 2026-11-04; falta subirla con `wrangler secret put` y correr `pnpm test:gemini-live`.
2. Tener `wrangler` disponible (`npx wrangler login`) para los pasos únicos de M6.
3. Confirmar el nombre final (por defecto "Kalapp").
4. Crear la D1 y poner el `database_id` real en `wrangler.jsonc` (hoy es un marcador de ceros).
5. Armar el set de ~20 fotos y registrar la línea base en [`ACCURACY.md`](./ACCURACY.md).

# Kalapp — Guía de despliegue (Cloudflare, plan gratuito)

> Versión 1.2 · 2026-11-04. Para una persona que no es experta: sigue los pasos en orden.  
> Resultado: la app en `https://kalapp.<tu-subdominio>.workers.dev`, instalada en tu iPhone.  
> **Regla de oro:** tus claves y tu token **nunca** van en el repositorio, en un commit, en un chat ni en una captura de pantalla.

---

## 0. Qué necesitas (una sola vez)

| Qué | Dónde | Notas |
|---|---|---|
| Cuenta de Cloudflare (gratis) | https://dash.cloudflare.com/sign-up | El plan gratuito alcanza: Workers ~100,000 peticiones/día y D1 ~5 GB |
| Clave de Gemini | Google AI Studio → https://aistudio.google.com/apikey → "Create API key" | Gratis. Cópiala directo a tu gestor de contraseñas; no la pegues en ningún chat |
| Node 22 | https://nodejs.org (versión LTS 22) | Comprueba con `node -v` → debe empezar con `v22` |
| pnpm | `corepack enable` (viene con Node) | Comprueba con `pnpm -v` → `10.28.x` |
| El repositorio | `git clone https://github.com/The-Tito/Kalapp.git` y `cd Kalapp` | Después: `pnpm install` |

Todos los comandos de esta guía se escriben en la Terminal, **dentro de la carpeta `Kalapp`**.

---

## 1. Iniciar sesión en Cloudflare desde la terminal

```bash
npx wrangler login
```
Se abre el navegador; acepta los permisos. Para comprobar: `npx wrangler whoami` muestra tu cuenta.

---

## 2. Base de datos D1 `kalapp-db` — ya está creada

**Este paso ya se hizo.** La base `kalapp-db` se creó el 2026-11-04 en la región WNAM y su id ya está en `wrangler.jsonc`:
```jsonc
"database_name": "kalapp-db",
"database_id": "bb8a8875-29b3-4197-ad2b-0c74ffaf9806",
```
Está vacía: las tablas se crean al aplicar las migraciones (sección 3), y eso lo hace el despliegue solo. El `database_id` **no es secreto** (sin tu cuenta no sirve de nada), por eso va en el repositorio.

Para comprobar que la ves en tu cuenta: Cloudflare → *Storage & Databases* → *D1 SQL Database* → `kalapp-db`, o `npx wrangler d1 list`.

**Si prefieres usar otra base** (por ejemplo, en otra cuenta o región):
```bash
npx wrangler d1 create kalapp-db
```
Copia el `database_id` que imprime, reemplázalo en `wrangler.jsonc`, haz commit en una rama y llévalo a `main` siguiendo Gitflow (sección 11), porque Workers Builds construye desde el repositorio. Si cambias el nombre, cámbialo también en los scripts `db:migrate:*` de `package.json`.

---

## 3. Crear las tablas (migraciones remotas)

**Con Workers Builds no tienes que hacer nada aquí:** el *deploy command* de la sección 5 empieza con `pnpm db:migrate:remote`, así que cada despliegue aplica las migraciones que falten antes de publicar.

Si despliegas a mano (opción B), corre antes:
```bash
pnpm db:migrate:remote
```
Aplica, en orden, `migrations/0001_init.sql` (perfil, comidas, ingredientes, uso de IA), `0002_favorites.sql` y `0003_weights.sql`. Responde "yes" si pregunta. Es seguro repetirlo: solo aplica las que falten.

---

## 4. Guardar los secretos

Son dos: la clave de Gemini y tu token personal de la app.

### 4.1 Generar tu token (APP_TOKEN)
Debe tener **al menos 16 caracteres** (si es más corto, la API responde 500 "Servidor sin configurar" a propósito). Genera uno aleatorio:
```bash
openssl rand -base64 32
```
Copia el resultado y **guárdalo en el gestor de contraseñas del iPhone** (Ajustes → Contraseñas → "+", sitio `kalapp.<tu-subdominio>.workers.dev`). Lo vas a escribir una vez en la app y en el Atajo de iOS.

### 4.2 Subirlos a Cloudflare
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_TOKEN
```
Cada comando te pide pegar el valor (no se ve en pantalla). Si el Worker `kalapp` todavía no existe, Wrangler pregunta si quieres crearlo: responde que sí.

**Nunca** pongas estos valores en `wrangler.jsonc`, en el código, en un commit ni en un chat. Para desarrollo local van en `.dev.vars` (copia de `.dev.vars.example`, ignorado por git).

---

## 5. Desplegar

### Opción A — Workers Builds (automático, recomendado)
Cada vez que `main` cambia, Cloudflare construye y publica solo.

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository**.
2. Conecta GitHub y elige **The-Tito/Kalapp**.
3. Configura:

| Campo | Valor |
|---|---|
| Project / Worker name | `kalapp` (debe ser igual al `name` de `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `pnpm db:migrate:remote && npx wrangler deploy` |
| Builds for non-production branches | Activado: cada rama crea una **vista previa** (usa la misma D1 de producción; se acepta por ser uso personal) |

4. Guarda y espera el primer build (unos minutos). Si el build falla por la versión de Node, agrega la variable de build `NODE_VERSION = 22`.

### Opción B — Manual desde tu computadora
```bash
pnpm deploy:manual
```
`pnpm deploy:manual` aplica las migraciones remotas, construye la PWA y ejecuta `wrangler deploy`, todo en un paso. Escribe `pnpm deploy:manual` completo: `pnpm deploy` a secas es otro comando interno de pnpm y no hace lo mismo.

---

## 6. Verificar

Abre en el navegador:
```
https://kalapp.<tu-subdominio>.workers.dev/api/health
```
Debe responder `{"status":"ok","app":"Kalapp"}`. Tu subdominio aparece en Cloudflare → Workers & Pages → kalapp.

Prueba del token (opcional):
```bash
curl -H "Authorization: Bearer TU_TOKEN" https://kalapp.<tu-subdominio>.workers.dev/api/usage
```
Debe dar `{"date":"…","calls":0,"limit":60}`. Sin token o con uno incorrecto da 401.

---

## 7. Instalar en el iPhone

1. Abre la URL en **Safari** (no Chrome).
2. Toca **Compartir** (cuadro con flecha) → **Agregar a inicio** → **Agregar**.
3. Abre Kalapp desde el ícono (pantalla completa).
4. Pega tu token (desde el gestor de contraseñas) en la pantalla de token. Se guarda en el iPhone; si un día aparece "token inválido", vuelve a capturarlo.
5. Completa el onboarding (tus datos se capturan solo aquí, dentro de la app).

Cuando haya una versión nueva, la app muestra un aviso "Actualizar".

---

## 8. Atajo de iOS (Apple Salud y Siri) — resumen

El detalle paso a paso, con botones "Copiar URL" y "Copiar token", está en la app: **Ajustes → Atajo de iOS**. En resumen:
1. App Atajos → nuevo atajo "Calorías de hoy" → acción **Obtener contenido de URL** con `https://kalapp.<tu-subdominio>.workers.dev/api/shortcut/today`, método GET, encabezado `Authorization: Bearer <tu token>`.
2. Leer el diccionario de la respuesta (`kcal`, `proteinG`, `carbsG`, `fatG`, `remainingKcal`) y **Registrar muestra de salud** por cada valor.
3. Opcional: automatización diaria a las 22:00 (una vez al día para no duplicar muestras) y frase para Siri.

---

## 9. Prueba real con Gemini (opcional, recomendada tras desplegar)

Las pruebas normales nunca llaman a Gemini. Para una prueba real:
```bash
GEMINI_API_KEY=tu-clave pnpm test:gemini-live            # descripciones de texto
GEMINI_API_KEY=tu-clave pnpm test:gemini-live foto.jpg   # además, una foto tuya
```
- También lee la clave de `.dev.vars` si existe. Sin clave imprime "omitido" y termina sin error.
- En una sesión en la nube, define `GEMINI_API_KEY` como variable de entorno de la sesión en lugar de escribirla en el comando. Si Node no sale por el proxy de la sesión, agrega `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` antes de `pnpm test:gemini-live`.
- Resultado esperado (2026-11-04, texto): cada descripción tarda ≈ 10–12 s con `gemini-2.5-flash`; resultados de referencia en [`ACCURACY.md`](./ACCURACY.md#4b-primeras-pruebas-reales-texto).
- Cada ejecución consume cuota gratuita de Gemini (no del límite diario de la app).

---

## 9b. Primera prueba real

Cuando el primer despliegue termine, haz esto en orden (la lista completa del iPhone está en [`TESTING.md`](./TESTING.md)):

1. **Salud del servidor:** abre `https://kalapp.<tu-subdominio>.workers.dev/api/health` → `{"status":"ok","app":"Kalapp"}`.
2. **Instalar:** Safari → Compartir → Agregar a inicio; abre desde el ícono (pantalla completa).
3. **Token y onboarding:** pega el token y completa los 4 pasos; revisa que la recomendación tenga sentido.
4. **Una foto real:** toma una foto de comida → Analizar → en Revisar deben aparecer ingredientes con gramos, supuestos y confianza (eso solo sale de Gemini; un 503 indica problema con la clave). Para confirmar qué modelo respondió: deja `npx wrangler tail` abierto mientras analizas, o después exporta JSON (Ajustes) y mira `aiModel` de la comida (normalmente `gemini-2.5-flash`; `gemini-flash-lite-latest` si respondió el respaldo). Un análisis tarda ≈ 10–12 s. Guarda → aparece en Hoy.
5. **Cupo:** `curl -H "Authorization: Bearer TU_TOKEN" https://kalapp.<tu-subdominio>.workers.dev/api/usage` debe mostrar `calls` ≥ 1.
6. **Prueba en vivo desde la computadora:** `pnpm test:gemini-live` (sección 9) para confirmar clave y modelos, y opcionalmente con una foto.
7. Después, arma el set de ~20 fotos de [`ACCURACY.md`](./ACCURACY.md) para la línea base de precisión.

---

## 10. Problemas comunes

| Síntoma | Causa | Qué hacer |
|---|---|---|
| **401** "Token inválido o ausente" | Token mal copiado, con espacios, o cambiaste `APP_TOKEN` | Vuelve a pegar el token en la app (y en el Atajo). Distingue mayúsculas |
| **500** "Servidor sin configurar" | Falta `APP_TOKEN`, mide < 16 caracteres, o falta `GEMINI_API_KEY` | Repite la sección 4 |
| **503** "El servicio de IA no está disponible" | Gemini caído, sin cuota, modelo retirado, o clave inválida/revocada (400/401/403 → 503 directo, sin respaldo) | Espera unos minutos; si persiste, revisa la clave en AI Studio y los logs (abajo) |
| **502** "respuesta inválida" | Ambos modelos respondieron algo que no cumple el esquema | Reintenta; si se repite, revisa logs |
| **422** "No se detectó comida" | La foto o el texto no muestra comida | Toma otra foto o escribe la comida |
| **429** "Llegaste al límite diario" | Se usaron los `DAILY_ANALYZE_LIMIT` análisis del día (60 por defecto) | Se reinicia a la **medianoche de la Ciudad de México**, aunque estés en otra zona. Los rechazos (foto inválida, muy pesada, etc.) no consumen cupo |
| **413** | Foto > 1 MB o JSON > 256 KB | La app comprime sola; si pasa, toma la foto de nuevo |
| **415** | Formato no soportado | Solo JPEG, PNG o WebP (se revisa el contenido real del archivo) |
| El build de Workers Builds falla | Node distinto de 22, `pnpm-lock.yaml` desactualizado, o la D1 de `wrangler.jsonc` no es de tu cuenta | Revisa el log del build en el dashboard |

### Cambiar el límite diario o los modelos
Están en `wrangler.jsonc` → `vars` (no son secretos):
```jsonc
"GEMINI_MODEL": "gemini-2.5-flash",               // principal (desde 2026-11-04)
"GEMINI_FALLBACK_MODEL": "gemini-flash-lite-latest", // respaldo
"DAILY_ANALYZE_LIMIT": "60",
"MAX_IMAGE_BYTES": "1048576"
```
Si cambias de modelo, el `responseSchema` no debe llevar `minimum`/`maximum`/`minItems`/`maxItems`: Gemini 2.5 los rechaza con HTTP 400 ("too many states for serving"); lo vigila `schema.test.ts`.

Cambia el valor, haz commit y despliega (Workers Builds desde `main`, o `pnpm deploy:manual`). También se pueden cambiar en el dashboard (Worker → Settings → Variables), pero el siguiente despliegue los sobrescribe con lo de `wrangler.jsonc`.

### Revocar o cambiar una clave
- **Gemini:** AI Studio → API keys → borra la clave → crea otra → `npx wrangler secret put GEMINI_API_KEY`.
- **Token de la app:** genera uno nuevo (`openssl rand -base64 32`) → `npx wrangler secret put APP_TOKEN` → captúralo otra vez en la app y en el Atajo. El viejo deja de servir de inmediato.

### Ver logs en vivo
```bash
npx wrangler tail
```
Muestra errores y avisos. Si Gemini falla verás una línea `Gemini <modelo>: HTTP <status> — <mensaje>` (por ejemplo, con un 503 por saturación el mensaje habla de "high demand"); el mensaje es solo el `error.message` de Gemini, recortado y con la clave redactada como `[clave]`. Un 400 con "too many states" indica que volvieron límites al `responseSchema`. Nunca muestra tu clave ni tu token. También: dashboard → Worker → *Logs* (observabilidad activada).

---

## 11. Gitflow y producción

- **Producción = rama `main`.** Un merge a `main` despliega (Workers Builds).
- Se trabaja en `feature/*` → `develop`. Para publicar: `release/X.Y.Z` desde `develop` → merge a `main` (solo con tu aprobación) y a `develop`, con tag `vX.Y.Z`.
- Urgencias: `hotfix/X.Y.Z` desde `main`.
- Las ramas que no son `main` generan vistas previas (si las activaste en la sección 5).

# Kalapp — Reglas del proyecto

PWA personal para iPhone que estima calorías y macros desde una foto con Gemini y recomienda una meta según objetivo (déficit, recomposición, ganancia muscular). Monorepo pnpm + Cloudflare Worker (Hono) + D1 + React.

## Fuentes de verdad (leer antes de trabajar)
- `context/PLAN.md`: stack, estructura, datos, API, pantallas, roadmap y milestones M0–M6.
- `context/knowledge-graph.json`: todo el conocimiento del proyecto, en forma estructurada.
- `context/AGENTS.md`: equipo de agentes y flujo de trabajo.

Si algo en el código contradice estos documentos, **detente y repórtalo**; no lo decidas en silencio.

## Equipo multi-agente
La sesión principal es el **orquestador**. Los especialistas viven en `.claude/agents/`:

| Agente | Es dueño de (solo escribe aquí) |
|---|---|
| `shared-nutrition` | `packages/shared/**` |
| `api-worker` | `apps/api/**`, `migrations/**`, `wrangler.jsonc` |
| `web-pwa` | `apps/web/**` |
| `qa-reviewer` | archivos `*.test.ts(x)` y `fixtures/` en cualquier paquete; el resto solo lo lee |
| `context-keeper` | `context/**` |
| orquestador | archivos raíz (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.github/**`, `CLAUDE.md`, `.claude/**`) |

Flujo por milestone (detalle en `context/AGENTS.md`; se dispara con `/milestone <id>`):
1. **Plan:** el orquestador divide el milestone en tareas por dueño.
2. **Contrato primero:** `shared-nutrition` define o ajusta los esquemas Zod y los tipos.
3. **En paralelo:** `api-worker` y `web-pwa`, cada uno en sus carpetas.
4. **Verificación:** `qa-reviewer` corre lint, typecheck, tests y build, y revisa el código.
5. **Conocimiento:** `context-keeper` actualiza el KG y los documentos.
6. **Cierre:** el orquestador hace commit y push.

## Reglas para todos los agentes
- **Respeta tu carpeta.** Si necesitas un cambio fuera de ella, no lo hagas: descríbelo en tu reporte para que el orquestador lo asigne.
- **Contratos:** los tipos y esquemas compartidos viven solo en `packages/shared`; importarlos, nunca duplicarlos.
- **Secretos:** nunca escribir claves ni tokens en el código, los commits ni los documentos. Los secretos se gestionan con `wrangler secret put`; en local, `.dev.vars` (ignorado por git).
- **Datos personales:** el perfil real del usuario se captura en la app; nunca en el código ni en fixtures. Usar el ejemplo ficticio `ex:reference-male`.
- **Gemini:** nunca llamarlo de verdad en pruebas ni en CI; usar `fetch` simulado.
- **Calidad mínima** antes de reportar terminado: `pnpm lint && pnpm typecheck && pnpm test` del paquete tocado, en verde.
- **Solo el orquestador** hace commits, merges, pushes y PRs, siguiendo la sección Gitflow.
- **Idioma:** la interfaz y los documentos van en español (es-MX); los identificadores de código, en inglés.
- **Reporte final de cada agente**, siempre con esta forma:
  1. Archivos creados o modificados.
  2. Comandos ejecutados y su resultado (pegar fallos reales; no maquillar).
  3. Cambios que se necesitan fuera de tu carpeta.
  4. Decisiones o hechos nuevos para el KG.
  5. Pendientes o dudas.

## Comandos (disponibles desde M0)
```bash
pnpm install
pnpm dev            # wrangler dev (:8787) + Vite (:5173)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate:local
```

## Git: Gitflow
| Rama | Sale de | Se integra en | Para qué |
|---|---|---|---|
| `main` | — | — | Producción. Merge a `main` = despliegue (Workers Builds). Cada release lleva tag `vX.Y.Z` |
| `develop` | `main` | — | Integración: siempre en verde |
| `feature/<milestone>-<slug>` (ej. `feature/m1-nutrition-calc`) | `develop` | `develop` | Un milestone o una funcionalidad |
| `release/<X.Y.Z>` (ej. `release/0.1.0`) | `develop` | `main` y `develop` | Cerrar una fase (v0.1, v0.2…): ajustes finales, versión, changelog |
| `hotfix/<X.Y.Z>` | `main` | `main` y `develop` | Corrección urgente en producción |

Reglas:
- **Un commit por implementación:** cada pieza terminada es un commit atómico en Conventional Commits (`feat(api): …`, `fix(web): …`, `test(shared): …`, `chore: …`, `ci: …`, `docs(context): …`). Cada commit debe pasar `pnpm lint` y los tests del paquete que toca.
- Las features se integran en `develop` con `git merge --no-ff` (o con un PR si el usuario lo pide) solo después de que `qa-reviewer` apruebe y la verificación completa esté en verde.
- **`main` solo recibe `release/*` y `hotfix/*`, y únicamente con aprobación explícita del usuario**, porque despliega a producción.
- Nunca reescribir historia publicada (`push --force`) en `main` ni en `develop`.
- `claude/eager-cori-r3qu9s` fue la rama de arranque (documentación inicial); ya no se usa para desarrollo.

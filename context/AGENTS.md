# Kalapp — Equipo multi-agente y flujo de desarrollo

> Versión 1.0 · 2026-11-04. Las reglas obligatorias están en [`/CLAUDE.md`](../CLAUDE.md); las definiciones de los agentes, en [`/.claude/agents/`](../.claude/agents/); el comando que ejecuta el flujo, en [`/.claude/skills/milestone/`](../.claude/skills/milestone/SKILL.md).

## ¿Cómo se arma un equipo multi-agente en Claude Code?
Son tres piezas:
| Pieza | Archivo | Para qué |
|---|---|---|
| **Agentes** (quién) | `.claude/agents/<nombre>.md` | Cada archivo define un especialista: descripción (cuándo usarlo), herramientas, modelo e instrucciones. La sesión principal los lanza como subagentes. |
| **Reglas** (cómo) | `CLAUDE.md` en la raíz | Se carga solo en cada sesión: dueños de carpetas, reglas de calidad, secretos y formato de reporte. |
| **Flujo** (cuándo) | `.claude/skills/milestone/SKILL.md` y este documento | El comando `/milestone M1` hace que el orquestador siga los pasos. |

## El equipo
```
                       ┌──────────────────────────┐
                       │  ORQUESTADOR (sesión)    │  planea, asigna, edita
                       │  archivos raíz, commit   │  archivos raíz, commit/push
                       └────────────┬─────────────┘
        ┌──────────────┬────────────┼──────────────┬────────────────┐
        ▼              ▼            ▼              ▼                ▼
 shared-nutrition   api-worker    web-pwa      qa-reviewer     context-keeper
 packages/shared    apps/api      apps/web     *.test.ts       context/**
 (contrato+cálculo) migrations/                (verifica y     (KG y docs)
                    wrangler.jsonc              revisa)
```

| Agente | Dueño de | Entra en |
|---|---|---|
| `shared-nutrition` | `packages/shared/**` | Paso 2 (contrato primero) |
| `api-worker` | `apps/api/**`, `migrations/**`, `wrangler.jsonc` | Paso 3 (en paralelo) |
| `web-pwa` | `apps/web/**` | Paso 3 (en paralelo) |
| `qa-reviewer` | pruebas y `fixtures/`; lo demás solo lectura | Paso 4 |
| `context-keeper` | `context/**` | Paso 5 |
| Orquestador | archivos raíz, `.github/`, `CLAUDE.md`, `.claude/` | Pasos 1 y 6 |

**Por qué carpetas exclusivas:** dos agentes en paralelo nunca editan el mismo archivo, así que no hay conflictos ni trabajo pisado. Y los contratos en `packages/shared` permiten que la API y la web avancen al mismo tiempo sin esperarse.

## Flujo por milestone
1. **Planear** (orquestador): lee el milestone en `PLAN.md` y lo divide en encargos por dueño.
2. **Contrato primero** (`shared-nutrition`): esquemas Zod, tipos y cálculo.
3. **Implementar en paralelo** (`api-worker` y `web-pwa`).
4. **Verificar** (`qa-reviewer`): lint, typecheck, tests, build y revisión de código. Si los cambios no pasan, vuelven al dueño (máximo 3 vueltas).
5. **Registrar conocimiento** (`context-keeper`): KG, PLAN y documentos de apoyo.
6. **Cerrar** (orquestador): verificación final, commit, push y resumen al usuario.

Cada agente termina con el **reporte de 5 puntos**: archivos, comandos y resultados, cambios fuera de su carpeta, hechos o decisiones para el KG, y pendientes.

## Dónde gana velocidad (y dónde no)
| Milestone | Paralelismo | Modo sugerido |
|---|---|---|
| M0 Base del monorepo | Bajo: todo son archivos raíz | Orquestador solo, más `qa-reviewer` |
| M1 Cálculo y esquemas | Ninguno: solo `shared` | `shared-nutrition` → `qa-reviewer` |
| M2 API base | Bajo | `api-worker` → `qa-reviewer` (`web-pwa` puede adelantar el shell de M3) |
| M3 Shell PWA y perfil | Medio | `web-pwa` en paralelo con `api-worker` (ajustes de `/profile`) |
| M4 Análisis con IA | **Alto** | `shared` → (`api-worker` ∥ `web-pwa`) → QA |
| M5 Registro y Hoy | **Alto** | `shared` → (`api-worker` ∥ `web-pwa`) → QA |
| M6 Despliegue y QA | Bajo | Orquestador, `context-keeper` (DEPLOY.md) y el usuario |

**Límites honestos:**
- Cada subagente arranca sin memoria de la conversación. Por eso los encargos deben ser autosuficientes y apoyarse en `/context`.
- Lanzar agentes para tareas pequeñas cuesta más tiempo y tokens de lo que ahorra; en esos casos el orquestador lo hace directo.
- El paralelismo real aparece en M3–M5 y en la v0.2 en adelante.

## Cómo usarlo
```text
/milestone M0
```
También puedes pedirlo en lenguaje natural ("ejecuta el milestone M1 con el equipo").

## Cambiar el equipo
- **Agregar un agente:** crea `.claude/agents/<nombre>.md`, asígnale una carpeta exclusiva en la tabla de `CLAUDE.md` y documéntalo aquí y en el KG.
- **Cambiar el modelo de un agente:** edita su campo `model`. Hoy todos usan `inherit`, es decir, el mismo modelo de la sesión.

## Nota operativa
Los agentes de `.claude/agents/` se cargan **al iniciar una sesión**. En la sesión donde se crean (o si no aparecen como tipo), el orquestador lanza un agente general con la instrucción "actúa como `<agente>`: lee y sigue `.claude/agents/<agente>.md`". El resultado es el mismo.

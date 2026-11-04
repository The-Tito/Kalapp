# /context — Base de conocimiento de Kalapp

Esta carpeta guarda **todo el conocimiento del proyecto**: requisitos, investigación, decisiones, riesgos, arquitectura, modelo de datos, cálculo nutricional, despliegue y roadmap. Es la referencia que se consulta antes de programar y se actualiza cuando algo cambia.

## Archivos

| Archivo | Contenido |
|---|---|
| `knowledge-graph.json` | Grafo de conocimiento (KG) con toda la información del proyecto |
| `README.md` | Este archivo: cómo está organizada la carpeta y cómo usar el grafo |
| `PLAN.md` | Plan completo del proyecto: stack, estructura, datos, API, pantallas, roadmap con milestones, pruebas, despliegue y flujo de trabajo |
| `AGENTS.md` | Equipo multi-agente, dueños de carpetas y flujo por milestone |
| `DEPLOY.md` | Guía de despliegue paso a paso en Cloudflare (plan gratuito): D1, migraciones, secretos, Workers Builds, iPhone, Atajo, problemas comunes |
| `PROMPTS.md` | Versiones del prompt de Gemini (actual: v1), configuración de la petición y política de respaldo de modelo |
| `ACCURACY.md` | Protocolo del set de ~20 fotos, fórmula del error medio y tabla de resultados (aún sin mediciones) |
| *(futuros `.md`)* | Documentos de apoyo: guías, decisiones detalladas, notas, etc. |

## Estructura del grafo (`knowledge-graph.json`)

```jsonc
{
  "metadata":        { ... },  // proyecto, fechas, rama, convenciones de ids y cómo actualizar
  "nodes":           [ ... ],  // entidades: { id, type, label, properties }
  "edges":           [ ... ],  // relaciones: { source, type, target, note? }
  "conversation_log":[ ... ],  // qué pidió el usuario en cada paso y qué se decidió
  "changelog":       [ ... ]   // historial de cambios del grafo
}
```

### Tipos de nodo (prefijo del `id`)

| Prefijo | Tipo | Ejemplos |
|---|---|---|
| `proj:` | Proyecto | `proj:kalapp` |
| `req:` | Requisito del usuario | `req:three-goals`, `req:profile-in-app` |
| `con:` | Restricción | `con:budget` (150 MXN) |
| `fact:` | Hecho investigado | `fact:apple-dev-fee`, `fact:gemini-free-tier` |
| `opt:` | Opción evaluada | `opt:pwa-gemini` (elegida) |
| `app:` | App existente de referencia | `app:snapcalorie`, `app:cal-ai` |
| `dec:` | Decisión | `dec:monorepo`, `dec:single-worker` |
| `doc:` | Documento de /context | `doc:plan` |
| `ms:` | Milestone de una fase | `ms:m0` … `ms:m6` |
| `agent:` | Agente del equipo | `agent:api-worker` |
| `risk:` | Riesgo y su mitigación | `risk:hidden-fats`, `risk:api-key-leak` |
| `feat:` | Funcionalidad | `feat:photo-logging`, `feat:goal-recommendation` |
| `ux:` | Regla de experiencia | `ux:three-taps` |
| `phase:` | Fase del roadmap | `phase:v0.1` … `phase:v1.0` |
| `tech:` | Tecnología | `tech:react`, `tech:cf-d1`, `tech:gemini` |
| `svc:` | Cuenta / servicio externo | `svc:cloudflare` |
| `budget:` | Partida de presupuesto | `budget:total` |
| `deploy:` | Paso de despliegue | `deploy:secrets` |
| `comp:` | Componente de arquitectura | `comp:client`, `comp:worker` |
| `api:` | Endpoint | `api:analyze` |
| `table:` | Tabla de D1 (con columnas) | `table:profile` |
| `schema:` | Contrato de datos | `schema:analysis-proposal` |
| `calc:` | Fórmula / regla nutricional | `calc:mifflin`, `calc:safety-floor` |
| `act:` | Nivel de actividad | `act:moderate` (×1.55) |
| `goal:` | Objetivo nutricional | `goal:deficit`, `goal:recomp`, `goal:gain` |
| `ex:` | Ejemplo trabajado / caso de prueba | `ex:reference-male` |
| `repo:` | Carpeta del repositorio | `repo:apps-web` |
| `sec:` | Seguridad / privacidad | `sec:secrets` |
| `metric:` | Métrica de éxito | `metric:accuracy` |
| `task:` | Pendiente | `task:start-v0.1` |
| `src:` | Fuente de investigación | `src:apple-memberships` |

### Relaciones más usadas

`HAS_REQUIREMENT`, `SATISFIES`, `SELECTS`, `DISCARDED_BECAUSE`, `MITIGATES` / `MITIGATED_BY`, `IN_PHASE`, `PRECEDES`, `USES`, `CALLS`, `IMPLEMENTED_IN`, `READS` / `WRITES` / `READS_WRITES`, `BUILT_WITH`, `RUNS_ON`, `CONTAINS`, `DEPLOYS`, `SUPERSEDED_BY`, `SOURCED_FROM`, `RECORDS` (milestone → decisión), `CLOSES` (decisión o documento que cierra una `task:`).

## Reglas para mantenerlo

1. **No borrar conocimiento.** Si algo se reemplaza, marcar el nodo viejo con `"status": "superseded"` y crear una arista `SUPERSEDED_BY` hacia el nuevo.
2. Toda arista debe apuntar a `id`s que existan (sin nodos huérfanos).
3. Al cambiar algo: actualizar `metadata.updated_at` y añadir una entrada en `changelog` (y en `conversation_log` si viene de una petición nueva).
4. **Nunca guardar secretos** (claves de API, tokens) ni datos personales del usuario: el perfil real se captura dentro de la app.

## Consultas rápidas (ejemplos con `jq`)

```bash
jq '.nodes[] | select(.type=="Risk") | {label, mitigation: .properties.mitigation}' context/knowledge-graph.json
```

```bash
jq '[.edges[] | select(.type=="IN_PHASE" and .target=="phase:v0.1") | .source]' context/knowledge-graph.json
```

```bash
jq '.nodes[] | select(.id=="goal:deficit")' context/knowledge-graph.json
```

```bash
jq '.nodes[] | select(.type=="Milestone") | {id, status: .properties.status}' context/knowledge-graph.json
```

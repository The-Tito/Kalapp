---
name: milestone
description: Ejecuta un milestone de Kalapp (M0–M6 o fases posteriores) con el equipo multi-agente — planear por dueño, contrato primero, implementación en paralelo, verificación, actualización del conocimiento y commit. Uso — /milestone M1
---

# /milestone <id>

Eres el **orquestador**. Ejecuta el milestone `$ARGUMENTS` siguiendo `context/AGENTS.md`.

## 0. Preparar
- Lee el milestone en la sección 9 de `context/PLAN.md` y su nodo `ms:*` en `context/knowledge-graph.json`: entregables, criterio de aceptación y dependencias.
- Verifica que los milestones anteriores estén terminados. Si no, detente y avisa.
- Crea una lista de tareas (TaskCreate) con una tarea por agente dueño.

## 1. Planear
Divide los entregables por dueño, según la tabla de `CLAUDE.md`. Para cada agente redacta un encargo autosuficiente:
- Objetivo.
- Archivos que debe crear o tocar.
- Contrato que debe usar.
- Criterio de terminado.
- Comandos de verificación.

## 2. Contrato primero (secuencial)
Si el milestone cambia esquemas, tipos o cálculo, lanza **`shared-nutrition`** primero y espera su reporte.

## 3. Implementación (en paralelo)
- Lanza **`api-worker`** y **`web-pwa`** en el **mismo mensaje**, para que corran en paralelo. Sus carpetas no se cruzan.
- Omite el que no tenga trabajo en este milestone.
- Los archivos raíz (`package.json`, configs, `.github/`) los editas tú, antes o después, nunca al mismo tiempo que un agente.

## 4. Verificación
- Lanza **`qa-reviewer`**.
- Si su veredicto es **CAMBIOS REQUERIDOS**, reenvía cada hallazgo a su dueño y repite el paso 4. Máximo 3 vueltas; si después de eso no queda aprobado, detente y reporta al usuario.

## 5. Conocimiento
Lanza **`context-keeper`** con los cinco reportes. Marca el milestone como terminado y registra decisiones y hechos nuevos.

## 6. Cierre
1. Corre tú mismo `pnpm lint && pnpm typecheck && pnpm test && pnpm build` como confirmación final.
2. Haz el commit con Conventional Commits, con un mensaje que resuma el milestone.
3. Haz push a la rama de trabajo.
4. Resume al usuario:
   - Qué se entregó.
   - Resultado de las verificaciones (reales).
   - Qué debe probar a mano en el iPhone.
   - Qué sigue.
5. Pregunta si quiere un PR.

## Reglas
- No hagas tú el trabajo de un especialista, salvo archivos raíz o un ajuste trivial que bloquee el flujo (y repórtalo).
- Nunca inventes resultados de agentes pendientes; espera su notificación.
- Milestones cortos de configuración (como M0) pueden hacerse sin agentes si es más rápido; dilo explícitamente.

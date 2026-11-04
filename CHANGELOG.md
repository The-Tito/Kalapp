# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [1.0.0] — 2026-11-04

Primera versión completa de Kalapp: PWA personal para iPhone que estima calorías y macros desde una foto (o texto) con Gemini y recomienda una meta según tu objetivo.

### Agregado
- **Perfil y meta**: onboarding de 4 pasos; recomendación por objetivo (déficit, recomposición, ganancia muscular) con Mifflin‑St Jeor / Katch‑McArdle, piso de seguridad, proteína con peso ajustado si IMC > 30, avisos (incluido "déficit no posible") y explicación paso a paso; meta manual opcional.
- **Registro**: foto (cámara o galería, compresión a ≤ 1 MB), texto libre, favoritos, código de barras (Open Food Facts; escáner o captura manual) y edición en Revisar (gramos, ½×–2×, agregar/quitar ingredientes, supuestos y preguntas de la IA); registro en días pasados.
- **Seguimiento**: panel Hoy (anillo de calorías y macros por comida), Historial 7/30/90 días con promedio de días registrados, Peso con tendencia de 7 días y **gasto adaptativo** (28 días) con meta sugerida.
- **Sin conexión**: cola en el iPhone para fotos, textos y comidas; se procesa sola al volver el internet.
- **Exportar** CSV (Numbers/Excel, con protección contra fórmulas) y JSON; **Atajo de iOS** para Apple Salud, Siri y recordatorios.
- **API** en un solo Cloudflare Worker (Hono + D1): token Bearer en tiempo constante, límites de cuerpo, firma real de imagen, cupo diario atómico, modelo de respaldo, errores con forma estándar, cabeceras de seguridad.
- **Seguridad de la PWA**: CSP sin `unsafe-eval`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, permisos solo de cámara; aviso de nueva versión del service worker.
- **Calidad**: 736 pruebas (shared 177, API 261, web 298) incluidas suites adversariales; CI en GitHub Actions.
- **Conocimiento**: `/context` con grafo de conocimiento, plan, guías de despliegue, pruebas, prompts y precisión; equipo multi‑agente en `.claude/`.

### Pendiente (fuera del código)
- Despliegue en Cloudflare y secretos (`context/DEPLOY.md`).
- Medición real de precisión con Gemini (`context/ACCURACY.md`) y checklist en iPhone real (`context/TESTING.md`).

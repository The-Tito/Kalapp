# Kalapp — Precisión de la IA

> Versión 1.1 · 2026-11-04. Métrica `metric:accuracy` del KG. Meta: **error medio absoluto < ±25 %** en kcal.  
> **Estado (v1.0.0 lista en código, 2026-11-04): aún no hay mediciones reales.** La app está terminada en código pero no desplegada; la medición empieza tras la "Primera prueba real" de [`DEPLOY.md`](./DEPLOY.md). En la sesión de desarrollo no había clave de Gemini, así que todo se probó con Gemini simulado. La línea base se mide en M6, después del primer despliegue.

## 1. Cómo armar el set (~20 fotos)

Elige comidas cuyas calorías **ya conoces** con buena precisión:
- **Productos con etiqueta** (yogur, barra, sándwich empacado, refresco): kcal de la etiqueta × porciones comidas.
- **Comida pesada en báscula de cocina**: pesa cada ingrediente (en gramos, como se va a comer) y calcula las kcal con la etiqueta o una tabla confiable (por ejemplo, la base del SMAE o la de USDA). Anota también el aceite que usaste (pesa la botella antes y después, o mide con cuchara).
- **Restaurantes con información nutricional publicada** (cadenas).

Que el set se parezca a lo que comes de verdad. Reparto sugerido:
| Tipo | Cuántas |
|---|---|
| Platillos mexicanos caseros (tacos, chilaquiles, guisado con arroz y frijoles, quesadillas) | 6 |
| Comida con aceite, crema o queso visibles/ocultos | 4 |
| Empacados con etiqueta | 4 |
| Bebidas (agua fresca, refresco regular y light, café con leche) | 3 |
| Desayunos / colaciones (pan dulce, fruta, huevo) | 3 |

Reglas para la foto: luz natural, el plato completo a la vista, desde arriba o a 45°, con un objeto de referencia (tenedor, mano, tortilla). Una foto por comida, sin nota (o con la nota que pondrías normalmente; regístrala).

## 2. Qué registrar por foto
- Fecha, número de foto, descripción breve.
- **kcal reales** (y cómo se obtuvieron: etiqueta / báscula / restaurante).
- **kcal estimadas** por Kalapp **antes de editar** y el modelo que respondió (`aiModel`).
- Confianza general que dio la IA.
- Versión del prompt (`PROMPT_VERSION`, hoy `1`) — ver [`PROMPTS.md`](./PROMPTS.md).
- Notas: qué falló (porción, aceite, bebida, platillo mal identificado).

## 3. Fórmula

Error por foto:  `error_i % = |estimado_i − real_i| / real_i × 100`

**Error medio absoluto (MAPE):**  `MAPE = (1/n) × Σ error_i %`

También conviene anotar el **sesgo** (con signo): `(1/n) × Σ (estimado_i − real_i) / real_i × 100`. Si es negativo, la IA subestima (lo común con aceites y salsas); en déficit eso importa más que el error al azar.

**Meta:** MAPE < 25 %. Si no se cumple: ajustar el prompt (nueva versión en `PROMPTS.md`), repetir el mismo set y comparar.

## 4. Resultados

### Corridas
| Fecha | Versión del prompt | Modelo | n | MAPE % | Sesgo % | ¿Cumple < 25 %? | Notas |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | Sin mediciones todavía |

### Detalle por foto (corrida actual)
| # | Comida | kcal reales | Fuente | kcal estimadas | Modelo | Confianza | Error % | Notas |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

## 5. Prueba rápida (antes del set completo)
`GEMINI_API_KEY=… pnpm test:gemini-live foto.jpg` ejecuta el mismo código del Worker contra Gemini real y muestra la propuesta. Sirve para verificar que la clave y los modelos funcionan (criterio de M4: prueba real con 3 fotos); **no sustituye** la medición del set. Detalle en [`DEPLOY.md`](./DEPLOY.md#9-prueba-real-con-gemini-opcional-recomendada-tras-desplegar).

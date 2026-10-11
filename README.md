# Analizador de ofertas

Agente de IA en TypeScript que compara una oferta de trabajo con una hoja de vida. Para cada requisito de la oferta dice si el candidato lo cumple, **con la cita literal de la hoja de vida que lo prueba**, calcula el porcentaje de encaje y sugiere qué destacar en la postulación.

Construido con **LangChain.js v1** (`createAgent`), **Claude** (Anthropic), **Zod** para la salida estructurada y **Vitest** para pruebas y evaluación.

## El problema que resuelve

Adaptar la hoja de vida a cada vacante funciona, pero toma tiempo. Pedirle a un modelo de lenguaje "¿encajo en esta oferta?" es rápido, pero el modelo tiende a ser optimista: puede decir que alguien sabe Node.js porque sabe Next.js. Una respuesta así hace que te postules con información falsa.

Este agente está diseñado para **no inventar**:

1. **Cada requisito se busca en la hoja de vida** con la herramienta `buscar_en_hoja_de_vida` antes de decidir.
2. **La evidencia se verifica en código.** Si el modelo marca un requisito como cumplido y la cita no aparece literalmente en la hoja de vida, el requisito pasa a "no cumple" y se avisa.
3. **El encaje lo calcula el código, no el modelo**: los requisitos obligatorios pesan el doble que los deseables y un cumplimiento parcial vale la mitad.
4. Las palabras clave "faltantes" que sugiere el modelo se revisan contra la hoja de vida y se descartan las que sí aparecen.

```
oferta + hoja de vida ──> agente (Claude) ──> buscar_en_hoja_de_vida ──> análisis (Zod)
                                ▲                      │                       │
                                └── líneas literales ──┘                       ▼
                                          verificación en código: evidencia real + encaje calculado
```

## Requisitos

- Node.js 20 o superior
- Una API key de Anthropic ([console.anthropic.com](https://console.anthropic.com/settings/keys))

## Instalación

```bash
npm install
cp .env.example .env   # luego edita .env y pon tu ANTHROPIC_API_KEY
```

## Uso

Copia el texto de la oferta (de Get on Board, LinkedIn, etc.) en un archivo `.txt` y pásalo junto con tu hoja de vida en PDF o texto:

```bash
npm run analizar -- ofertas/fullstack-logistica.txt ejemplos/hoja-de-vida-laura.txt
```

Salida (resumida):

```
Full Stack Developer — Rutaviva
Encaje: 31 %

Requisitos obligatorios:
  ~ 4 años o más de experiencia en desarrollo web  ← "Desarrolladora Frontend — Tiendas Aurora (comercio electrónico) · mar. 2024 – actualidad"
  ✘ Backend con Node.js (Express o NestJS)
  ✘ Bases de datos relacionales, en especial PostgreSQL
  ✔ Frontend con React  ← "Construí el catálogo y el carrito de compras con React, TypeScript y Redux Toolkit."
  ✘ Contenedores con Docker

Palabras clave de la oferta que no están en tu hoja de vida: Node.js, Express, NestJS, PostgreSQL, Docker, AWS, React Native

Advertencias:
  - No aparece ninguna base de datos relacional ni PostgreSQL. Firebase/Firestore es NoSQL y no lo sustituye.
```

El JSON completo queda en `salidas/`.

## Pruebas y evaluación

```bash
npm test               # pruebas sin IA: búsqueda, verificación de evidencias, encaje y puntaje (no gastan créditos)
npm run evaluar -- 3   # corre el agente 3 veces por oferta y mide aciertos e invenciones
```

La evaluación compara la salida del agente con lo que debería concluir para cada requisito, escrito a mano en `casos/<oferta>.json`. Cuando hay una ambigüedad real (la candidata tiene unos 3 años y la oferta pide 4) se acepta más de una respuesta, pero **nunca "cumple" si no se cumple**.

La métrica más importante es **invenciones**: cuántas veces el agente dijo "cumple" sobre algo que la hoja de vida no prueba.

### Resultados

4 ofertas pensadas con trampas (Next.js no es Node.js, Firebase no es PostgreSQL, B1 no es C1, React no es React Native, una oferta de diseño para una desarrolladora) contra la hoja de vida de ejemplo. Modelo `claude-sonnet-5-5`, 3 intentos por oferta.

| Oferta | Requisitos bien clasificados | Invenciones | Encaje |
| --- | --- | --- | --- |
| frontend-fintech | 100 % | 0 | 93–96 % |
| fullstack-logistica | 100 % | 0 | 31 % |
| ai-engineer | 100 % | 0 | 18 % |
| disenador-ux | 100 % | 0 | 22 % |

**Qué cambió y por qué.** La primera evaluación dio 81 de 84 requisitos bien clasificados y 0 invenciones. Los 3 errores eran el mismo en los 3 intentos: en la oferta de AI Engineer marcaba "Integración con APIs de LLM" como **parcial** porque la hoja de vida menciona "consumo de API REST". No es una invención, pero sí una lectura engañosa. Se precisó en las instrucciones qué cuenta como parcial (la misma habilidad a menor nivel o una tecnología hermana, nunca una experiencia general). Después del cambio: 84 de 84.

**Con cautela:** son 4 ofertas y una hoja de vida ficticias, escritas para esta evaluación por la misma persona que escribió el agente. La verificación de evidencias no rechazó nada en estas corridas: el modelo citó bien. Está para cuando no lo haga, y tiene sus propias pruebas en `tests/verificar.test.ts`.

## Estructura

```
src/
  agente.ts       crea el agente (modelo, herramienta, instrucciones, esquema)
  hojaDeVida.ts   normalización, búsqueda en la hoja de vida + herramienta para el agente
  verificar.ts    rechaza evidencias inventadas y calcula el encaje
  esquema.ts      forma del JSON de salida (Zod)
  documentos.ts   lee PDF o texto
  puntaje.ts      compara la salida con lo esperado
  analizar.ts     comando para una oferta
  evaluar.ts      comando de evaluación
ofertas/          ofertas de ejemplo (empresas ficticias)
casos/            lo que el agente debería concluir, escrito a mano
ejemplos/         hoja de vida de ejemplo (persona ficticia)
tests/            pruebas con Vitest
```

## Límites conocidos

- La oferta se pega como texto; no descarga ofertas desde una URL.
- PDFs escaneados (imágenes) no tienen texto.
- Los años de experiencia los calcula el modelo a partir de las fechas; con fechas ambiguas puede equivocarse.
- La evaluación usa datos ficticios; falta medir con ofertas y hojas de vida reales.

## Configuración

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic | (obligatoria) |
| `ANTHROPIC_MODEL` | Modelo de Claude a usar | `claude-sonnet-5-5` |

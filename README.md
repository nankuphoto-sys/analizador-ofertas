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

## Buscar ofertas automáticamente

```bash
npm run buscar -- mi-hoja-de-vida.pdf               # busca, filtra y analiza las 5 mejores
npm run buscar -- mi-hoja-de-vida.pdf --analizar=0  # solo el filtro, sin gastar créditos
```

Busca en varias fuentes (carpeta `src/fuentes/`) y trabaja en dos pasadas para no gastar de más:

| Fuente | Cómo se consulta | Notas |
| --- | --- | --- |
| Get on Board (`getonbrd`) | [API pública](https://www.getonbrd.com/api/v0), una búsqueda por palabra clave | Trae el nivel (junior, semi senior...) y los países. |
| Remotive (`remotive`) | [API pública](https://remotive.com/api/remote-jobs), **una sola petición** por búsqueda | No publica el nivel: se deduce del título. Las ofertas llegan con 24 h de retraso y el reporte nombra a Remotive como fuente, como piden sus condiciones. Pide no consultarla más de 4 veces al día. **La API gratuita devuelve solo 10 ofertas**, así que aporta poco. |
| Greenhouse (`greenhouse`) | [API pública de tableros](https://developers.greenhouse.io/job-board.html), una petición por empresa | Lee las empresas de `greenhouse-empresas.json` (hoy 7 con vacantes en Colombia o Latinoamérica). El nivel se deduce del título y la fecha es la de primera publicación (usa `--dias=90` para ver vacantes más antiguas que siguen abiertas). |

1. **Filtro sin IA:** se queda con ofertas **junior o sin experiencia** (y semi senior o sin nivel indicado si hay pocas), publicadas en los últimos 30 días, que se pueden postular desde Colombia (remoto, o híbrido/presencial en Colombia). Descarta títulos senior o de liderazgo, cargos que no son de desarrollo y ofertas con menos de 2 tecnologías de tu stack. Ordena por qué parte de la tecnología que piden aparece en tu hoja de vida, con un extra para las junior.
2. **Análisis con IA:** solo las mejores pasan por el analizador (`--analizar=N`).

El reporte queda en `salidas/busqueda-AAAA-MM-DD-HHMM.md` (con la hora, para no pisar una búsqueda anterior del mismo día) con enlaces, nivel, ubicación, salario, encaje y qué te falta en cada una.

Opciones: `--dias=60`, `--solo-junior`, `--consultas="react,node,typescript"`, `--sin-cache`, `--fuentes=getonbrd,remotive,greenhouse` (por defecto todas; por ejemplo `--fuentes=getonbrd,greenhouse` para no tocar Remotive), `--sin-ingles`, `--sin-ingles=estricto` y `--en-dolares` (ver abajo).

#### Sin inglés y pago en dólares

El reporte muestra dos columnas, **Pago** (USD, COP o no dice) e **Inglés** (lo piden, deseable, no hace falta, oferta en inglés o no lo dice), deducidas del texto de cada oferta. Dos opciones las vuelven filtros:

- `--sin-ingles`: quita las ofertas que piden inglés. Las que lo marcan como deseable o no lo mencionan se quedan.
- `--sin-ingles=estricto`: además quita las que están **escritas en inglés** aunque no lo mencionen, porque se espera que lo manejes. Casi todo lo de Remotive y Greenhouse queda fuera con esta opción; Get on Board, que publica en español, es donde más queda.
- `--en-dolares`: deja solo las que dicen pagar en dólares (salario en USD, «USD» o «dólares» en el texto). Get on Board y Remotive publican el salario en dólares; si una oferta no dice cuánto pagan, no entra con esta opción.

```bash
npm run buscar -- mi-hoja-de-vida.pdf --sin-ingles --en-dolares --analizar=0
```

Son pistas, no garantías: una oferta que no menciona el inglés puede hacer la entrevista en inglés, y una que no dice el salario puede pagar en dólares. Confírmalo en la oferta antes de postular. El código está en `src/requisitos.ts`.

Para sumar otra empresa de Greenhouse, agrega su `token` (el nombre al final de `job-boards.greenhouse.io/<token>`) a `greenhouse-empresas.json`. Para sumar otro sitio: crea `src/fuentes/<nombre>.ts` que exporte un `Fuente` (ver `src/fuentes/tipos.ts`), con pruebas, y agrégala a `src/fuentes/index.ts`. Usa solo APIs o feeds oficiales. LinkedIn no se consulta: sus reglas prohíben el acceso automatizado.

### Equipo de agentes (Claude Code)

El proyecto incluye un equipo de subagentes y tres comandos para Claude Code en `equipo-agentes/`. Para activarlos, cópialos a `.claude/` (una sola vez, desde la raíz del proyecto):

```bash
xcopy equipo-agentes .claude /E /I /Y
```

El equipo tiene un jefe, `analizador-ofertas`: corre la búsqueda y el análisis, decide qué miembro trabaja y es el único que habla contigo. Los otros cuatro solo le responden a él, y todo lo irreversible (cambiar código, conectar o quitar fuentes, marcar ofertas, postularse) pasa por tu aprobación. Para trabajar directamente con el jefe:

```bash
claude --agent analizador-ofertas
```

Quién decide qué y qué puede tocar cada uno: [docs/jerarquia-agentes.md](docs/jerarquia-agentes.md). Cómo se pasan información el jefe y los miembros (formato de encargo y de entrega, archivos compartidos): [docs/comunicacion-agentes.md](docs/comunicacion-agentes.md). A qué tiene acceso cada uno y cómo se hace cumplir: [docs/permisos-agentes.md](docs/permisos-agentes.md).

Los comandos también ponen a la sesión en el papel de jefe. En Claude Code dentro de este proyecto:

| Comando | Qué hace |
| --- | --- |
| `/buscar-ofertas <hoja-de-vida>` | Corre la búsqueda, resume las mejores y, si escoges alguna, prepara los borradores de postulación (`preparador-postulacion`). Nunca envía nada. |
| `/nuevas-plataformas <enfoque>` | `explorador-plataformas` busca y evalúa plataformas nuevas (acceso, condiciones de uso, cobertura) y tú decides cuáles conectar. |
| `/afinar-prefiltro` | `afinador-prefiltro` revisa tus decisiones (`memoria/`) y propone ajustes al filtro, con su prueba, para que los apruebes. |

`auditor-fuentes` entra solo cuando una fuente falla o devuelve 0 ofertas.

### Límite de gasto

Cada análisis cuesta dinero en la API de Anthropic, así que el gasto tiene topes:

- **Por día y por mes**, en `.env`: `LIMITE_USD_DIA=2` y `LIMITE_USD_MES=20` (dólares). Antes de cada análisis se revisa que lo gastado más lo que suele costar uno no pase el límite; si no cabe, no se analiza.
- **Por corrida**: máximo 25 análisis por búsqueda, y la evaluación acepta de 1 a 5 repeticiones y no empieza si no le alcanza el presupuesto.
- **Por análisis**: tope de tokens, de pasos del agente, de tiempo (3 minutos) y de largo de los textos.

La búsqueda y `npm run analizar` muestran cuánto costó cada análisis y cuánto llevas hoy. Pon también un límite mensual en la consola de Anthropic (*Settings → Limits*): es el único tope que no se puede saltar. Detalle: [docs/limite-de-gasto.md](docs/limite-de-gasto.md).

### Memoria entre búsquedas

La búsqueda recuerda, en `memoria/memoria.json` (local, ignorado por git):

- **Qué ofertas ya viste**: el reporte marca con 🆕 las nuevas desde la última búsqueda.
- **Tus decisiones**: las ofertas a las que te postulaste o que descartaste no vuelven a salir.
- **Los análisis ya hechos**: no se pagan dos veces. Se vuelven a pedir solos si cambia tu hoja de vida, el prompt o el modelo.

```bash
npm run oferta -- <id> postulada              # o descartada, guardada; el id sale en el reporte
npm run oferta -- <id> descartada --motivo="no es remoto de verdad"
npm run oferta -- --lista                     # historial (--estado=postulada para filtrar)
npm run olvidar -- --cache                    # borra los análisis guardados; también --oferta=<id> o --todo
```

Qué se guarda, qué no y por qué: [docs/memoria.md](docs/memoria.md).

Lo que se encontró al usarlo (octubre 2026): de ~550 ofertas de desarrollo en Get on Board, **solo 1 era junior** y se podía postular desde Colombia en los últimos 30 días; casi todo es semi senior o senior. Por eso el filtro completa con semi senior en vez de devolver una lista vacía.

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
| frontend-fintech | 100 % | 0 | 93 % |
| fullstack-logistica | 100 % | 0 | 30–35 % |
| ai-engineer | 100 % | 0 | 8 % |
| disenador-ux | 100 % | 0 | 30 % |

**Qué cambió y por qué.** La primera evaluación dio 81 de 84 requisitos bien clasificados y 0 invenciones. Los 3 errores eran el mismo en los 3 intentos: en la oferta de AI Engineer marcaba "Integración con APIs de LLM" como **parcial** porque la hoja de vida menciona "consumo de API REST". No es una invención, pero sí una lectura engañosa. Se precisó en las instrucciones qué cuenta como parcial (la misma habilidad a menor nivel o una tecnología hermana, nunca una experiencia general). Después del cambio: 84 de 84.

**Instrucciones sin ambigüedad (noviembre 2026).** Se reescribieron las 10 reglas del prompt para que cada una tenga una sola lectura: qué cuenta como un requisito (uno por cosa comprobable; las alternativas con "o" son uno solo), una lista cerrada de señales de "deseable", hasta 2 búsquedas extra solo con otras formas de escribir lo mismo, los tres únicos casos de "parcial", cómo sumar años (periodos solapados una vez, redondeo hacia abajo), idiomas comparados en la escala MCER y una evidencia obligatoria también en "parcial". La clasificación siguió en 84 de 84 con 0 invenciones. El encaje sí cambió: ai-engineer bajó de 18 % a 8 % (lo más probable es la regla de idiomas: pide inglés C1 y la hoja de vida dice B1, dos niveles abajo, que antes el prompt ponía como ejemplo de "parcial" y ahora es "no cumple"), y disenador-ux subió de 22 % a 30 % (no se revisó requisito por requisito qué lo movió). También quedó más estable entre intentos: frontend-fintech pasó de 93–96 % a 93 % en los tres.

**Con cautela:** son 4 ofertas y una hoja de vida ficticias, escritas para esta evaluación por la misma persona que escribió el agente. La verificación de evidencias no rechazó nada en estas corridas: el modelo citó bien. Está para cuando no lo haga, y tiene sus propias pruebas en `tests/verificar.test.ts`.

## Estructura

```
src/
  fuentes/        una fuente por sitio (getonbrd, remotive, greenhouse) y su registro; ver tipos.ts
  agente.ts       crea el agente (modelo, herramienta, instrucciones, esquema)
  hojaDeVida.ts   normalización, búsqueda en la hoja de vida + herramienta para el agente
  verificar.ts    rechaza evidencias inventadas y calcula el encaje
  esquema.ts      forma del JSON de salida (Zod)
  documentos.ts   lee PDF o texto
  puntaje.ts      compara la salida con lo esperado
  requisitos.ts   deduce si piden inglés y si pagan en dólares (filtros --sin-ingles y --en-dolares)
  analizar.ts     comando para una oferta
  evaluar.ts      comando de evaluación
equipo-agentes/   subagentes y comandos de Claude Code; se copian a .claude/ (ver README)
greenhouse-empresas.json  empresas de Greenhouse que se consultan
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

# Límite de gasto

Cada análisis de una oferta llama a la API de Anthropic y cuesta dinero. El proyecto limita ese gasto en cuatro niveles, del más fino al más grueso. Ninguno se puede saltar desde la línea de comandos: para subir un límite hay que editar `.env` o el código.

## 1. Un solo análisis (`LIMITES_ANALISIS` en `src/agente.ts`)

| Tope | Valor | Para qué |
| --- | --- | --- |
| Tokens por respuesta del modelo | 16.384 | Una respuesta no puede crecer sin fin. Es el valor que LangChain ya usaba para Sonnet 5.5, ahora explícito. |
| Pasos del agente | 25 (unas 12 vueltas modelo → herramienta) | El agente no puede quedarse buscando en bucle. Es el valor que ya usaba LangGraph. |
| Tiempo | 3 minutos, con reintentos | Una llamada colgada no sigue cobrando ni bloquea la búsqueda. |
| Largo de la oferta | 30.000 caracteres | Una página pegada entera no se manda como oferta. Se rechaza con un mensaje, no se recorta en silencio. |
| Largo de la hoja de vida | 40.000 caracteres | Lo mismo. |
| Reintentos por llamada | 2 | Un error temporal no multiplica el gasto. |

## 2. Una corrida

- `npm run buscar`: como máximo **25 análisis** por búsqueda, aunque se pida más con `--analizar`. Si se acaba el presupuesto a mitad de camino, se detiene; las ofertas que faltan quedan «sin analizar» en el reporte.
- `npm run evaluar`: entre **1 y 5 repeticiones**. Antes de empezar estima el costo total (ofertas × repeticiones × costo promedio) y no arranca si no cabe: una evaluación a medias no sirve para comparar.

## 3. Presupuesto por día y por mes (`src/gasto.ts`)

- En `.env`: `LIMITE_USD_DIA` (por defecto US$ 2) y `LIMITE_USD_MES` (por defecto US$ 20).
- Lo gastado se anota en `memoria/gasto.json` después de cada análisis, en dólares, por día y en tu hora local. Ese archivo no se sube a git.
- **Antes** de cada análisis se revisa: lo gastado hoy (o este mes) **más** lo que suele costar un análisis no puede pasar el límite. Se frena antes de pasarse, no después.
  - «Lo que suele costar» es el promedio de tus análisis anteriores. Mientras no hay historial se usa US$ 0,15.
- El costo sale de los tokens reales que reporta la API, con los precios de la tabla `PRECIOS`:

  | Modelo | Entrada | Salida | Lectura de caché |
  | --- | --- | --- | --- |
  | Sonnet 5.5 | $2 | $10 | $0,20 |
  | Opus 5.5 | $4 | $20 | $0,20 |
  | Haiku 5.5 | $0,10 | $0,50 | $0,01 |

  Precios en dólares por millón de tokens, de octubre de 2026.

Siempre se cuenta de más, nunca de menos:
- un modelo que no está en la tabla se cobra al precio del más caro;
- un análisis que falla a mitad de camino (tiempo, pasos) se anota con el costo estimado, porque el gasto ya ocurrió;
- un análisis sin datos de uso también se anota con el estimado, nunca como gratis;
- si `memoria/gasto.json` está dañado, se detiene en vez de asumir que no se ha gastado nada;
- un valor inválido en `.env` es un error, no «sin límite».

`npm run olvidar` no borra el registro de gasto: olvidar ofertas no debe devolverte presupuesto.

## 4. El límite de la cuenta (lo tienes que poner tú)

Todo lo anterior protege a este proyecto. El tope que **no se puede saltar de ninguna forma** es el límite de gasto de tu cuenta de Anthropic: en la consola, ve a *Settings → Limits* y pon un límite mensual. Protege también si la llave se usa desde otro lado o si alguien la roba.

## Cuánto se puede pasar

El presupuesto frena **antes** de cada análisis, así que lo más que se puede pasar es la diferencia entre lo que costó el último análisis y el promedio. En el peor caso (un análisis que agota los 25 pasos con respuestas largas) eso son unos pocos dólares, y solo una vez: el siguiente análisis ya no arranca.

## Los agentes de Claude Code

Ningún agente del equipo puede subir el presupuesto. Ninguno edita `.env` ni `memoria/`, y el jefe te pregunta antes de una búsqueda con `--analizar` mayor a 10 o `--sin-cache` (ver [permisos-agentes.md](permisos-agentes.md)). Lo que gastan las propias sesiones de Claude Code es aparte y se ve en tu plan de Claude, no en este registro.

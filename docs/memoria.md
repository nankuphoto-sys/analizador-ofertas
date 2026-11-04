# Memoria entre sesiones

Qué recuerda el analizador de una ejecución a la siguiente, qué no recuerda nunca y por qué.

**Estado:** implementados el historial de ofertas (sección 3) y la caché de análisis (sección 4), en `src/memoria.ts`, con los comandos `npm run oferta` y `npm run olvidar`. Pendientes: preferencias de búsqueda (sección 1) y sugerencias para la hoja de vida (sección 5); la ruta de la hoja de vida (sección 2) se guarda pero todavía hay que pasarla en cada búsqueda.

## El principio que manda

El agente existe para **no inventar**: un requisito solo se cumple si la hoja de vida lo prueba. La memoria no puede romper eso. Por eso:

1. **La hoja de vida es la única fuente de verdad sobre el candidato.** La memoria nunca agrega habilidades, años ni niveles. Si el usuario dice "sí sé Docker", eso no se guarda como evidencia: se guarda como sugerencia de actualizar la hoja de vida.
2. **La memoria la escribe el código, no el modelo.** El modelo no tiene herramientas para guardar nada. Lo mismo que con el encaje, que se calcula en código.
3. **Solo se guarda lo que ahorra trabajo o lo que el usuario dijo explícitamente.** Nada inferido sobre la persona.

## Qué se guarda

### 1. Preferencias de búsqueda (las cambia solo el usuario)

| Campo | Ejemplo | Para qué |
| --- | --- | --- |
| `pais` | `"Colombia"` | Hoy está fijo en `prefiltro.ts`. Con esto el filtro de ubicación sirve para otros países. |
| `niveles` | `[1, 2]` | Qué niveles de Get on Board buscar. |
| `incluirSemiSenior` | `true` | Completar con semi senior si hay pocas junior (`--solo-junior` hoy). |
| `diasMaximo` | `30` | Antigüedad máxima de las ofertas. |
| `consultas` | `["react", "node", "next.js"]` | Palabras clave de búsqueda. |
| `modalidades` | `["fully_remote", "remote_local", "hybrid"]` | Qué modalidades acepta. |
| `salarioMinimoUSD` | `1200` o `null` | Descartar ofertas que publican un salario menor. `null` = no filtrar. |
| `excluirTecnologias` | `["SAP", "Salesforce"]` | Ofertas centradas en algo que no quiere hacer. |
| `excluirEmpresas` | `["Empresa X"]` | Empresas a las que no quiere postular. |
| `cuantasAnalizar` | `5` | Cuántas pasar por la IA (controla el gasto). |

Una opción de la línea de comandos (`--dias=60`) gana sobre la preferencia guardada solo en esa ejecución; para cambiar la preferencia hay un comando explícito (por ejemplo `npm run preferencias -- --dias=60`).

### 2. Hoja de vida en uso (solo la referencia, no el contenido)

| Campo | Para qué |
| --- | --- |
| `ruta` | No tener que escribirla en cada ejecución. |
| `hash` (SHA-256 del texto extraído) | Saber si la hoja de vida cambió, para invalidar los análisis guardados. |
| `actualizadaEl` | Mostrar "tus análisis son de una versión anterior de tu hoja de vida". |

El texto completo de la hoja de vida **no** se copia a la memoria: se vuelve a leer del archivo en cada ejecución. Ojo: los análisis guardados (sección 4) **sí** contienen fragmentos, porque cada requisito cumplido lleva su cita literal como evidencia y los consejos nombran tu experiencia ("el catálogo de Tiendas Aurora"). Es otra razón para que `memoria/` no salga nunca de tu computador.

### 3. Historial de ofertas (lo que el usuario decidió)

Por cada oferta vista, con su `id` de Get on Board:

| Campo | Valores | Para qué |
| --- | --- | --- |
| `estado` | `nueva`, `vista`, `guardada`, `postulada`, `descartada` | No mostrar de nuevo las descartadas ni las postuladas; marcar las nuevas en el reporte. |
| `vistaPorPrimeraVez` | fecha | Saber qué es nuevo desde la última búsqueda. |
| `cambiadoEl` | fecha | Orden e higiene. |
| `motivo` (opcional) | texto corto del usuario | "No es remoto de verdad". Solo si el usuario lo escribe. |

El estado lo cambia solo el usuario (por comando o desde el reporte), nunca el agente.

### 4. Caché de análisis (para no pagar dos veces lo mismo)

Clave: `id de la oferta` + `hash de la hoja de vida` + `versión del prompt`.
Valor: el `Resultado` ya verificado (requisitos, encaje, evidencias, consejos).

- La clave incluye también el **modelo** (`ANTHROPIC_MODEL`): otro modelo puede concluir distinto.
- Si cambia la hoja de vida, el prompt o el modelo, la clave cambia y se vuelve a analizar. No hace falta borrar nada a mano.
- La versión del prompt es un hash del texto de `instrucciones` + el esquema, calculado en código (`VERSION_PROMPT` en `src/agente.ts`), para que nadie tenga que acordarse de subir un número.
- Se borran solas, al empezar cada búsqueda, las entradas de ofertas publicadas hace más de 90 días y las que ya no corresponden a la hoja de vida, el prompt o el modelo actuales (nunca se volverían a usar).
- `--sin-cache` ignora lo guardado y vuelve a pedir el análisis al modelo; el resultado nuevo reemplaza al anterior.
- El modelo solo se llama para las mejores `--analizar` que no estén guardadas. Las demás candidatas con un análisis guardado lo muestran gratis.

### 5. Sugerencias para la hoja de vida (lo que el usuario dijo que sabe)

| Campo | Ejemplo |
| --- | --- |
| `habilidad` | `"Docker"` |
| `dichoEl` | fecha |
| `ofertasAfectadas` | ids donde salió como faltante |

**Esto nunca cambia un análisis.** Sirve para mostrar: "Dijiste que sabes Docker, pero tu hoja de vida no lo menciona. Aparece como faltante en 4 ofertas: agrégalo si es cierto." Se borra solo cuando la hoja de vida nueva ya lo incluye.

## Qué NO se guarda nunca

| No se guarda | Por qué |
| --- | --- |
| El texto de la hoja de vida | Es dato personal y ya vive en su archivo. Copiarlo crea dos versiones que se desincronizan. |
| Habilidades "declaradas" como evidencia | Rompe el principio de no inventar (ver sección 5). |
| Inferencias sobre la persona ("es junior", "le gusta el frontend") | Se recalculan de la hoja de vida y de las preferencias explícitas; una inferencia vieja no se corrige sola. |
| Datos de contacto, salario actual, edad, ubicación exacta | No los necesita ninguna función. Lo que no se guarda no se puede filtrar. |
| La API key | Vive en `.env`, que git ignora. |
| La conversación completa con el modelo | Solo importa el resultado verificado (caché, sección 4). |

## Dónde vive

- Un archivo JSON local: `memoria/memoria.json` en la carpeta del proyecto.
- **Debe ir en `.gitignore` antes de crear el archivo.** El repo es público en GitHub: subir la memoria publicaría el historial de postulaciones de la persona.
- Validado con Zod al leer, igual que la salida del modelo. Si el archivo está corrupto o es de un formato viejo, se avisa y se sigue sin memoria; nunca se borra solo.
- Lleva un campo `version` del formato, para poder migrarlo si cambia.

## Cómo la usa el agente

1. **Al empezar:** carga preferencias, hoja de vida en uso, historial y caché.
2. **Filtro sin IA:** salta las ofertas `descartada` y `postulada`; aplica país, modalidad, salario y exclusiones de las preferencias.
3. **Análisis con IA:** si la oferta tiene un análisis en caché con la clave actual, lo reutiliza; si no, lo pide al modelo y lo guarda.
4. **Reporte:** marca qué ofertas son nuevas desde la última búsqueda, cuáles se reutilizaron de la caché y las sugerencias de la sección 5.
5. **Al terminar:** guarda la caché y las ofertas nuevas como `vista`. No cambia preferencias ni estados de decisión.

## Cómo se borra

- `npm run olvidar -- --todo`: borra el archivo de memoria completo.
- `npm run olvidar -- --cache`: borra solo los análisis guardados (por ejemplo, para comparar un prompt nuevo).
- `npm run olvidar -- --oferta=<id>`: borra una oferta del historial y de la caché.

Borrar es siempre una acción explícita del usuario; el agente solo borra por su cuenta las entradas de caché vencidas (más de 90 días).

# Entornos: desarrollo, pruebas y producción

El proyecto no tiene servidor ni base de datos: lo que separa un entorno de otro son **las llaves, los datos y el modelo**. El entorno sale de la variable `APP_ENV`, que ponen los scripts de `package.json`. Sin `APP_ENV` es **desarrollo**, que no tiene llave a propósito: olvidar poner algo nunca toca producción.

| | Desarrollo | Pruebas | Producción |
| --- | --- | --- | --- |
| Para qué | Cambiar código (`npm test`, `npm run typecheck`) | Validar con la IA antes de mezclar (`npm run evaluar`) | Tu búsqueda real |
| `APP_ENV` | (vacío) | `test` | `production` |
| Archivo de llaves | no se lee; la llave se borra aunque esté en el sistema | `.env.test` | `.env.production` (obligatorio) |
| Hoja de vida | `ejemplos/hoja-de-vida-laura.txt` | la misma, ficticia | la tuya, fuera del repositorio |
| Memoria y gasto | `datos/development/memoria/` | `datos/test/memoria/` | `memoria/` (donde siempre estuvo) |
| Reportes | `datos/development/salidas/` | `datos/test/salidas/` | `salidas/` |
| Límite de gasto sugerido | no aplica (no hay llave) | día 3 / mes 5 USD | día 2 / mes 20 USD |

Las únicas URLs externas son las APIs de las fuentes (Get on Board, Remotive, Greenhouse) y la de Anthropic, y son las mismas en los tres entornos: no hay ambiente de prueba de esos servicios. Para no gastar ni molestar a las fuentes, desarrollo usa `--analizar=0 --prueba`. Remotive pide no consultarla más de 4 veces al día.

## Comandos

| Quiero… | Comando |
| --- | --- |
| Pruebas y tipos | `npm test`, `npm run typecheck` |
| Probar el filtro sin IA | `npm run buscar -- ejemplos/hoja-de-vida-laura.txt --analizar=0 --prueba` |
| Evaluar el agente (gasta) | `npm run evaluar -- 1` (siempre en pruebas; en producción se niega) |
| Probar a mano con la IA | `npm run buscar:test -- ...`, `npm run analizar:test -- ...` |
| Mi búsqueda real | `npm run buscar:prod -- mi-hoja-de-vida.pdf` |
| Marcar una oferta real | `npm run oferta:prod -- <id> postulada` |
| Borrar mi historial real | `npm run olvidar:prod -- --todo --confirmar` |

Cada comando imprime al arrancar en qué entorno corre y dónde están sus datos.

## Primera vez

1. Renombra tu `.env` actual a `.env.production` (es la llave real).
2. Crea `.env.test` a partir de `.env.example`, con **otra** llave y los límites de pruebas. Lo ideal es que sea de otro workspace de la consola de Anthropic, con su propio límite.
3. Tus datos reales no se mueven: `memoria/` y `salidas/` siguen donde estaban y ahora son los de producción.

## Cómo evitar tocar producción por error

- **Producción es explícita.** Solo los scripts `*:prod` la usan. Sin `APP_ENV`, el programa corre en desarrollo.
- **Producción exige su archivo.** Sin `.env.production` el comando se detiene.
- **El archivo del entorno manda.** Si el sistema ya tenía una `ANTHROPIC_API_KEY`, `.env.test` y `.env.production` la reemplazan; desarrollo la descarta.
- **Datos separados.** Pruebas y desarrollo no comparten memoria ni gasto con producción: marcar una oferta en pruebas no la oculta en tu búsqueda real, y una evaluación no gasta tu presupuesto real.
- **`olvidar --todo` en producción pide `--confirmar`.**
- **Los agentes de Claude Code** usan `:prod` (el jefe) o desarrollo (el auditor de fuentes). Ninguno lee `.env.*` ni escribe en `memoria/` ni en `datos/` (ver [permisos-agentes.md](permisos-agentes.md)). El jefe no corre `buscar:test` ni `evaluar`.
- **Hojas de vida reales** no se suben: `.gitignore` excluye `*.pdf` y `*.docx`.

## De un entorno al siguiente

1. En una rama: `npm test` y `npm run typecheck`. Gratis y sin IA.
2. Si cambiaste el prompt, el modelo o el prefiltro: `npm run evaluar -- 1` (4 análisis, unos US$ 0,4 a 0,8) y `-- 3` si cambió el prompt.
3. Mezcla a `main`.
4. En tu máquina: `git pull` y `npm ci`.

Cambiar el prompt o el modelo invalida la caché de producción (la clave de caché los incluye, ver `src/memoria.ts`): las ofertas se vuelven a analizar y se pagan otra vez. Es costo, no error.

## Pendiente

- **Workspaces de Anthropic (tú, en la consola).** La documentación de Anthropic confirma que cada workspace tiene su propia llave y su propio límite mensual de gasto, y que no se puede poner límite al workspace «Default». Crea uno para pruebas y otro para producción en `platform.claude.com/settings/workspaces`, con *Spend limits* en cada uno, y crea la llave de cada entorno dentro de su workspace.
- **CI.** `.github/workflows/ci.yml` corre `npm ci`, `npm run typecheck` y `npm test` en cada pull request y en `main`. Todavía no se ejecutó en GitHub (no está subido): la primera corrida en Linux dirá si alguna prueba depende de Windows.
- **Protección de `main`.** El repo es público, así que GitHub Free permite protección de ramas. Actívala después de la primera corrida del CI, exigiendo el chequeo `pruebas`. No la configuré yo: cambia ajustes de tu repositorio.

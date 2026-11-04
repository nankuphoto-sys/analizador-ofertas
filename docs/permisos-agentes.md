# Permisos de los agentes

Cada agente tiene acceso solo a lo que necesita para su tarea. Esto se aplica en tres capas, de la más general a la más fina. Quién manda a quién está en [jerarquia-agentes.md](jerarquia-agentes.md); cómo se pasan información, en [comunicacion-agentes.md](comunicacion-agentes.md).

## Las tres capas

1. **Herramientas** (campo `tools:` de cada agente). Un agente no puede usar una herramienta que no está en su lista, y eso incluye cualquier herramienta MCP.
2. **Rutas, comandos y dominios** (hook `.claude/hooks/permisos.mjs`, registrado en `.claude/settings.json`). Antes de cada llamada revisa qué archivo, qué comando o qué dominio toca el agente. Si no está en su lista, la bloquea y le dice por qué.
   - Sabe qué agente hace la llamada por el campo `agent_type` que Claude Code le envía. En tu sesión normal ese campo no viene, y el hook no hace nada.
   - Nunca aprueba nada por su cuenta: solo puede bloquear o pedirte permiso. Si falla, bloquea.
3. **Base para todo el proyecto** (`.claude/settings.json`). Aplica a cualquier sesión de Claude Code en este proyecto, aunque no se use el equipo:
   - nadie lee ni escribe `.env`, ni edita `memoria/` a mano;
   - borrar la memoria, correr la evaluación (cuesta dinero) o editar el equipo de agentes siempre te pide permiso.

## Qué puede hacer cada uno

| Agente | Herramientas | Lee | Escribe | Comandos | Web |
| --- | --- | --- | --- | --- | --- |
| **analizador-ofertas** (jefe) | Agent(4 miembros), Bash, Read, Grep, Glob, Edit, Write | todo el proyecto menos `.env` y `.claude/` | `src/**/*.ts`, `tests/**/*.ts`, `greenhouse-empresas.json` | `npm run buscar/analizar/oferta/olvidar/typecheck` (y sus variantes `:prod`; ver [entornos.md](entornos.md)), `npm test` | no |
| **auditor-fuentes** | Read, Grep, Bash, Edit, WebFetch | `src/fuentes/`, sus pruebas, `greenhouse-empresas.json`, `package.json` | lo mismo, menos `package.json` | solo la búsqueda de prueba, `typecheck` y `npm test` | solo getonbrd.com, remotive.com, greenhouse.io |
| **afinador-prefiltro** | Read, Glob | `src/prefiltro.ts`, su prueba, `salidas/busqueda-*.md`, `memoria/memoria.json` | nada | ninguno | no |
| **explorador-plataformas** | WebSearch, WebFetch, Read | `src/fuentes/`, `greenhouse-empresas.json` | nada | ninguno | sí (es su trabajo) |
| **preparador-postulacion** | Read, Write | análisis y reportes de `salidas/`, `ejemplos/`, y la hoja de vida (pdf/txt/md/docx, también fuera del proyecto, nunca en carpetas ocultas) | solo `salidas/postulaciones/*.md` | ninguno | no |

Lo que el jefe puede correr pero **te pregunta antes** (el hook responde «ask»):
- `npm run oferta -- <id> postulada|descartada|guardada`;
- `npm run olvidar`;
- `npm run buscar` con `--sin-cache` o con `--analizar` mayor a 10.

## Decisiones y por qué

- **El auditor prueba con la hoja de vida de ejemplo, con `--analizar=0 --prueba`.** Para saber si una fuente responde no hacen falta tus datos ni la IA. `--prueba` no guarda la memoria ni el reporte. Antes, cada prueba del auditor marcaba ofertas como vistas (perdías los 🆕) y dejaba un reporte que el afinador habría leído como si fuera tuyo.
- **El explorador no ve tu hoja de vida, tu memoria ni tus reportes.** Navega la web libremente, y es el agente más expuesto a contenido externo: una página podría traer instrucciones escondidas. Por eso no tiene nada tuyo que pueda filtrar.
- **El afinador lee la memoria**, porque necesita tus decisiones y sus motivos. La memoria también guarda citas de tu hoja de vida en el caché de análisis. Es el costo aceptado, y el afinador no tiene web ni puede escribir, así que no puede sacarlas del proyecto.
- **Nadie edita `.claude/` ni `equipo-agentes/`.** Un agente que pudiera editar su propia configuración podría darse más permisos.
- **Los comandos no pueden encadenar ni redirigir** (`;`, `&&`, `|`, `>`, `$`, comillas invertidas). Así un comando permitido no puede esconder otro detrás.
- **Se quitaron herramientas que no se usaban:** Glob al auditor, Grep al afinador, y Grep y Glob al explorador.

## El agente del programa (`src/agente.ts`)

El agente que analiza ofertas ya tiene lo mínimo: una sola herramienta, `buscar_en_hoja_de_vida`, que solo lee las líneas de la hoja de vida que ya están cargadas en memoria. No tiene acceso a archivos, red ni comandos. Las fuentes de ofertas y la memoria las maneja el código, no el modelo. No hubo nada que cambiar.

## Límites conocidos

- **Las reglas del jefe solo aplican si lo arrancas con `claude --agent analizador-ofertas`.** Si usas los comandos (`/buscar-ofertas`, etc.) desde una sesión normal, Claude Code no marca esa sesión como el jefe: solo la protege la base de `.claude/settings.json`, y tú apruebas cada acción como siempre. A los cuatro miembros el control se les aplica siempre.
- **Lo verificado en vivo y lo que no** (4 nov 2026). Con el explorador real se confirmó que el hook de `settings.json` bloquea la hoja de vida y la memoria y deja leer `src/fuentes/`. El hook declarado en el frontmatter de un agente no se ejecutó en esa sesión: por eso los miembros no dependen de él. El jefe lo conserva como refuerzo para `--agent`, pero eso no se probó.
- **Cambios en `.claude/agents/` se cargan al abrir una sesión nueva** de Claude Code. Los de `.claude/settings.json` se cargan en vivo.
- **El hook revisa rutas, no lo que hace un comando por dentro.** `npm run buscar` lee tu hoja de vida y consulta las fuentes; eso lo hace el código del proyecto, no el agente.

## Cómo cambiar un permiso

Edita `POLITICAS` en `equipo-agentes/hooks/permisos.mjs`, agrega su caso en `tests/permisos.test.mjs`, corre `npm test` y copia `equipo-agentes/` a `.claude/` (`xcopy equipo-agentes .claude /E /I /Y`).

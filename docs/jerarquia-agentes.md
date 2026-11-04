# Jerarquía del equipo de agentes

Quién manda a quién en el equipo de Claude Code del Analizador de ofertas. Los agentes están en `equipo-agentes/agents/` y se copian a `.claude/agents/` (ver el README).

## Organigrama

```
                 Usuario
                   │  aprueba lo irreversible
                   ▼
          analizador-ofertas  (jefe)
     corre búsqueda y análisis, delega, resume
   ┌──────────┬─────────┴──────┬────────────────┐
   ▼          ▼                ▼                ▼
auditor-   afinador-      explorador-     preparador-
fuentes    prefiltro      plataformas     postulacion
```

- El **jefe** es el agente principal de la sesión (`claude --agent analizador-ofertas`). Es el único que habla con el usuario y el único que puede llamar a los demás.
- Los **miembros** son subagentes: responden solo al jefe, no se llaman entre sí y no hablan con el usuario.

La herramienta ya impone esta forma:
- en Claude Code un subagente no puede lanzar otro subagente;
- el campo `tools: Agent(...)` del jefe limita a cuáles de los cuatro puede llamar.

## Quién decide qué

| Decisión | Quién decide | Quién la ejecuta |
| --- | --- | --- |
| Postularse a una oferta | Usuario | Usuario (nadie del equipo envía nada) |
| Marcar una oferta como postulada/descartada/guardada | Usuario | Jefe (`npm run oferta`) |
| Cambiar código (prefiltro, fuentes, nuevas fuentes) | Usuario | Jefe, o el auditor de fuentes en su carpeta, después del «sí» |
| Conectar o quitar una fuente | Usuario | Jefe |
| Borrar la memoria o el caché | Usuario | Jefe (`npm run olvidar`) |
| Gastar de más (`--analizar` > 10, `--sin-cache`) | Usuario | Jefe |
| Qué miembro trabaja y en qué orden | Jefe | Jefe |
| Encaje de una oferta (cumple / parcial / no cumple) | El programa (`src/agente.ts` + `src/verificar.ts`) | Nadie lo cambia a mano |

## Qué puede tocar cada uno

| Agente | Lee | Escribe | Nunca |
| --- | --- | --- | --- |
| analizador-ofertas | todo el proyecto | código ya aprobado, memoria vía `npm run oferta` | enviar postulaciones |
| auditor-fuentes | `src/fuentes/`, docs de las APIs | `src/fuentes/` después de la aprobación | `src/prefiltro.ts`, `memoria/` |
| afinador-prefiltro | `src/prefiltro.ts`, `salidas/`, `memoria/` | nada (solo propone un diff) | aplicar el diff |
| explorador-plataformas | la web, `src/fuentes/` | nada (solo fichas) | saltarse logins, captchas o términos |
| preparador-postulacion | hoja de vida, análisis en `salidas/` | `salidas/postulaciones/` | afirmar algo que el análisis marca «no cumple», enviar |

## Reglas de escalamiento

1. **Arriba solo sube lo irreversible o lo que sale del proyecto.** Un miembro nunca le pide algo al usuario: le entrega su propuesta al jefe, y el jefe pregunta.
2. **Conflicto entre miembros → lo decide el usuario.** El jefe muestra las dos propuestas con sus razones y no elige por su cuenta.
3. **La evidencia manda sobre la opinión.** La hoja de vida y el análisis verificado pesan más que lo que diga cualquier agente, el jefe incluido.
4. **Si un miembro falla**, el jefe reintenta una vez con instrucciones más precisas. Si vuelve a fallar, avisa al usuario. Nunca rellena él el resultado faltante.

## Por qué así

- El análisis, la parte que puede inventar, se queda en código con verificación literal de citas. Ningún agente del equipo puede subir un encaje.
- Un solo interlocutor evita que el usuario reciba cuatro voces con propuestas sin coordinar.
- Los miembros con permisos de solo lectura (afinador, explorador) no pueden romper nada aunque se equivoquen.

# Comunicación del equipo de agentes

Cómo se pasan información el jefe (`analizador-ofertas`) y los cuatro miembros. La jerarquía (quién manda a quién) está en [jerarquia-agentes.md](jerarquia-agentes.md).

## Regla base: todo pasa por el jefe

```
          ┌───────── encargo ─────────┐
  jefe ───┤                            ├──► miembro
          └◄──────── entrega ─────────┘
              (miembros: nunca entre sí)
```

- Los miembros **no se hablan entre ellos**. Si lo que encontró uno le sirve a otro, el jefe lo recibe en la entrega y lo incluye en el siguiente encargo.
- Un miembro **no recuerda** la conversación del jefe ni lo que hizo antes. Cada encargo tiene que traer todo lo que necesita.
- Los **datos grandes viajan por ruta, no copiados**: el jefe pasa `salidas/busqueda-2026-11-04-0930.md`, no el reporte pegado. Así no se gasta contexto y nadie trabaja sobre una copia vieja.

## Encargo (jefe → miembro)

El jefe escribe siempre estas seis partes, en este orden:

```
TAREA: una frase con lo que hay que lograr.
ENTRADAS: rutas de archivos, id de la oferta, comando que falló con su error.
CONTEXTO: lo que ya se sabe y el miembro no puede deducir (qué decidió el usuario, qué ya se probó).
LÍMITES: qué no tocar y qué está aprobado. Si no dice «aprobado», nada lo está.
ENTREGA: qué devolver (ver formato abajo) y dónde escribir, si escribe.
CIERRE: cuándo parar (por ejemplo «máximo 6 plataformas» o «si la API pide llave, para y avisa»).
```

## Entrega (miembro → jefe)

Cada miembro termina siempre con esta forma, y el jefe la lee antes que el resto del mensaje:

```
ESTADO: listo | parcial | bloqueado
RESUMEN: máximo 5 líneas, lo que el jefe le dirá al usuario.
EVIDENCIA: de dónde sale cada afirmación (archivo:línea, URL, salida de un comando). Lo no comprobado va como «no verificado».
PROPUESTAS: cambios que necesitan el «sí» del usuario (diff, fuente a conectar o quitar). Vacío si no hay.
PARA OTRO MIEMBRO: datos que le sirven a otro miembro, con su nombre. Vacío si no hay.
ARCHIVOS: rutas que escribió o modificó. Vacío si no escribió nada.
```

- `bloqueado` significa que no puede seguir sin algo que no tiene (una llave, un permiso, una decisión del usuario). Lo que falta va en el resumen.
- **PARA OTRO MIEMBRO** es el único canal entre miembros. El jefe decide si lo pasa y cuándo; nunca lo pasa sin leerlo.

## Archivos compartidos (el tablón)

| Archivo | Lo escribe | Lo leen |
| --- | --- | --- |
| `salidas/busqueda-*.md` (reportes) | el programa (`npm run buscar`) | jefe, afinador, preparador |
| análisis en `salidas/` | el programa (`npm run analizar`) | jefe, preparador |
| `memoria/memoria.json` | solo el programa (`npm run oferta`), por orden del jefe | jefe, afinador (solo lectura) |
| `salidas/postulaciones/*.md` | preparador | jefe (y el usuario) |
| `src/fuentes/`, `greenhouse-empresas.json` | jefe, o auditor con aprobación | explorador, auditor |

Ningún agente edita a mano `memoria/memoria.json` ni los reportes del programa.

## Qué información recibe cada miembro

Cada miembro recibe solo lo que necesita (privacidad del usuario y menos ruido):

| Miembro | Recibe | No recibe |
| --- | --- | --- |
| auditor-fuentes | qué fuente falló, el error, la ruta de la hoja de vida para correr la búsqueda | el contenido de la hoja de vida, la memoria |
| afinador-prefiltro | rutas de reportes y de la memoria | la hoja de vida completa (le basta el stack que ya está en `src/prefiltro.ts` y en los reportes) |
| explorador-plataformas | el perfil resumido (stack, nivel, país, inglés) | la hoja de vida, la memoria, los reportes |
| preparador-postulacion | la ruta de la hoja de vida, la oferta, su análisis y lo que el usuario dijo | la memoria de otras ofertas |

Nadie recibe nunca el contenido de `.env`, llaves de API ni contraseñas.

## Flujos entre miembros (siempre vía jefe)

1. **Plataforma nueva → fuente que funciona.** El explorador entrega fichas → el usuario aprueba una → el jefe crea `src/fuentes/<nombre>.ts` → el auditor recibe «verifica la fuente nueva» y entrega si responde y cuántas ofertas trae.
2. **Fuente con datos raros → prefiltro.** El auditor ve que una fuente no trae el nivel o la modalidad y lo pone en *PARA OTRO MIEMBRO: afinador-prefiltro*. El jefe se lo pasa al afinador en el siguiente encargo.
3. **Búsqueda → postulación.** El programa escribe el reporte y el análisis → el usuario escoge una oferta → el jefe encarga al preparador con las rutas del análisis y de la hoja de vida → el preparador escribe el borrador en `salidas/postulaciones/`.
4. **Decisiones del usuario → prefiltro.** El jefe corre `npm run oferta` con lo que el usuario decidió → la memoria acumula motivos → cada 10 decisiones nuevas el jefe encarga al afinador.

## Cuando algo sale mal

- **Entrega sin el formato o sin evidencia:** el jefe la devuelve una vez pidiendo lo que falta. Si vuelve igual, le dice al usuario qué no pudo verificar.
- **Dos entregas que se contradicen:** el jefe no las mezcla ni elige; le muestra las dos al usuario.
- **Un miembro pide algo al usuario dentro de su entrega:** el jefe lo convierte en su propia pregunta y le da al usuario el contexto.

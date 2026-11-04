# La regla que ningún agente cruza

> **Ningún agente afirma sobre el candidato algo que su hoja de vida no pruebe.**

Es la regla que justifica el proyecto: una postulación con una experiencia inventada le hace más daño al candidato que una con un hueco honesto. Por eso no se confía solo en que el modelo la siga. **Se comprueba en código** en cada lugar donde un agente escribe algo sobre el candidato, con el mismo mecanismo en todos: la afirmación lleva una cita, y la cita tiene que aparecer letra por letra en la hoja de vida (`contieneFrase` en `src/hojaDeVida.ts`).

## Dónde se comprueba

| Dónde se afirma algo del candidato | Quién lo escribe | Cómo se comprueba | Si la cita no está |
| --- | --- | --- | --- |
| Requisito «cumple» o «parcial» | modelo (`src/agente.ts`) | `verificarRequisitos` (`src/verificar.ts`) | pasa a «no cumple» y se avisa |
| Consejo de «qué destacar» | modelo | `verificarConsejos` (`src/verificar.ts`) | el consejo se quita y se avisa; los válidos se muestran con su cita |
| Palabras clave «faltantes» | modelo | `filtrarPalabrasFaltantes` | si sí está en la hoja de vida, se quita de faltantes |
| Carta y respuestas de postulación | `preparador-postulacion` | `npm run verificar-carta` (`src/carta.ts`), que corre el jefe | el borrador vuelve al preparador; nunca se muestra como listo |
| Encaje (%) | nadie | se calcula en código con los requisitos ya verificados | — |

Lo que el código deja pasar, siempre se puede rastrear: cada requisito, consejo y frase de carta aprobada trae su cita de la hoja de vida.

## Por qué así y no solo con instrucciones

- El modelo sigue las instrucciones casi siempre, pero «casi siempre» no alcanza cuando el error es una postulación con un dato falso.
- Una verificación literal es simple de explicar y de probar. No necesita otro modelo que juzgue, que también se podría equivocar.
- Cuando la cita no está, el resultado es **más conservador**: un «no cumple», un consejo menos, una carta que vuelve. Nunca lo contrario.

## Lo que la regla no cubre (límites conocidos)

- **Una frase puede ir más allá de su cita.** Si la cita dice «Construí el catálogo con React» y la frase dice «lideré el catálogo», la cita pasa igual. Por eso:
  - el prompt prohíbe poner en un consejo años, niveles o resultados que la cita no diga;
  - `verificar-carta` te muestra aparte las frases con cifras o tecnologías que no traen cita, para que las revises tú.
- **Una frase sin marca no se comprueba.** El preparador debe marcar cada frase sobre el candidato, pero si no lo hace, el código no sabe que esa frase hablaba de él. `verificar-carta` rechaza un borrador sin ninguna marca y señala las frases sospechosas. La revisión final antes de enviar siempre es tuya.
- **Los resúmenes del jefe en el chat** siguen la regla por instrucción (`equipo-agentes/agents/analizador-ofertas.md`), no por código. Lo que dice del candidato debe salir del análisis verificado.

## Cómo se prueba

- `tests/verificar.test.ts`: requisitos y consejos con cita inventada se rechazan.
- `tests/carta.test.ts`: citas inventadas, frases sin cita y la sección de dudas.
- `npm run evaluar`: la métrica «invenciones» (requisitos dados por cumplidos sin estar en la hoja de vida) tiene que seguir en 0.

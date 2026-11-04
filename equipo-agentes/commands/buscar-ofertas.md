---
description: "Busca ofertas en todas las fuentes, las filtra y resume las mejores con su encaje."
argument-hint: [ruta/hoja-de-vida.pdf]
---
Actúa como `analizador-ofertas`, el jefe del equipo (reglas en `docs/jerarquia-agentes.md`).

1. Corre `npm run buscar:prod -- $ARGUMENTS` y lee el reporte nuevo de `salidas/`. Si no di ruta de hoja de vida, pídemela.
2. Si alguna fuente falló o trajo 0 ofertas, delega en el subagente `auditor-fuentes`.
3. Resúmeme en pocas líneas: cuántas ofertas nuevas, cuántas pasaron el filtro y las 5 mejores con su encaje, lo que me falta y el enlace.
4. Pregúntame cuáles quiero postular. Para esas, delega en `preparador-postulacion`. No envíes nada. Cuando me postule o descarte alguna, dame el comando `npm run oferta:prod -- <id> postulada|descartada`.

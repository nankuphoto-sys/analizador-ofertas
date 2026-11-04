import { rm } from "node:fs/promises";
import { cargarMemoria, guardarMemoria, olvidar, RUTA_MEMORIA } from "./memoria.js";

/**
 * Borra memoria a pedido del usuario. El agente nunca borra nada por su cuenta salvo los análisis vencidos.
 *
 * Uso: npm run olvidar -- --todo            borra el archivo de memoria completo
 *      npm run olvidar -- --cache           borra solo los análisis guardados
 *      npm run olvidar -- --oferta=<id>     borra una oferta del historial y sus análisis
 */
const args = process.argv.slice(2);
const ofertaId = args.find((a) => a.startsWith("--oferta="))?.slice("--oferta=".length);

if (args.includes("--todo")) {
  await rm(RUTA_MEMORIA, { force: true });
  console.log(`Memoria borrada (${RUTA_MEMORIA}).`);
  process.exit(0);
}
if (!args.includes("--cache") && !ofertaId) {
  console.error("Uso: npm run olvidar -- --todo | --cache | --oferta=<id>");
  process.exit(1);
}

const { memoria, aviso } = await cargarMemoria();
if (aviso) {
  console.error(`${aviso}\nSolo se puede usar --todo con un archivo que no se puede leer.`);
  process.exit(1);
}
if (ofertaId && !(ofertaId in memoria.ofertas)) console.warn(`La oferta "${ofertaId}" no estaba en el historial.`);

const antes = Object.keys(memoria.cache).length;
const nueva = olvidar(memoria, { cache: args.includes("--cache"), ofertaId });
await guardarMemoria(nueva);
console.log(`Listo. Análisis borrados: ${antes - Object.keys(nueva.cache).length}.${ofertaId ? ` Oferta quitada del historial: ${ofertaId}.` : ""}`);

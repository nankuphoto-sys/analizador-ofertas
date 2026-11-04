import { cambiarEstado, cargarMemoria, ESTADOS_OFERTA, type EstadoOferta, guardarMemoria } from "./memoria.js";

/**
 * Marca tu decisión sobre una oferta, o lista el historial.
 *
 * Uso: npm run oferta -- <id> postulada|descartada|guardada|vista [--motivo="no es remoto de verdad"]
 *      npm run oferta -- --lista [--estado=postulada]
 *
 * Las postuladas y descartadas dejan de aparecer en `npm run buscar`.
 */
const args = process.argv.slice(2);
const opcion = (nombre: string) => args.find((a) => a.startsWith(`--${nombre}=`))?.split("=").slice(1).join("=");
const [id, estado] = args.filter((a) => !a.startsWith("--"));

const { memoria, escribible, aviso } = await cargarMemoria();
if (aviso) {
  console.error(aviso);
  process.exit(1);
}

if (args.includes("--lista")) {
  const filtro = opcion("estado");
  const filas = Object.entries(memoria.ofertas)
    .filter(([, o]) => !filtro || o.estado === filtro)
    .sort(([, a], [, b]) => b.cambiadoEl.localeCompare(a.cambiadoEl));
  if (filas.length === 0) console.log("No hay ofertas en el historial con ese filtro.");
  for (const [ofertaId, o] of filas) {
    console.log(`${o.estado.padEnd(10)} ${o.cambiadoEl.slice(0, 10)}  ${o.titulo} — ${o.empresa}${o.motivo ? `  (${o.motivo})` : ""}\n           ${ofertaId}`);
  }
  process.exit(0);
}

if (!id || !estado || !ESTADOS_OFERTA.includes(estado as EstadoOferta)) {
  console.error(`Uso: npm run oferta -- <id> ${ESTADOS_OFERTA.join("|")} [--motivo="..."]\n     npm run oferta -- --lista [--estado=postulada]`);
  process.exit(1);
}

try {
  const nueva = cambiarEstado(memoria, id, estado as EstadoOferta, new Date(), opcion("motivo"));
  if (escribible) await guardarMemoria(nueva);
  const o = nueva.ofertas[id];
  console.log(`"${o.titulo}" — ${o.empresa}: ${estado}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

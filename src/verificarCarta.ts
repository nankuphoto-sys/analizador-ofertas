import { readFile, writeFile } from "node:fs/promises";
import { revisarCarta } from "./carta.js";
import { leerDocumento } from "./documentos.js";

/**
 * Revisa un borrador del preparador de postulaciones: cada [[cita]] tiene que estar en la hoja de vida.
 * Si todas están, escribe la versión lista (sin marcas) al lado del borrador. Nunca envía nada.
 *
 * Uso: npm run verificar-carta -- salidas/postulaciones/<empresa>-<fecha>.md ruta/hoja-de-vida.pdf
 */
const [rutaBorrador, rutaHojaDeVida] = process.argv.slice(2);
if (!rutaBorrador || !rutaHojaDeVida) {
  console.error("Uso: npm run verificar-carta -- salidas/postulaciones/<borrador>.md ruta/hoja-de-vida.pdf");
  process.exit(1);
}

const [borrador, hojaDeVida] = await Promise.all([readFile(rutaBorrador, "utf8"), leerDocumento(rutaHojaDeVida)]);
const { verificadas, faltantes, sinCita, limpia } = revisarCarta(borrador, hojaDeVida);

if (verificadas.length + faltantes.length === 0) {
  console.error("El borrador no marca ninguna afirmación con [[cita]]. No se puede comprobar: vuelve al preparador.");
  process.exit(1);
}
if (faltantes.length > 0) {
  console.error(`${faltantes.length} cita(s) no aparecen en la hoja de vida. El borrador vuelve al preparador:`);
  for (const c of faltantes) console.error(`  ✘ [[${c}]]`);
  process.exit(1);
}

const destino = rutaBorrador.replace(/\.md$/i, "") + "-lista.md";
await writeFile(destino, limpia);
console.log(`✔ ${verificadas.length} cita(s) comprobadas en la hoja de vida. Versión lista en ${destino}`);
if (sinCita.length > 0) {
  console.log("Revisa tú estas frases: nombran cifras o tecnologías y no traen cita.");
  for (const f of sinCita) console.log(`  · ${f}`);
}

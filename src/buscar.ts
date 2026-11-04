import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analizarOferta } from "./agente.js";
import { opcionEntera } from "./argumentos.js";
import { leerDocumento } from "./documentos.js";
import type { Resultado } from "./esquema.js";
import { buscarEnGetOnBoard, NIVELES, type Oferta } from "./fuentes/getonbrd.js";
import { prefiltrar, type Candidata } from "./prefiltro.js";
import { celda, nombreReporte } from "./reporte.js";

/**
 * Busca ofertas en Get on Board, se queda con las de nivel junior (y semi senior si hace falta)
 * que se pueden postular desde Colombia, las ordena sin IA por coincidencia con la hoja de vida
 * y analiza con el modelo solo las mejores.
 *
 * Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior]
 *      [--consultas="full stack,react,node,next.js,javascript,typescript,inteligencia artificial"]
 */
const args = process.argv.slice(2);
const opcion = (nombre: string) => args.find((a) => a.startsWith(`--${nombre}=`))?.split("=").slice(1).join("=");
const rutaHojaDeVida = args.find((a) => !a.startsWith("--"));
let cuantasAnalizar: number;
let dias: number;
try {
  cuantasAnalizar = opcionEntera(args, "analizar", 5);
  dias = opcionEntera(args, "dias", 30);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const soloJunior = args.includes("--solo-junior");
const consultas = (opcion("consultas") ?? "full stack,fullstack,react,node,next.js,javascript,typescript,frontend,backend,inteligencia artificial,junior")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

if (!rutaHojaDeVida) {
  console.error('Uso: npm run buscar -- ruta/hoja-de-vida.pdf [--analizar=5] [--dias=30] [--solo-junior]');
  process.exit(1);
}
if (cuantasAnalizar > 0 && !process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY (o usa --analizar=0 para ver solo el filtro sin IA).");
  process.exit(1);
}

const hojaDeVida = await leerDocumento(rutaHojaDeVida);

// 1. Descargar
const todas: Oferta[] = [];
let fallidas = 0;
for (const consulta of consultas) {
  try {
    const encontradas = await buscarEnGetOnBoard(consulta);
    todas.push(...encontradas);
    console.log(`"${consulta}": ${encontradas.length} ofertas`);
  } catch (error) {
    fallidas++;
    console.warn(`No se pudo buscar "${consulta}": ${error instanceof Error ? error.message : error}`);
  }
}
// Si ninguna consulta respondió es un problema de conexión, no "no hay ofertas".
if (fallidas === consultas.length) {
  console.error("\nNinguna búsqueda respondió. Revisa tu conexión a internet o si Get on Board está caído.");
  process.exit(1);
}

// 2. Filtrar sin IA: primero junior y sin experiencia; si hay pocas, se suma semi senior.
let candidatas = prefiltrar(todas, hojaDeVida, { niveles: [1, 2], diasMaximo: dias });
const juniors = candidatas.length;
if (!soloJunior && candidatas.length < Math.max(cuantasAnalizar, 5) * 2) {
  candidatas = [...candidatas, ...prefiltrar(todas, hojaDeVida, { niveles: [3], diasMaximo: dias })];
}
console.log(
  `\n${new Set(todas.map((o) => o.id)).size} ofertas distintas → ${juniors} junior/sin experiencia y ` +
    `${candidatas.length - juniors} semi senior que se pueden postular desde Colombia (últimos ${dias} días).`,
);
if (candidatas.length === 0) {
  console.log("No hay ofertas que cumplan los filtros. Prueba con --dias=60 o con otras --consultas.");
  process.exit(0);
}

// 3. Analizar con IA solo las mejores (las juniors ya van primero dentro de su puntaje).
const elegidas = candidatas.slice(0, cuantasAnalizar);
const analisis = new Map<string, Resultado>();
for (const [i, c] of elegidas.entries()) {
  process.stdout.write(`Analizando ${i + 1}/${elegidas.length}: ${c.oferta.titulo}... `);
  try {
    analisis.set(c.oferta.id, await analizarOferta(c.oferta.texto, hojaDeVida));
    console.log(`${analisis.get(c.oferta.id)!.encaje} %`);
  } catch (error) {
    console.log(`falló (${error instanceof Error ? error.message : error})`);
  }
}

// 4. Reporte
const faltantes = (r: Resultado) =>
  r.requisitos.filter((q) => q.tipo === "obligatorio" && q.estado === "no_cumple").map((q) => q.requisito);
const fila = (c: Candidata, i: number) => {
  const r = analisis.get(c.oferta.id);
  const encaje = r ? `**${r.encaje} %**` : "sin analizar";
  return `| ${i + 1} | [${celda(c.oferta.titulo)}](${c.oferta.url}) | ${celda(c.oferta.empresa)} | ${NIVELES[c.oferta.nivel]} | ${celda(c.ubicacion)} | ${c.oferta.salario ?? "—"} | ${encaje} | ${c.puntaje} |`;
};
const ordenadas = [...candidatas].sort((a, b) => {
  const ea = analisis.get(a.oferta.id)?.encaje ?? -1;
  const eb = analisis.get(b.oferta.id)?.encaje ?? -1;
  return eb - ea || b.puntaje - a.puntaje;
});
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);
const lineas = [
  `# Búsqueda de ofertas — ${hoy}`,
  "",
  `Fuente: Get on Board · niveles: junior y sin experiencia${soloJunior ? "" : " (más semi senior si faltaban)"} · últimos ${dias} días · postulables desde Colombia.`,
  "",
  "| # | Oferta | Empresa | Nivel | Ubicación | Salario | Encaje (IA) | Coincidencia de stack |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...ordenadas.slice(0, 25).map(fila),
  "",
  "## Detalle de las analizadas",
];
for (const c of ordenadas.filter((x) => analisis.has(x.oferta.id))) {
  const r = analisis.get(c.oferta.id)!;
  lineas.push(
    "",
    `### ${c.oferta.titulo} — ${c.oferta.empresa} (${r.encaje} %)`,
    c.oferta.url,
    "",
    `- **Te falta (obligatorio):** ${faltantes(r).join("; ") || "nada"}`,
    `- **Palabras clave que no tienes:** ${r.palabras_clave_faltantes.join(", ") || "ninguna"}`,
    `- **Qué destacar:** ${r.que_destacar.join(" / ")}`,
    ...(r.advertencias.length ? [`- **Advertencias:** ${r.advertencias.join(" / ")}`] : []),
  );
}
await mkdir("salidas", { recursive: true });
const destino = join("salidas", nombreReporte(ahora));
await writeFile(destino, lineas.join("\n"));

console.log("\nMejores resultados:");
for (const [i, c] of ordenadas.slice(0, 10).entries()) {
  const r = analisis.get(c.oferta.id);
  console.log(
    `${String(i + 1).padStart(2)}. ${r ? `${r.encaje} %`.padStart(5) : "  —  "} · ${NIVELES[c.oferta.nivel]} · ${c.oferta.titulo} — ${c.oferta.empresa}\n      ${c.ubicacion} · ${c.oferta.url}`,
  );
}
console.log(`\nReporte completo en ${destino}`);
